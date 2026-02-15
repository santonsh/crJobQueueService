import { Injectable } from '@nestjs/common';

/**
 * Mock GPU Processor Service
 *
 * Simulates GPU-based model inference operations.
 * In a real implementation, this would interface with actual GPU hardware.
 */
@Injectable()
export class GpuProcessorService {
  /**
   * Runs model inference on GPU
   * @param payload - Expected structure: { modelId: string, blobKey: string }
   * @returns Inference result with random integer 0-10
   */
  async runInference(payload: any): Promise<any> {
    const { modelId, blobKey } = payload || {};

    // Validate inputs
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('modelId is required and must be a string');
    }

    if (modelId.trim().length === 0) {
      throw new Error('modelId cannot be empty');
    }

    if (!blobKey || typeof blobKey !== 'string') {
      throw new Error('blobKey is required and must be a string');
    }

    if (blobKey.trim().length === 0) {
      throw new Error('blobKey cannot be empty');
    }

    // Simulate GPU inference with 100ms delay
    await this.sleep(100);

    // Generate random integer result between 0-10
    const result = Math.floor(Math.random() * 11);

    return {
      modelId,
      blobKey,
      result,
      executedAt: new Date().toISOString(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
