import { Module } from '@nestjs/common';
import { JobHandlerRegistry, DELAY_JOB_HANDLER, GPU_INFERENCE_HANDLER } from './job-handler.registry';
import { DelayJobHandler } from './handlers/test/delay-job.handler';
import { ModelInferenceJobHandler } from './handlers/gpu/model-inference-job.handler';

/**
 * Module for job handlers
 *
 * Provides:
 * - Registry for job handler discovery and routing
 * - All job handler implementations
 *
 * To add a new job handler:
 * 1. Create handler class extending BaseJobHandler in handlers/{class}/ directory
 *    (e.g., handlers/test/delay-job.handler.ts or handlers/gpu/model-inference-job.handler.ts)
 * 2. Add injection token constant in job-handler.registry.ts
 * 3. Add provider here with the injection token
 * 4. Inject in JobHandlerRegistry constructor
 * 5. Add to handlers array in JobHandlerRegistry.getHandler()
 */
@Module({
  providers: [
    // Job handler implementations
    {
      provide: DELAY_JOB_HANDLER,
      useClass: DelayJobHandler,
    },
    {
      provide: GPU_INFERENCE_HANDLER,
      useClass: ModelInferenceJobHandler,
    },

    // Registry service
    JobHandlerRegistry,
  ],
  exports: [JobHandlerRegistry],
})
export class JobHandlersModule {}
