import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto, JobResponseDto } from '@/common/dtos';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createJob(@Body() createJobDto: CreateJobDto): Promise<JobResponseDto> {
    return this.jobsService.createJob(createJobDto);
  }

  @Get(':id')
  async getJob(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.findById(id);
  }

  @Delete(':id')
  async cancelJob(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.cancelJob(id);
  }
}
