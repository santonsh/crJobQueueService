import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { ProcessorService } from './processor.service';
import { WorkerStatsService } from '../worker-stats/worker-stats.service';

@Processor('jobs', {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 10,
})
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly processorService: ProcessorService,
    private readonly configService: ConfigService,
    private readonly workerStatsService: WorkerStatsService,
  ) {
    super();
    const concurrency = this.configService.get<number>('queue.workerConcurrency', 10);
    this.logger.log(`Worker initialized with concurrency: ${concurrency}`);
  }

  async process(job: Job): Promise<any> {
    const { jobId, class: jobClass, type: jobType, payload } = job.data;

    this.logger.log(`BullMQ job received: ${jobId}`);

    // Track active job
    this.workerStatsService.incrementActiveJobs();

    try {
      const result = await this.processorService.processJob(
        jobId,
        jobClass,
        jobType,
        payload,
      );

      // Job completed successfully
      this.workerStatsService.incrementProcessedJobs();
      return result;
    } catch (error) {
      this.logger.error(`BullMQ job ${jobId} failed: ${error.message}`);
      this.workerStatsService.incrementFailedJobs();
      throw error; // BullMQ will mark this job as failed
    } finally {
      // Always decrement active jobs
      this.workerStatsService.decrementActiveJobs();
    }
  }
}
