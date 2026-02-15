import { IJobHandler } from './job-handler.interface';

/**
 * Abstract base class for job handlers
 *
 * Provides common functionality for job handlers:
 * - Automatic job type support detection
 * - Template methods for validation and execution
 */
export abstract class BaseJobHandler implements IJobHandler {
  /**
   * Creates a job handler for a specific job class and type
   * @param jobClass - The job class this handler supports
   * @param jobType - The job type this handler supports
   */
  constructor(
    protected readonly jobClass: string,
    protected readonly jobType: string,
  ) {}

  /**
   * Checks if this handler supports the given job class and type
   */
  supports(jobClass: string, jobType: string): boolean {
    return this.jobClass === jobClass && this.jobType === jobType;
  }

  /**
   * Validates the job payload structure and values
   * Must be implemented by concrete handlers
   */
  abstract validatePayload(payload: any): void;

  /**
   * Executes the job with the given payload
   * Must be implemented by concrete handlers
   */
  abstract execute(payload: any): Promise<any>;
}
