import { registerAs } from '@nestjs/config';

export default registerAs('jobs', () => ({
  // Default job settings
  maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS, 10) || 3,
  exponentialBackoffBase: parseFloat(process.env.EXPONENTIAL_BACKOFF_BASE) || 2,
  jobTimeoutMinutes: parseInt(process.env.JOB_TIMEOUT_MINUTES, 10) || 5,

  // Monitor settings
  monitorCronSchedule: process.env.MONITOR_CRON_SCHEDULE || '*/2 * * * *',
  cleanupCronSchedule: process.env.CLEANUP_CRON_SCHEDULE || '0 2 * * *',
  maxQueueWaitMinutes: parseInt(process.env.MAX_QUEUE_WAIT_MINUTES, 10) || 30,

  // TTL settings (in days)
  ttl: {
    completed: parseInt(process.env.JOB_TTL_DAYS_COMPLETED, 10) || 7,
    failed: parseInt(process.env.JOB_TTL_DAYS_FAILED, 10) || 30,
    cancelled: parseInt(process.env.JOB_TTL_DAYS_CANCELLED, 10) || 7,
  },
}));
