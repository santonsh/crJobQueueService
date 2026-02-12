import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsModule } from '../jobs/jobs.module';
import { MonitorController } from './monitor.controller';
import { DebugController } from './debug.controller';
import { MonitorService } from './monitor.service';
import { Job } from '@/common/entities/job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]), // Import Job repository for DebugController
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
    JobsModule, // Import to use JobsService
  ],
  controllers: [MonitorController, DebugController],
  providers: [MonitorService],
  exports: [MonitorService],
})
export class MonitorModule {}
