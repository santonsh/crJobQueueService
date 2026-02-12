import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from '@/services/health/health.module';
import { JobsModule } from '@/services/jobs/jobs.module';
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
    HealthModule,
    JobsModule,
  ],
})
export class AppModule {}
