import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateJobDto } from './create-job.dto';

export class CreateBulkJobsDto {
  @ApiProperty({
    description: 'Array of jobs to create in bulk',
    type: [CreateJobDto],
    example: [
      { class: 'test', type: 'delay', payload: { executionTime: 1000 } },
      { class: 'gpu', type: 'inference', payload: { modelId: 'model-v1', blobKey: 's3://data.bin' } },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateJobDto)
  jobs: CreateJobDto[];
}
