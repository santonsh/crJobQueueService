import { ApiProperty } from '@nestjs/swagger';

export class BulkJobsResponseDto {
  @ApiProperty({ description: 'Array of created job IDs', example: ['uuid1', 'uuid2', 'uuid3'] })
  jobIds: string[];

  @ApiProperty({ description: 'Number of jobs created', example: 3 })
  count: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}
