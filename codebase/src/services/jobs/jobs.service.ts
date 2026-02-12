import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Job } from '@/common/entities';
import { JobStatus } from '@/common/enums';
import { CreateJobDto, JobResponseDto } from '@/common/dtos';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectQueue('jobs')
    private readonly jobQueue: Queue,
  ) {}

  async createJob(createJobDto: CreateJobDto): Promise<JobResponseDto> {
    // Create job in database
    const job = this.jobRepository.create({
      class: createJobDto.class,
      type: createJobDto.type,
      payload: createJobDto.payload,
      status: JobStatus.PENDING,
    });

    const savedJob = await this.jobRepository.save(job);

    // Add to BullMQ queue
    await this.jobQueue.add(
      'process-job',
      {
        jobId: savedJob.id,
        class: savedJob.class,
        type: savedJob.type,
        payload: savedJob.payload,
      },
      {
        jobId: savedJob.id, // Use DB job ID as BullMQ job ID for tracking
        removeOnComplete: true, // Clean up completed jobs from Redis
        removeOnFail: false, // Keep failed jobs for investigation
      },
    );

    this.logger.log(`Job created and enqueued: ${savedJob.id}`);

    return this.toResponseDto(savedJob);
  }

  async findById(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    return this.toResponseDto(job);
  }

  async cancelJob(id: string): Promise<JobResponseDto> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    // Can only cancel PENDING or PROCESSING jobs
    if (![JobStatus.PENDING, JobStatus.PROCESSING].includes(job.status)) {
      throw new Error(`Cannot cancel job in ${job.status} status`);
    }

    // Conditional update: only cancel if still in PENDING or PROCESSING
    const result = await this.jobRepository
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
      })
      .where('id = :id', { id })
      .andWhere('status IN (:...statuses)', {
        statuses: [JobStatus.PENDING, JobStatus.PROCESSING],
      })
      .execute();

    if (result.affected === 0) {
      // Job was already completed/failed/cancelled
      const updatedJob = await this.jobRepository.findOne({ where: { id } });
      return this.toResponseDto(updatedJob);
    }

    // Try to remove from BullMQ queue (best effort)
    try {
      const bullJob = await this.jobQueue.getJob(id);
      if (bullJob) {
        await bullJob.remove();
        this.logger.log(`Removed job ${id} from BullMQ queue`);
      }
    } catch (error) {
      this.logger.warn(`Failed to remove job ${id} from queue: ${error.message}`);
    }

    const cancelledJob = await this.jobRepository.findOne({ where: { id } });
    this.logger.log(`Job cancelled: ${id}`);

    return this.toResponseDto(cancelledJob);
  }

  // Used by worker to claim a job
  async claimJob(id: string): Promise<boolean> {
    const result = await this.jobRepository
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.PROCESSING,
        processingStartedAt: new Date(),
      })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: JobStatus.PENDING })
      .execute();

    return result.affected > 0;
  }

  // Used by worker to mark job as completed
  async completeJob(
    id: string,
    result: Record<string, any>,
  ): Promise<boolean> {
    const updateResult = await this.jobRepository
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.COMPLETED,
        result,
        finishedAt: new Date(),
      })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: JobStatus.PROCESSING })
      .execute();

    return updateResult.affected > 0;
  }

  // Used by worker to check if job was cancelled during processing
  async isJobCancelled(id: string): Promise<boolean> {
    const job = await this.jobRepository.findOne({
      where: { id },
      select: ['status'],
    });

    return job?.status === JobStatus.CANCELLED;
  }

  // Used by worker to mark job as failed
  async failJob(
    id: string,
    error: Record<string, any>,
    incrementAttempts = true,
  ): Promise<Job> {
    const job = await this.jobRepository.findOne({ where: { id } });

    if (!job) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }

    const newAttempts = incrementAttempts ? job.attempts + 1 : job.attempts;
    const isFinalFailure = newAttempts >= job.maxAttempts;

    await this.jobRepository
      .createQueryBuilder()
      .update(Job)
      .set({
        attempts: newAttempts,
        error,
        ...(isFinalFailure && {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
        }),
      })
      .where('id = :id', { id })
      .execute();

    return this.jobRepository.findOne({ where: { id } });
  }

  // Used by monitor to find abandoned PROCESSING jobs
  async findAbandonedProcessingJobs(timeoutMinutes: number): Promise<Job[]> {
    const timeoutDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    return this.jobRepository
      .createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.PROCESSING })
      .andWhere('job.processingStartedAt < :timeoutDate', { timeoutDate })
      .getMany();
  }

  // Used by monitor to find abandoned PENDING jobs
  async findAbandonedPendingJobs(maxWaitMinutes: number): Promise<Job[]> {
    const maxWaitDate = new Date(Date.now() - maxWaitMinutes * 60 * 1000);

    return this.jobRepository
      .createQueryBuilder('job')
      .where('job.status = :status', { status: JobStatus.PENDING })
      .andWhere('job.createdAt < :maxWaitDate', { maxWaitDate })
      .getMany();
  }

  // Used by monitor to re-enqueue abandoned job
  async reEnqueueJob(job: Job): Promise<void> {
    // Reset to PENDING
    await this.jobRepository
      .createQueryBuilder()
      .update(Job)
      .set({
        status: JobStatus.PENDING,
        processingStartedAt: null,
      })
      .where('id = :id', { id: job.id })
      .andWhere('status = :status', { status: JobStatus.PROCESSING })
      .execute();

    // Add back to queue
    await this.jobQueue.add(
      'process-job',
      {
        jobId: job.id,
        class: job.class,
        type: job.type,
        payload: job.payload,
      },
      {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    this.logger.log(`Re-enqueued abandoned job: ${job.id}`);
  }

  // Used by monitor for TTL cleanup
  async cleanupOldJobs(ttlDays: {
    completed: number;
    failed: number;
    cancelled: number;
  }): Promise<{ deleted: number }> {
    const completedDate = new Date(Date.now() - ttlDays.completed * 24 * 60 * 60 * 1000);
    const failedDate = new Date(Date.now() - ttlDays.failed * 24 * 60 * 60 * 1000);
    const cancelledDate = new Date(Date.now() - ttlDays.cancelled * 24 * 60 * 60 * 1000);

    const result = await this.jobRepository
      .createQueryBuilder()
      .delete()
      .where(
        '(status = :completed AND finishedAt < :completedDate) OR ' +
        '(status = :failed AND finishedAt < :failedDate) OR ' +
        '(status = :cancelled AND cancelledAt < :cancelledDate)',
        {
          completed: JobStatus.COMPLETED,
          completedDate,
          failed: JobStatus.FAILED,
          failedDate,
          cancelled: JobStatus.CANCELLED,
          cancelledDate,
        },
      )
      .execute();

    return { deleted: result.affected || 0 };
  }

  private toResponseDto(job: Job): JobResponseDto {
    return {
      jobId: job.id,
      class: job.class,
      type: job.type,
      status: job.status,
      payload: job.payload,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      processingStartedAt: job.processingStartedAt,
      finishedAt: job.finishedAt,
      cancelledAt: job.cancelledAt,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    };
  }
}
