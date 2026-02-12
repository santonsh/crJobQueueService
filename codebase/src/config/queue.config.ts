import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => {
  // Parse REDIS_URL (format: redis://host:port)
  let redisHost = 'localhost';
  let redisPort = 6379;

  if (process.env.REDIS_URL) {
    const url = process.env.REDIS_URL.replace('redis://', '');
    const parts = url.split(':');
    if (parts.length === 2) {
      redisHost = parts[0];
      redisPort = parseInt(parts[1], 10);
    }
  }

  return {
    redis: {
      host: redisHost,
      port: redisPort,
    },
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 10,
  };
});
