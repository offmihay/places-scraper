import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigService } from '../config/config.service.js';

export const QUEUE_ORCHESTRATOR = 'scrape-orchestrator';
export const QUEUE_CELLS = 'scrape-cells';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_ORCHESTRATOR }, { name: QUEUE_CELLS }),
  ],
  exports: [BullModule],
})
export class AppQueueModule {}
