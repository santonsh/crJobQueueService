import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkerStatsService {
  private startTime = Date.now();
  private processedJobsCount = 0;

  getStats() {
    return {
      worker_active_jobs: 0, // TODO: Track from processor
      worker_cpu_usage: 0, // TODO: Calculate CPU usage
      worker_memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      worker_uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      worker_processed_jobs_total: this.processedJobsCount,
    };
  }

  incrementProcessedJobs() {
    this.processedJobsCount++;
  }
}
