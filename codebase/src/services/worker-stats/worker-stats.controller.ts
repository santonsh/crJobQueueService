import { Controller, Get } from '@nestjs/common';
import { WorkerStatsService } from './worker-stats.service';

@Controller('stats')
export class WorkerStatsController {
  constructor(private readonly workerStatsService: WorkerStatsService) {}

  @Get()
  getStats() {
    return this.workerStatsService.getStats();
  }
}
