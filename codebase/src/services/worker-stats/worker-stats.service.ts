import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

@Injectable()
export class WorkerStatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerStatsService.name);
  private startTime = Date.now();
  private processedJobsCount = 0;
  private failedJobsCount = 0;
  private activeJobsCount = 0;

  // CPU tracking
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();
  private cpuUsagePercent = 0;

  // Worker identity
  private workerId: string;
  private workerType: string;

  // Publishing
  private redis: Redis;
  private publishInterval: NodeJS.Timeout;
  private publishPeriodSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.workerType = this.configService.get<string>('app.workerType', 'general');
    this.workerId = this.configService.get<string>('app.workerId');
    this.publishPeriodSeconds = this.configService.get<number>('app.workerStatsReportingPeriodSeconds', 5);

    // Create Redis client from config
    const redisConfig = this.configService.get('queue.redis');
    this.redis = new Redis(redisConfig);
  }

  onModuleInit() {
    this.logger.log(`Worker stats service initialized (ID: ${this.workerId}, Type: ${this.workerType})`);

    // Start CPU sampling (every 10 seconds)
    setInterval(() => this.sampleCpuUsage(), 10000);

    // Start periodic publishing to Redis
    this.publishInterval = setInterval(
      () => this.publishStats(),
      this.publishPeriodSeconds * 1000,
    );

    // Initial publish
    this.publishStats();
  }

  async onModuleDestroy() {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
    }
    // Stats will expire via TTL - no manual cleanup needed
    // Close Redis connection
    await this.redis.quit();
  }

  private sampleCpuUsage() {
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const elapsedMs = currentTime - this.lastCpuTime;

    // cpuUsage returns microseconds, convert to percentage
    // 1 second = 1,000,000 microseconds
    const totalCpuUs = currentCpuUsage.user + currentCpuUsage.system;
    const elapsedUs = elapsedMs * 1000;
    this.cpuUsagePercent = Math.min(100, (totalCpuUs / elapsedUs) * 100);

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;
  }

  private getPoolMetrics() {
    try {
      const pool = (this.dataSource.driver as any).master;
      return {
        total: pool.totalCount || 0,
        idle: pool.idleCount || 0,
        waiting: pool.waitingCount || 0,
        max: pool.options?.max || 0,
      };
    } catch (error) {
      this.logger.error(`Failed to get pool metrics: ${error.message}`);
      return { total: 0, idle: 0, waiting: 0, max: 0 };
    }
  }

  getStats() {
    const poolMetrics = this.getPoolMetrics();
    const poolUsage = poolMetrics.max > 0
      ? Math.round((poolMetrics.total / poolMetrics.max) * 100)
      : 0;

    // Log warning if pool usage is high
    if (poolUsage > 80) {
      this.logger.warn(
        `High connection pool usage: ${poolUsage}% ` +
        `(${poolMetrics.total}/${poolMetrics.max}, waiting: ${poolMetrics.waiting})`
      );
    }

    return {
      worker_active_jobs: this.activeJobsCount,
      worker_cpu_usage: Math.round(this.cpuUsagePercent * 100) / 100,
      worker_memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      worker_uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      worker_processed_jobs_total: this.processedJobsCount,
      worker_failed_jobs_total: this.failedJobsCount,
      worker_db_pool_total: poolMetrics.total,
      worker_db_pool_idle: poolMetrics.idle,
      worker_db_pool_waiting: poolMetrics.waiting,
      worker_db_pool_max: poolMetrics.max,
      worker_db_pool_usage_percent: poolUsage,
    };
  }

  incrementProcessedJobs() {
    this.processedJobsCount++;
  }

  incrementFailedJobs() {
    this.failedJobsCount++;
  }

  incrementActiveJobs() {
    this.activeJobsCount++;
  }

  decrementActiveJobs() {
    this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
  }

  private async publishStats() {
    try {
      const stats = {
        workerId: this.workerId,
        workerType: this.workerType,
        timestamp: new Date().toISOString(),
        ...this.getStats(),
        queues: ['jobs'], // TODO: Make this dynamic when multi-queue support is added
      };

      const key = `worker:stats:${this.workerType}:${this.workerId}`;
      const ttl = this.configService.get<number>('app.workerStatsRedisTtlSeconds', 300);

      await this.redis.setex(key, ttl, JSON.stringify(stats));

      this.logger.debug(`Published stats to Redis: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Failed to publish stats to Redis: ${error.message}`, error.stack);
    }
  }
}
