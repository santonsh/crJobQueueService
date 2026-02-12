import { Controller, Post, HttpCode, HttpStatus, Logger, Body } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '@/common/entities/job.entity';
import { MonitorService } from './monitor.service';
import Redis from 'ioredis';

@Controller('debug')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);
  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService,
    private readonly monitorService: MonitorService,
    @InjectQueue('jobs') private readonly jobsQueue: Queue,
    @InjectRepository(Job) private readonly jobRepository: Repository<Job>,
  ) {
    // Initialize Redis client for stats cleanup
    this.redis = new Redis({
      host: this.configService.get('queue.redis.host'),
      port: this.configService.get('queue.redis.port'),
    });
  }

  @Post('run_test')
  @HttpCode(HttpStatus.OK)
  async runTest(): Promise<{ success: boolean; duration?: number; message?: string }> {
    this.logger.log('Starting test: submitting 100 jobs with 5-second execution time');

    const startTime = Date.now();
    const apiUrl = `http://localhost:${this.configService.get('app.port', 3000)}`;

    try {
      // Step 1: Submit 100 jobs in bulk
      const bulkPayload = {
        jobs: Array(100).fill(null).map(() => ({
          class: 'test',
          type: 'delay',
          payload: {
            executionTime: 5000, // 5 seconds
            failureProb: 0,
          },
        })),
      };

      const submitResponse = await fetch(`${apiUrl}/jobs/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkPayload),
      });

      if (!submitResponse.ok) {
        throw new Error(`Failed to submit jobs: ${submitResponse.statusText}`);
      }

      const { jobIds } = await submitResponse.json();
      this.logger.log(`Submitted ${jobIds.length} jobs`);

      // Step 2: Poll for completion (check every 2 seconds, max 60 seconds)
      const maxWaitTime = 55000; // 55 seconds
      const pollInterval = 2000; // 2 seconds
      const maxPolls = Math.ceil(maxWaitTime / pollInterval);

      for (let poll = 0; poll < maxPolls; poll++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        // Check how many jobs are completed
        let completedCount = 0;
        let failedCount = 0;

        // Sample check: query first, middle, and last job to estimate progress
        const sampleIds = [
          jobIds[0],
          jobIds[Math.floor(jobIds.length / 2)],
          jobIds[jobIds.length - 1],
        ];

        for (const jobId of sampleIds) {
          const jobResponse = await fetch(`${apiUrl}/jobs/${jobId}`);
          if (jobResponse.ok) {
            const job = await jobResponse.json();
            if (job.status === 'COMPLETED') completedCount++;
            if (job.status === 'FAILED') failedCount++;
          }
        }

        this.logger.log(
          `Poll ${poll + 1}/${maxPolls}: Sample shows ~${Math.round((completedCount / 3) * 100)}% completed`,
        );

        // If all samples are completed, check all jobs
        if (completedCount === 3) {
          this.logger.log('All samples completed, verifying all jobs...');

          let allCompleted = 0;
          let allFailed = 0;

          for (const jobId of jobIds) {
            const jobResponse = await fetch(`${apiUrl}/jobs/${jobId}`);
            if (jobResponse.ok) {
              const job = await jobResponse.json();
              if (job.status === 'COMPLETED') allCompleted++;
              if (job.status === 'FAILED') allFailed++;
            }
          }

          const duration = Date.now() - startTime;

          if (allCompleted === 100) {
            this.logger.log(`Test PASSED: All 100 jobs completed in ${duration}ms`);
            return {
              success: true,
              duration: Math.round(duration / 1000),
              message: `All 100 jobs completed in ${Math.round(duration / 1000)}s`,
            };
          } else if (allCompleted + allFailed === 100) {
            this.logger.warn(`Test FAILED: ${allFailed} jobs failed`);
            return {
              success: false,
              message: `${allFailed} jobs failed out of 100`,
            };
          }
        }
      }

      // Timeout
      const duration = Date.now() - startTime;
      this.logger.warn(`Test FAILED: Timeout after ${duration}ms`);
      return {
        success: false,
        duration: Math.round(duration / 1000),
        message: `Timeout: Jobs did not complete within 55 seconds`,
      };
    } catch (error) {
      this.logger.error(`Test FAILED: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('clean/stats')
  @HttpCode(HttpStatus.OK)
  async cleanStats(
    @Body() body: { confirm?: boolean },
  ): Promise<{ success: boolean; message: string; deleted?: number }> {
    if (!body.confirm) {
      return {
        success: false,
        message: 'Confirmation required. Send { "confirm": true } to proceed.',
      };
    }

    this.logger.warn('⚠️  DEBUG: Cleaning worker stats from Redis');

    try {
      // Delete all worker:stats:* keys
      const pattern = 'worker:stats:*';
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');

      // Reset in-memory counters in MonitorService
      this.monitorService.resetCounters();

      this.logger.log(`Deleted ${deletedCount} worker stat keys from Redis`);

      return {
        success: true,
        message: `Deleted ${deletedCount} worker stat keys and reset counters`,
        deleted: deletedCount,
      };
    } catch (error) {
      this.logger.error(`Failed to clean stats: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('clean/table')
  @HttpCode(HttpStatus.OK)
  async cleanTable(
    @Body() body: { confirm?: boolean },
  ): Promise<{ success: boolean; message: string; deleted?: number }> {
    if (!body.confirm) {
      return {
        success: false,
        message: 'Confirmation required. Send { "confirm": true } to proceed.',
      };
    }

    this.logger.warn('⚠️  DEBUG: Truncating jobs table in PostgreSQL');

    try {
      const result = await this.jobRepository.query('TRUNCATE TABLE jobs RESTART IDENTITY CASCADE');
      const countResult = await this.jobRepository.count();

      this.logger.log(`Truncated jobs table. Remaining records: ${countResult}`);

      return {
        success: true,
        message: 'Jobs table truncated successfully',
        deleted: 0, // Can't get count after truncate
      };
    } catch (error) {
      this.logger.error(`Failed to clean table: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('clean/queue')
  @HttpCode(HttpStatus.OK)
  async cleanQueue(
    @Body() body: { confirm?: boolean },
  ): Promise<{ success: boolean; message: string; deleted?: number }> {
    if (!body.confirm) {
      return {
        success: false,
        message: 'Confirmation required. Send { "confirm": true } to proceed.',
      };
    }

    this.logger.warn('⚠️  DEBUG: Cleaning all jobs from BullMQ queue');

    try {
      // Get counts before cleanup
      const counts = await this.jobsQueue.getJobCounts();
      const totalBefore =
        (counts.waiting || 0) +
        (counts.active || 0) +
        (counts.delayed || 0) +
        (counts.completed || 0) +
        (counts.failed || 0);

      // Obliterate the queue (removes all jobs)
      await this.jobsQueue.obliterate({ force: true });

      this.logger.log(`Obliterated queue. Removed ~${totalBefore} jobs`);

      return {
        success: true,
        message: `Queue cleaned. Removed approximately ${totalBefore} jobs`,
        deleted: totalBefore,
      };
    } catch (error) {
      this.logger.error(`Failed to clean queue: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  @Post('clean/all')
  @HttpCode(HttpStatus.OK)
  async cleanAll(
    @Body() body: { confirm?: boolean },
  ): Promise<{ success: boolean; message: string; stats?: any }> {
    if (!body.confirm) {
      return {
        success: false,
        message: 'Confirmation required. Send { "confirm": true } to proceed.',
      };
    }

    this.logger.warn('⚠️  DEBUG: Performing FULL system cleanup (stats + table + queue)');

    try {
      // Run all cleanups
      const statsResult = await this.cleanStats({ confirm: true });
      const queueResult = await this.cleanQueue({ confirm: true });
      const tableResult = await this.cleanTable({ confirm: true });

      const allSuccess = statsResult.success && queueResult.success && tableResult.success;

      if (!allSuccess) {
        throw new Error(
          `Some cleanups failed: stats=${statsResult.success}, queue=${queueResult.success}, table=${tableResult.success}`,
        );
      }

      this.logger.log('Full system cleanup completed successfully');

      return {
        success: true,
        message: 'Full system cleanup completed',
        stats: {
          statsDeleted: statsResult.deleted,
          queueDeleted: queueResult.deleted,
          tableDeleted: tableResult.deleted,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to clean all: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }
}
