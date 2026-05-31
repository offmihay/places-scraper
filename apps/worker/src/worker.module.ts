import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { AppQueueModule } from './queue/queue.module.js';
import { KeysClaimService } from './keys/keys-claim.service.js';
import { PlacesClient } from './scraper/places-client.js';
import { OrchestratorProcessor } from './orchestrator/orchestrator.processor.js';
import { CellProcessor } from './cells/cell.processor.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false,
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
      },
    }),
    DbModule,
    AppQueueModule,
  ],
  providers: [KeysClaimService, PlacesClient, OrchestratorProcessor, CellProcessor],
})
export class WorkerModule {}
