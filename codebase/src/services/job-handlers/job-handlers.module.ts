import { Module } from '@nestjs/common';
import { JobHandlerRegistry, HANDLER_MAP, SERVICE_MAP } from './job-handler.registry';
import { SUPPORTED_HANDLERS } from './worker-handlers';
import { GpuProcessorModule } from '@/appModules/gpu-processor/gpu-processor.module';
import { GpuProcessorService } from '@/appModules/gpu-processor/gpu-processor.service';

/**
 * Module for job handlers
 *
 * Provides:
 * - Registry for job handler discovery and routing
 * - Handler map with type-safe imports
 * - Service map for dependency injection into handlers
 *
 * To add a new job handler:
 * 1. Create handler file in handlers/{class}/{type}.handler.ts
 * 2. Export async execute(payload, ...services) function
 * 3. Add import to worker-handlers.ts
 * 4. Add to SUPPORTED_HANDLERS map in worker-handlers.ts
 * 5. If handler needs services, import module here and add to SERVICE_MAP factory
 */
@Module({
  imports: [GpuProcessorModule],
  providers: [
    // Handler map - type-safe configuration from worker-handlers.ts
    {
      provide: HANDLER_MAP,
      useValue: SUPPORTED_HANDLERS,
    },

    // Service map - services available to handlers
    {
      provide: SERVICE_MAP,
      useFactory: (gpuService: GpuProcessorService) => ({
        gpuService,
      }),
      inject: [GpuProcessorService],
    },

    // Registry service
    JobHandlerRegistry,
  ],
  exports: [JobHandlerRegistry],
})
export class JobHandlersModule {}
