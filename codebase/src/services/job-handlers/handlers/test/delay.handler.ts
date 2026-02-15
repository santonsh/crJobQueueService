/**
 * Handler for test/delay jobs
 *
 * Simulates work with configurable execution time and random failure probability.
 * Used for testing job processing, retry logic, and system behavior under various conditions.
 */

/**
 * Executes the delay job
 * @param payload - Job payload with optional executionTime and failureProb
 * @returns Job result with execution metadata
 */
export async function execute(payload: any): Promise<any> {
  const executionTime = payload?.executionTime || 1000;
  const failureProb = payload?.failureProb || 0;

  // Simulate work
  await sleep(executionTime);

  // Random failure based on probability
  if (Math.random() < failureProb) {
    throw new Error(`Random failure (probability: ${failureProb})`);
  }

  return {
    executedAt: new Date().toISOString(),
    executionTime,
    success: true,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
