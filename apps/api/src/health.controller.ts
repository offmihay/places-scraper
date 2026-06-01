import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import type { Database } from '@places/db';
import { DRIZZLE } from './db/db.tokens.js';
import { EventsPublisher } from './events/events-publisher.service.js';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(EventsPublisher) private readonly events: EventsPublisher,
  ) {}

  @Get()
  async check() {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.db.execute(sql`select 1`),
      this.events.ping(),
    ]);
    const db = dbResult.status === 'fulfilled';
    const redis = redisResult.status === 'fulfilled';
    if (!db || !redis) {
      throw new ServiceUnavailableException({ status: 'degraded', db, redis });
    }
    return { status: 'ok', db, redis, uptime: process.uptime() };
  }
}
