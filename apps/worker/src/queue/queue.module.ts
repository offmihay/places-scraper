import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigService } from '../config/config.service.js';
import { QUEUE_ORCHESTRATOR, QUEUE_CELLS } from './queue.constants.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
        defaultJobOptions: {
          removeOnComplete: { age: 60 * 60 * 24, count: 5000 },
          removeOnFail: { age: 60 * 60 * 24 * 7, count: 1000 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_ORCHESTRATOR }, { name: QUEUE_CELLS }),
  ],
  exports: [BullModule],
})
export class AppQueueModule {}
