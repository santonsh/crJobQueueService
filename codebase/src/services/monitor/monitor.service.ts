import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class MonitorService implements OnModuleInit {
  private readonly logger = new Logger(MonitorService.name);
  private abandonedJobsRecovered = 0;
  private jobsDeleted = 0;

  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

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

  getJobMetrics() {
    return {
      job_submissions_total: 0,
      job_status_total: {},
    };
  }

  getQueueMetrics() {
    return {
      queue_depth: 0,
      queue_processing_rate: 0,
    };
  }

  getWorkerMetrics() {
    return {
      workers: [],
    };
  }

  getSystemMetrics() {
    return {
      abandoned_jobs_recovered_total: this.abandonedJobsRecovered,
      database_connection_pool_size: 0,
      redis_connection_errors_total: 0,
    };
  }
}
