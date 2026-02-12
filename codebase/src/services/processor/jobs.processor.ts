import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { ProcessorService } from './processor.service';

@Processor('jobs', {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 10,
})
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly processorService: ProcessorService,
    private readonly configService: ConfigService,
  ) {
    super();
    const concurrency = this.configService.get<number>('queue.workerConcurrency', 10);
    this.logger.log(`Worker initialized with concurrency: ${concurrency}`);
  }

  async process(job: Job): Promise<any> {
    const { jobId, class: jobClass, type: jobType, payload } = job.data;

    this.logger.log(`BullMQ job received: ${jobId}`);

    try {
      const result = await this.processorService.processJob(
        jobId,
        jobClass,
        jobType,
        payload,
      );

      return result;
    } catch (error) {
      this.logger.error(`BullMQ job ${jobId} failed: ${error.message}`);
      throw error; // BullMQ will mark this job as failed
    }
  }
}
