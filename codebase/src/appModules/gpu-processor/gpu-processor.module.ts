import { Module } from '@nestjs/common';
import { GpuProcessorService } from './gpu-processor.service';

/**
 * GPU Processor Module
 *
 * Provides GPU-based processing capabilities for model inference.
 * Exports GpuProcessorService for use in job handlers.
 */
@Module({
  providers: [GpuProcessorService],
  exports: [GpuProcessorService],
})
export class GpuProcessorModule {}
