import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job as JobEntity } from '@/common/entities';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);
  private readonly hfMode = process.env.HF_MODE === 'true';

  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
  ) {}

  async processJob(jobId: string, jobClass: string, jobType: string, payload: any): Promise<any> {
    if (!this.hfMode) {
      this.logger.log(`Processing job ${jobId} [${jobClass}/${jobType}]`);
    }

    // Claim the job (atomic update to PROCESSING)
    const claimed = await this.jobsService.claimJob(jobId);

    if (!claimed) {
      this.logger.warn(`Job ${jobId} already claimed or cancelled, skipping`);
      return; // Job was already picked up by another worker or cancelled
    }

    // Execute with retry logic (stays in PROCESSING during retries)
    return this.executeJobWithRetry(jobId, jobClass, jobType, payload);
  }

  private async executeJobWithRetry(
    jobId: string,
    jobClass: string,
    jobType: string,
    payload: any,
  ): Promise<any> {
    try {
      // Execute job based on class/type
      const result = await this.executeJob(jobClass, jobType, payload);

      // Mark as completed (conditional update)
      const completed = await this.jobsService.completeJob(jobId, result);

      if (completed) {
        if (!this.hfMode) {
          this.logger.log(`Job ${jobId} completed successfully`);
        }
      } else {
        this.logger.warn(`Job ${jobId} was cancelled during processing`);
      }

      return result;
    } catch (error) {
      this.logger.error(`Job ${jobId} failed: ${error.message}`, error.stack);

      // Check if job was cancelled during processing
      const isCancelled = await this.jobsService.isJobCancelled(jobId);
      if (isCancelled) {
        this.logger.warn(`Job ${jobId} was cancelled, stopping retry attempts`);
        return;
      }

      // Record the failure and increment attempts
      const job = await this.jobsService.failJob(jobId, {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      // Check if we should retry
      if (job.attempts < job.maxAttempts) {
        const shouldRetry = this.shouldRetry(error);
        if (shouldRetry) {
          // Calculate exponential backoff delay
          const backoffBase = this.configService.get<number>('jobs.exponentialBackoffBase', 2);
          const delayMs = Math.pow(backoffBase, job.attempts) * 1000;

          if (!this.hfMode) {
            this.logger.log(
              `Job ${jobId} will retry (attempt ${job.attempts}/${job.maxAttempts}) after ${delayMs}ms`,
            );
          }

          // Wait for exponential backoff
          await this.sleep(delayMs);

          // Retry execution (not claiming, job stays PROCESSING)
          return this.executeJobWithRetry(jobId, jobClass, jobType, payload);
        }
      }

      this.logger.error(`Job ${jobId} permanently failed after ${job.attempts} attempts`);
      throw error;
    }
  }

  private async executeJob(jobClass: string, jobType: string, payload: any): Promise<any> {
    // Route to appropriate job handler based on class/type
    if (jobClass === 'test') {
      return this.executeTestJob(jobType, payload);
    }

    throw new Error(`Unknown job class: ${jobClass}`);
  }

  private async executeTestJob(type: string, payload: any): Promise<any> {
    if (type === 'delay') {
      return this.executeDelayJob(payload);
    }

    throw new Error(`Unknown test job type: ${type}`);
  }

  /**
   * Test job: Delays for specified time and randomly fails
   * Payload: { executionTime: number (ms), failureProb: number (0-1) }
   */
  private async executeDelayJob(payload: {
    executionTime?: number;
    failureProb?: number;
  }): Promise<any> {
    const executionTime = payload.executionTime || 1000;
    const failureProb = payload.failureProb || 0;

    if (!this.hfMode) {
      this.logger.log(`Executing delay job: ${executionTime}ms, failure prob: ${failureProb}`);
    }

    // Simulate work
    await this.sleep(executionTime);

    // Random failure
    if (Math.random() < failureProb) {
      throw new Error(`Random failure (probability: ${failureProb})`);
    }

    return {
      executedAt: new Date().toISOString(),
      executionTime,
      success: true,
    };
  }

  private shouldRetry(error: Error): boolean {
    // Could implement logic to determine if error is transient
    // For now, retry all errors
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
