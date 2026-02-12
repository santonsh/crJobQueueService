import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.WORKER_STATS_PORT || 3001;
  await app.listen(port);

  console.log('='.repeat(80));
  console.log(`⚙️  Worker is running on: http://localhost:${port}`);
  console.log(`   Concurrency: ${process.env.WORKER_CONCURRENCY || 10}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(80));
}

bootstrap();
