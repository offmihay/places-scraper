import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import compression from 'compression';
import helmet from 'helmet';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

const { AppModule } = await import('./app.module.js');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(compression());
  const origins = process.env.WEB_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: origins && origins.length > 0 ? origins : true,
    credentials: true,
  });
  app.setGlobalPrefix('api');

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
}

void bootstrap();
