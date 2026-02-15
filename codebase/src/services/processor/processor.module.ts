import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsModule } from '../jobs/jobs.module';
import { WorkerStatsModule } from '../worker-stats/worker-stats.module';
import { JobHandlersModule } from '../job-handlers/job-handlers.module';
import { ProcessorService } from './processor.service';
import { JobsProcessor } from './jobs.processor';

@Module({
  imports: [
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
    WorkerStatsModule, // Import to use WorkerStatsService
    JobHandlersModule, // Import to use JobHandlerRegistry
  ],
  providers: [ProcessorService, JobsProcessor],
  exports: [ProcessorService],
})
export class ProcessorModule {}
