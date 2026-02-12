import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CronJob } from 'cron';
import Redis from 'ioredis';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class MonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorService.name);
  private abandonedJobsRecovered = 0;
  private jobsDeleted = 0;
  private redis: Redis;

  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
  ) {
    // Create Redis client for stats reading
    const redisConfig = this.configService.get('queue.redis');
    this.redis = new Redis(redisConfig);
  }

  onModuleInit() {
    // Register abandoned jobs recovery cron dynamically
    const monitorCronSchedule = this.configService.get<string>(
      'jobs.monitorCronSchedule',
      '*/2 * * * *',
    );

    const abandonedJobsCron = new CronJob(monitorCronSchedule, () => {
      this.handleAbandonedJobs();
    });

    this.schedulerRegistry.addCronJob('abandonedJobsRecovery', abandonedJobsCron);
    abandonedJobsCron.start();

    this.logger.log(`Abandoned jobs recovery cron started: ${monitorCronSchedule}`);

    // Register cleanup cron dynamically
    const cleanupCronSchedule = this.configService.get<string>(
      'jobs.cleanupCronSchedule',
      '0 2 * * *',
    );

    const cleanupCron = new CronJob(cleanupCronSchedule, () => {
      this.handleCleanup();
    });

    this.schedulerRegistry.addCronJob('cleanup', cleanupCron);
    cleanupCron.start();

    this.logger.log(`Cleanup cron started: ${cleanupCronSchedule}`);
  }

  async handleAbandonedJobs() {
    this.logger.log('Checking for abandoned jobs...');

    try {
      // Check abandoned PROCESSING jobs
      const processingJobsRecovered = await this.recoverAbandonedProcessingJobs();

      // Check abandoned PENDING jobs
      const pendingJobsRecovered = await this.recoverAbandonedPendingJobs();

      const totalRecovered = processingJobsRecovered + pendingJobsRecovered;
      if (totalRecovered > 0) {
        this.logger.log(
          `Recovered ${totalRecovered} abandoned jobs ` +
          `(${processingJobsRecovered} PROCESSING, ${pendingJobsRecovered} PENDING)`,
        );
        this.abandonedJobsRecovered += totalRecovered;
      }
    } catch (error) {
      this.logger.error(`Failed to recover abandoned jobs: ${error.message}`, error.stack);
    }
  }

  private async recoverAbandonedProcessingJobs(): Promise<number> {
    const timeoutMinutes = this.configService.get<number>('jobs.jobTimeoutMinutes', 5);

    const abandonedJobs = await this.jobsService.findAbandonedProcessingJobs(timeoutMinutes);

    if (abandonedJobs.length === 0) {
      return 0;
    }

    this.logger.warn(
      `Found ${abandonedJobs.length} abandoned PROCESSING jobs (timeout: ${timeoutMinutes} min)`,
    );

    for (const job of abandonedJobs) {
      try {
        await this.jobsService.reEnqueueJob(job);
        this.logger.log(`Re-enqueued abandoned PROCESSING job: ${job.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to re-enqueue PROCESSING job ${job.id}: ${error.message}`,
        );
      }
    }

    return abandonedJobs.length;
  }

  private async recoverAbandonedPendingJobs(): Promise<number> {
    const maxWaitMinutes = this.configService.get<number>('jobs.maxQueueWaitMinutes', 30);

    const abandonedJobs = await this.jobsService.findAbandonedPendingJobs(maxWaitMinutes);

    if (abandonedJobs.length === 0) {
      return 0;
    }

    this.logger.warn(
      `Found ${abandonedJobs.length} abandoned PENDING jobs (max wait: ${maxWaitMinutes} min)`,
    );

    for (const job of abandonedJobs) {
      try {
        await this.jobsService.reEnqueueJob(job);
        this.logger.log(`Re-enqueued abandoned PENDING job: ${job.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to re-enqueue PENDING job ${job.id}: ${error.message}`,
        );
      }
    }

    return abandonedJobs.length;
  }

  async handleCleanup() {
    this.logger.log('Running TTL cleanup...');

    try {
      const ttl = this.configService.get('jobs.ttl', {
        completed: 7,
        failed: 30,
        cancelled: 7,
      });

      const result = await this.jobsService.cleanupOldJobs(ttl);

      if (result.deleted > 0) {
        this.logger.log(`Deleted ${result.deleted} old jobs (TTL: ${JSON.stringify(ttl)} days)`);
        this.jobsDeleted += result.deleted;
      } else {
        this.logger.log('No old jobs to delete');
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup old jobs: ${error.message}`, error.stack);
    }
  }

  async onModuleDestroy() {
    // Close Redis connection
    await this.redis.quit();
  }

  async getJobMetrics() {
    try {
      const jobsRepo = this.jobsService['jobRepository']; // Access repository from JobsService

      // Total submissions
      const total = await jobsRepo.count();

      // By status
      const statusCounts = await jobsRepo
        .createQueryBuilder('job')
        .select('job.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('job.status')
        .getRawMany();

      const job_status_total = {};
      statusCounts.forEach(row => {
        job_status_total[row.status] = parseInt(row.count, 10);
      });

      // By class and status
      const classCounts = await jobsRepo
        .createQueryBuilder('job')
        .select('job.class', 'class')
        .addSelect('job.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('job.class')
        .addGroupBy('job.status')
        .getRawMany();

      const job_status_by_class = {};
      classCounts.forEach(row => {
        if (!job_status_by_class[row.class]) {
          job_status_by_class[row.class] = {};
        }
        job_status_by_class[row.class][row.status] = parseInt(row.count, 10);
      });

      return {
        job_submissions_total: total,
        job_status_total,
        job_status_by_class,
      };
    } catch (error) {
      this.logger.error(`Failed to get job metrics: ${error.message}`);
      return {
        job_submissions_total: 0,
        job_status_total: {},
        job_status_by_class: {},
      };
    }
  }

  async getQueueMetrics() {
    try {
      // Query BullMQ Redis for current queue state
      // - waiting: Jobs in queue, not yet picked up by a worker
      // - active: Jobs currently being processed by workers (still in BullMQ until completion)
      // NOTE: We don't track completed/failed here as they're ephemeral Redis entries
      //       For historical completed/failed counts, use getJobMetrics() which queries the DB
      const counts = await this.jobsQueue.getJobCounts('waiting', 'active');

      return {
        queue_depth: counts.waiting + counts.active, // Total jobs in flight
        queue_waiting: counts.waiting,                // Jobs waiting for a worker
        queue_active: counts.active,                  // Jobs currently being processed
      };
    } catch (error) {
      this.logger.error(`Failed to get queue metrics: ${error.message}`);
      return {
        queue_depth: 0,
        queue_waiting: 0,
        queue_active: 0,
      };
    }
  }

  async getWorkerMetrics() {
    try {
      // Scan Redis for all worker stats keys
      const keys = [];
      let cursor = '0';

      do {
        const [newCursor, scannedKeys] = await this.redis.scan(
          cursor,
          'MATCH', 'worker:stats:*',
          'COUNT', 100,
        );
        keys.push(...scannedKeys);
        cursor = newCursor;
      } while (cursor !== '0');

      if (keys.length === 0) {
        return { workers: [] };
      }

      // Get all worker stats
      const statsStrings = await this.redis.mget(...keys);
      const workers = statsStrings
        .filter(s => s !== null)
        .map(s => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(w => w !== null);

      // Aggregate by worker type
      const aggregated = {};
      workers.forEach(worker => {
        const type = worker.workerType;
        if (!aggregated[type]) {
          aggregated[type] = {
            count: 0,
            totalCpu: 0,
            totalMemory: 0,
            totalActiveJobs: 0,
          };
        }
        aggregated[type].count += 1;
        aggregated[type].totalCpu += worker.worker_cpu_usage || 0;
        aggregated[type].totalMemory += worker.worker_memory_usage || 0;
        aggregated[type].totalActiveJobs += worker.worker_active_jobs || 0;
      });

      const last_sample_period_workers_running = {};
      const last_sample_period_avg_cpu_utilization = {};
      const last_sample_period_avg_memory_utilization = {};
      const last_sample_period_total_jobs_in_processing = {};

      Object.keys(aggregated).forEach(type => {
        const agg = aggregated[type];
        last_sample_period_workers_running[type] = agg.count;
        last_sample_period_avg_cpu_utilization[type] = Math.round((agg.totalCpu / agg.count) * 100) / 100;
        last_sample_period_avg_memory_utilization[type] = Math.round((agg.totalMemory / agg.count) * 100) / 100;
        last_sample_period_total_jobs_in_processing[type] = agg.totalActiveJobs;
      });

      return {
        last_sample_period_workers_running,
        last_sample_period_avg_cpu_utilization,
        last_sample_period_avg_memory_utilization,
        last_sample_period_total_jobs_in_processing,
        workers,
      };
    } catch (error) {
      this.logger.error(`Failed to get worker metrics: ${error.message}`);
      return { workers: [] };
    }
  }

  getSystemMetrics() {
    return {
      abandoned_jobs_recovered_total: this.abandonedJobsRecovered,
      jobs_deleted_total: this.jobsDeleted,
    };
  }
}
