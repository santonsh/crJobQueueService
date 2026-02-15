/**
 * Interface for job handlers
 *
 * Job handlers are responsible for executing specific job types.
 * Each handler must implement:
 * - Job type support detection
 * - Payload validation
 * - Job execution logic
 */
export interface IJobHandler {
  /**
   * Determines if this handler can process the given job class and type
   * @param jobClass - The job class (e.g., 'test', 'gpu-modelInference')
   * @param jobType - The job type (e.g., 'delay', 'inference')
   * @returns true if this handler supports the job class/type combination
   */
  supports(jobClass: string, jobType: string): boolean;

  /**
   * Validates the job payload structure and values
   * @param payload - The job payload to validate
   * @throws Error if validation fails
   */
  validatePayload(payload: any): void;

  /**
   * Executes the job with the given payload
   * @param payload - The job payload
   * @returns Promise resolving to the job result
   * @throws Error if execution fails
   */
  execute(payload: any): Promise<any>;
}
