import { Injectable, Inject } from '@nestjs/common';
import { IJobHandler } from './job-handler.interface';

// Injection tokens for job handlers
export const DELAY_JOB_HANDLER = 'DELAY_JOB_HANDLER';
export const GPU_INFERENCE_HANDLER = 'GPU_INFERENCE_HANDLER';

/**
 * Registry for job handlers
 *
 * Manages all available job handlers and routes jobs to the appropriate handler
 * based on job class and type.
 */
@Injectable()
export class JobHandlerRegistry {
  constructor(
    @Inject(DELAY_JOB_HANDLER) private readonly delayHandler: IJobHandler,
    @Inject(GPU_INFERENCE_HANDLER)
    private readonly gpuHandler: IJobHandler,
  ) {}

  /**
   * Gets the appropriate handler for the given job class and type
   * @param jobClass - The job class (e.g., 'test', 'gpu-modelInference')
   * @param jobType - The job type (e.g., 'delay', 'inference')
   * @returns The job handler
   * @throws Error if no handler is found for the job class/type
   */
  getHandler(jobClass: string, jobType: string): IJobHandler {
    const handlers = [this.delayHandler, this.gpuHandler];

    const handler = handlers.find((h) => h.supports(jobClass, jobType));

    if (!handler) {
      throw new Error(
        `No handler found for job class "${jobClass}" and type "${jobType}"`,
      );
    }

    return handler;
  }
}
