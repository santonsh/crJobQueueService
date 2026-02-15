import { Injectable } from '@nestjs/common';
import { BaseJobHandler } from '../../base-job.handler';

/**
 * Handler for gpu-modelInference/inference jobs
 *
 * Simulates GPU-based model inference with a fixed 100ms execution time
 * and returns a random integer result between 0-10.
 *
 * In a real implementation, this would:
 * - Load the model specified by modelId
 * - Fetch input data from blob storage using blobKey
 * - Execute inference on GPU
 * - Return inference results
 */
@Injectable()
export class ModelInferenceJobHandler extends BaseJobHandler {
  constructor() {
    super('gpu-modelInference', 'inference');
  }

  /**
   * Validates model inference job payload
   * @param payload - Expected structure: { modelId: string, blobKey: string }
   * @throws Error if validation fails
   */
  validatePayload(payload: any): void {
    const { modelId, blobKey } = payload || {};

    // Validate modelId
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('modelId is required and must be a string');
    }

    if (modelId.trim().length === 0) {
      throw new Error('modelId cannot be empty');
    }

    // Validate blobKey
    if (!blobKey || typeof blobKey !== 'string') {
      throw new Error('blobKey is required and must be a string');
    }

    if (blobKey.trim().length === 0) {
      throw new Error('blobKey cannot be empty');
    }
  }

  /**
   * Executes the model inference job
   * @param payload - Job payload with modelId and blobKey
   * @returns Job result with inference output
   */
  async execute(payload: any): Promise<any> {
    const { modelId, blobKey } = payload;

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

  /**
   * Utility method to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
