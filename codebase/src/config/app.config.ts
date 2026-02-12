import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.API_PORT, 10) || 3000,
  workerPort: parseInt(process.env.WORKER_STATS_PORT, 10) || 3001,
  monitorPort: parseInt(process.env.MONITOR_PORT, 10) || 3002,
  nodeEnv: process.env.NODE_ENV || 'development',
}));
