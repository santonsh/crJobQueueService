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
  }),
);
