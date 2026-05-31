import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

const { WorkerModule } = await import('./worker.module.js');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // eslint-disable-next-line no-console
  console.log('worker started');
  // Keep the process alive; BullMQ workers wait for jobs in the background.
}

void bootstrap();
