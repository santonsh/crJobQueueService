import { ApiProperty } from '@nestjs/swagger';
import { JobStatus } from '../enums';

export class JobResponseDto {
  @ApiProperty({ description: 'Unique job identifier (UUID)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  jobId: string;

  @ApiProperty({ description: 'Job class', example: 'test' })
  class: string;

  @ApiProperty({ description: 'Job type', example: 'delay' })
  type: string;

  @ApiProperty({ description: 'Current job status', enum: JobStatus, example: JobStatus.PENDING })
  status: JobStatus;

  @ApiProperty({ description: 'Job payload data', example: { executionTime: 2000 } })
  payload: Record<string, any>;

  @ApiProperty({ description: 'Job result (if completed)', required: false, example: { success: true } })
  result?: Record<string, any>;

  @ApiProperty({ description: 'Error details (if failed)', required: false })
  error?: Record<string, any>;

  @ApiProperty({ description: 'Job creation timestamp', example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ description: 'Processing start timestamp', required: false })
  processingStartedAt?: Date;

  @ApiProperty({ description: 'Completion timestamp', required: false })
  finishedAt?: Date;

  @ApiProperty({ description: 'Cancellation timestamp', required: false })
  cancelledAt?: Date;

  @ApiProperty({ description: 'Number of execution attempts', example: 1 })
  attempts: number;

  @ApiProperty({ description: 'Maximum retry attempts allowed', example: 3 })
  maxAttempts: number;
}
