import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Job Queue Service API')
    .setDescription(
      'Asynchronous job processing service with PostgreSQL and BullMQ. ' +
      'Submit jobs, query status, and cancel jobs. Target throughput: 1K-2K QPS.',
    )
    .setVersion('1.0')
    .addTag('jobs', 'Job submission, query, and cancellation endpoints')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3000;
  await app.listen(port);

  console.log('='.repeat(80));
  console.log(`🚀 API Server is running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs available at: http://localhost:${port}/api/docs`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(80));
}

bootstrap();
