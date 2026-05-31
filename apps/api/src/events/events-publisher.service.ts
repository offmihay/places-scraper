import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { jobEventsChannel, type JobEvent } from '@places/shared';
import { AppConfigService } from '../config/config.service.js';

@Injectable()
export class EventsPublisher implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.client = new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: null });
  }

  publish(event: JobEvent): void {
    void this.client.publish(jobEventsChannel(event.jobId), JSON.stringify(event));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => {});
  }
}
