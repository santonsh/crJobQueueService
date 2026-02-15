import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job as JobEntity } from '@/common/entities';
import { JobsService } from '../jobs/jobs.service';
import { JobHandlerRegistry } from '../job-handlers/job-handler.registry';

@Injectable()
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);
  private readonly hfMode = process.env.HF_MODE === 'true';

  constructor(
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    private readonly jobHandlerRegistry: JobHandlerRegistry,
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
      // Get appropriate handler and validate payload
      const handler = this.jobHandlerRegistry.getHandler(jobClass, jobType);
      handler.validatePayload(payload);

      // Execute job using handler
      const result = await handler.execute(payload);

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

      // Job permanently failed - PostgreSQL is already marked as FAILED
      // Return normally (don't throw) so BullMQ removes the job from the queue
      // PostgreSQL is the source of truth for job state
      this.logger.error(`Job ${jobId} permanently failed after ${job.attempts} attempts - removing from BullMQ`);
      return;
    }
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
