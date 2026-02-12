import { JobStatus } from '../enums';

export class JobResponseDto {
  jobId: string;
  class: string;
  type: string;
  status: JobStatus;
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: Record<string, any>;
  createdAt: Date;
  processingStartedAt?: Date;
  finishedAt?: Date;
  cancelledAt?: Date;
  attempts: number;
  maxAttempts: number;
}
