import { Injectable, Inject } from '@nestjs/common';
import { SUPPORTED_HANDLERS, HandlerKey } from './worker-handlers';
import { GpuProcessorService } from '@/appModules/gpu-processor/gpu-processor.service';

export const HANDLER_MAP = 'HANDLER_MAP';
export const SERVICE_MAP = 'SERVICE_MAP';

/**
 * Job Handler Registry
 *
 * Routes job execution to appropriate handlers based on job class and type.
 * Uses a simple function map pattern for minimal boilerplate.
 */
@Injectable()
export class JobHandlerRegistry {
  constructor(
    @Inject(HANDLER_MAP) private readonly handlerMap: typeof SUPPORTED_HANDLERS,
    @Inject(SERVICE_MAP) private readonly serviceMap: { gpuService: GpuProcessorService },
  ) {}

  /**
   * Executes a job using the appropriate handler
   * @param jobClass - Job class (e.g., 'test', 'gpu')
   * @param jobType - Job type (e.g., 'delay', 'inference')
   * @param payload - Job payload
   * @returns Job execution result
   * @throws Error if no handler found for job class/type combination
   */
  async execute(jobClass: string, jobType: string, payload: any): Promise<any> {
    const handlerKey = `${jobClass}-${jobType}` as HandlerKey;
    const handler = this.handlerMap[handlerKey];

    if (!handler) {
      throw new Error(
        `No handler found for job class "${jobClass}" and type "${jobType}"`,
      );
    }

    // Execute handler with appropriate services based on handler key
    if (handlerKey === 'gpu-inference') {
      return await (handler as any)(payload, this.serviceMap.gpuService);
    } else {
      return await (handler as any)(payload);
    }
  }
}
