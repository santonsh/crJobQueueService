import { Controller, Get } from '@nestjs/common';
import { MonitorService } from './monitor.service';

@Controller('metrics')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get('jobs')
  getJobMetrics() {
    return this.monitorService.getJobMetrics();
  }

  @Get('queue')
  getQueueMetrics() {
    return this.monitorService.getQueueMetrics();
  }

  @Get('workers')
  getWorkerMetrics() {
    return this.monitorService.getWorkerMetrics();
  }

  @Get('system')
  getSystemMetrics() {
    return this.monitorService.getSystemMetrics();
  }
}
