import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from '@/services/health/health.module';
import { WorkerStatsModule } from '@/services/worker-stats/worker-stats.module';
import { ProcessorModule } from '@/services/processor/processor.module';
import appConfig from '@/config/app.config';
import databaseConfig from '@/config/database.config';
import queueConfig from '@/config/queue.config';
import jobsConfig from '@/config/jobs.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [appConfig, databaseConfig, queueConfig, jobsConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.get('database'),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('queue.redis.host'),
          port: configService.get('queue.redis.port'),
        },
      }),
      inject: [ConfigService],
    }),
    HealthModule,
    WorkerStatsModule,
    ProcessorModule,
  ],
})
export class AppModule {}
