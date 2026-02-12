import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.MONITOR_PORT || 3002;
  await app.listen(port);

  console.log('='.repeat(80));
  console.log(`📊 Monitor is running on: http://localhost:${port}`);
  console.log(`   Cron schedule: ${process.env.MONITOR_CRON_SCHEDULE || '*/2 * * * *'}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(80));
}

bootstrap();
