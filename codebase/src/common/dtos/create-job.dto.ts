import { IsString, IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateJobDto {
  @ApiProperty({
    description: 'Job class (e.g., "test", "gpu", "payment")',
    example: 'test',
  })
  @IsString()
  @IsNotEmpty()
  class: string;

  @ApiProperty({
    description: 'Job type within the class (e.g., "delay", "inference")',
    example: 'delay',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'Job-specific payload data',
    example: { executionTime: 2000, failureProb: 0 },
  })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;
}
