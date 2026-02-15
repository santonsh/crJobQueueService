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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto, JobResponseDto, CreateBulkJobsDto, BulkJobsResponseDto } from '@/common/dtos';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new job', description: 'Submit a new job for asynchronous processing' })
  @ApiBody({ type: CreateJobDto })
  @ApiResponse({ status: 201, description: 'Job created successfully', type: JobResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid job data' })
  async createJob(@Body() createJobDto: CreateJobDto): Promise<JobResponseDto> {
    return this.jobsService.createJob(createJobDto);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create multiple jobs in bulk', description: 'Submit multiple jobs in a single request for efficient batch processing' })
  @ApiBody({ type: CreateBulkJobsDto })
  @ApiResponse({ status: 201, description: 'Jobs created successfully', type: BulkJobsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid jobs data' })
  async createBulkJobs(@Body() createBulkJobsDto: CreateBulkJobsDto): Promise<BulkJobsResponseDto> {
    return this.jobsService.createBulkJobs(createBulkJobsDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID', description: 'Retrieve job details and current status' })
  @ApiParam({ name: 'id', description: 'Job ID (UUID)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'Job found', type: JobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.findById(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a job', description: 'Cancel a pending or processing job. Already completed jobs cannot be cancelled.' })
  @ApiParam({ name: 'id', description: 'Job ID (UUID)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'Job cancelled successfully', type: JobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 400, description: 'Job cannot be cancelled (already completed/failed)' })
  async cancelJob(@Param('id') id: string): Promise<JobResponseDto> {
    return this.jobsService.cancelJob(id);
  }
}
