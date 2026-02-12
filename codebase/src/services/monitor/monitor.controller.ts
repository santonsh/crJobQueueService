import { Controller, Get } from '@nestjs/common';
import { MonitorService } from './monitor.service';

@Controller('metrics')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get('jobs')
  async getJobMetrics() {
    return await this.monitorService.getJobMetrics();
  }

  @Get('queue')
  async getQueueMetrics() {
    return await this.monitorService.getQueueMetrics();
  }

  @Get('workers')
  async getWorkerMetrics() {
    return await this.monitorService.getWorkerMetrics();
  }

  @Get('system')
  getSystemMetrics() {
    return this.monitorService.getSystemMetrics();
  }
}
