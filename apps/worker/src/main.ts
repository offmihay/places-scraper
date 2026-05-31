import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // eslint-disable-next-line no-console
  console.log('worker started');
  // Keep the process alive; BullMQ workers wait for jobs in the background.
}

void bootstrap();
