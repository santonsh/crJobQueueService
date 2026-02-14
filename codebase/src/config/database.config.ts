import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Job } from '@/common/entities';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [Job], // Direct entity import instead of glob pattern
    synchronize: process.env.NODE_ENV !== 'production', // Auto-sync schema in dev
    logging: process.env.NODE_ENV === 'development',
    ssl: false,

    // Connection pool configuration for high throughput
    extra: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 50, // Maximum connections in pool
      min: parseInt(process.env.DB_POOL_MIN, 10) || 10, // Minimum idle connections
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Wait up to 5s for a connection
    },
  }),
);
