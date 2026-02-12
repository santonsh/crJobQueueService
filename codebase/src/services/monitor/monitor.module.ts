import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';

@Module({
  imports: [JobsModule], // Import to use JobsService
  controllers: [MonitorController],
  providers: [MonitorService],
  exports: [MonitorService],
})
export class MonitorModule {}
