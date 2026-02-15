import { GpuProcessorService } from '@/appModules/gpu-processor/gpu-processor.service';

/**
 * Handler for gpu/inference jobs
 *
 * Delegates GPU-based model inference to the GpuProcessorService.
 * Validates inputs and executes inference on GPU hardware.
 */

/**
 * Executes the model inference job
 * @param payload - Job payload with modelId and blobKey
 * @param gpuService - GPU processor service instance
 * @returns Job result with inference output
 */
export async function execute(
  payload: any,
  gpuService: GpuProcessorService,
): Promise<any> {
  return await gpuService.runInference(payload);
}
