import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job } from '@/common/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    BullModule.registerQueueAsync({
      name: 'jobs',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('queue.redis.host'),
          port: configService.get('queue.redis.port'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService], // Export for use in Worker and Monitor
})
export class JobsModule {}
