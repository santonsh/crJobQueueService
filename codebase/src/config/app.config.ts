import { registerAs } from '@nestjs/config';
import * as os from 'os';

export default registerAs('app', () => ({
  port: parseInt(process.env.API_PORT, 10) || 3000,
  workerPort: parseInt(process.env.WORKER_STATS_PORT, 10) || 3001,
  monitorPort: parseInt(process.env.MONITOR_PORT, 10) || 3002,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Worker configuration
  workerType: process.env.WORKER_TYPE || 'general',
  workerId: process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}`,
  workerStatsReportingPeriodSeconds: parseInt(process.env.WORKER_STATS_REPORTING_PERIOD_SECONDS, 10) || 5,
  workerStatsRedisTtlSeconds: parseInt(process.env.WORKER_STATS_REDIS_TTL_SECONDS, 10) || 300,

  // Monitor configuration
  monitorWorkerStatsQueryPeriodSeconds: parseInt(process.env.MONITOR_WORKER_STATS_QUERY_PERIOD_SECONDS, 10) || 10,
}));
