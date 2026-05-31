import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KeysService } from './keys.service.js';

@Injectable()
export class KeysCron {
  private readonly log = new Logger(KeysCron.name);

  constructor(@Inject(KeysService) private readonly keys: KeysService) {}

  // Midnight UTC daily.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async resetDailyUsage() {
    const reset = await this.keys.resetDailyUsage();
    this.log.log(`Reset daily usage on ${reset} api keys`);
  }
}
