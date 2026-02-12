import { Module } from '@nestjs/common';
import { WorkerStatsController } from './worker-stats.controller';
import { WorkerStatsService } from './worker-stats.service';

@Module({
  controllers: [WorkerStatsController],
  providers: [WorkerStatsService],
  exports: [WorkerStatsService],
})
export class WorkerStatsModule {}
