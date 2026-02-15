import { Injectable } from '@nestjs/common';
import { BaseJobHandler } from '../../base-job.handler';

/**
 * Handler for test/delay jobs
 *
 * Simulates work with configurable execution time and random failure probability.
 * Used for testing job processing, retry logic, and system behavior under various conditions.
 */
@Injectable()
export class DelayJobHandler extends BaseJobHandler {
  constructor() {
    super('test', 'delay');
  }

  /**
   * Validates delay job payload
   * @param payload - Expected structure: { executionTime?: number, failureProb?: number }
   * @throws Error if validation fails
   */
  validatePayload(payload: any): void {
    const { executionTime, failureProb } = payload || {};

    // Validate executionTime if provided
    if (executionTime !== undefined && typeof executionTime !== 'number') {
      throw new Error('executionTime must be a number');
    }

    if (executionTime !== undefined && executionTime < 0) {
      throw new Error('executionTime must be non-negative');
    }

    // Validate failureProb if provided
    if (failureProb !== undefined) {
      if (typeof failureProb !== 'number') {
        throw new Error('failureProb must be a number');
      }

      if (failureProb < 0 || failureProb > 1) {
        throw new Error('failureProb must be between 0 and 1');
      }
    }
  }

  /**
   * Executes the delay job
   * @param payload - Job payload with optional executionTime and failureProb
   * @returns Job result with execution metadata
   */
  async execute(payload: any): Promise<any> {
    const executionTime = payload?.executionTime || 1000;
    const failureProb = payload?.failureProb || 0;

    // Simulate work
    await this.sleep(executionTime);

    // Random failure based on probability
    if (Math.random() < failureProb) {
      throw new Error(
        `Random failure (probability: ${failureProb})`,
      );
    }

    return {
      executedAt: new Date().toISOString(),
      executionTime,
      success: true,
    };
  }

  /**
   * Utility method to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
