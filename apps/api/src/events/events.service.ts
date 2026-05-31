import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import { jobEventsChannel, type JobEvent } from '@places/shared';
import { AppConfigService } from '../config/config.service.js';

type Handler = (event: JobEvent) => void;

@Injectable()
export class EventsSubscriber implements OnModuleDestroy {
  private readonly log = new Logger(EventsSubscriber.name);
  private readonly sub: Redis;
  private readonly handlers = new Map<string, Set<Handler>>(); // channel → handlers

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.sub = new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: null });
    this.sub.on('message', (channel, message) => this.dispatch(channel, message));
    this.sub.on('error', (err) => this.log.error({ err: err.message }, 'redis sub error'));
  }

  /**
   * Returns an Observable that emits JobEvents for a single job.
   * Manages Redis subscribe/unsubscribe based on listener reference count.
   */
  stream(jobId: string): Observable<JobEvent> {
    const channel = jobEventsChannel(jobId);
    return new Observable<JobEvent>((subscriber) => {
      const handler: Handler = (event) => subscriber.next(event);
      this.addHandler(channel, handler);
      return () => {
        this.removeHandler(channel, handler);
      };
    });
  }

  private addHandler(channel: string, handler: Handler): void {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.add(handler);
      return;
    }
    const set = new Set<Handler>([handler]);
    this.handlers.set(channel, set);
    void this.sub.subscribe(channel).catch((err: Error) => {
      this.log.error({ channel, err: err.message }, 'subscribe failed');
    });
  }

  private removeHandler(channel: string, handler: Handler): void {
    const set = this.handlers.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(channel);
      void this.sub.unsubscribe(channel).catch(() => {});
    }
  }

  private dispatch(channel: string, raw: string): void {
    const set = this.handlers.get(channel);
    if (!set) return;
    let event: JobEvent;
    try {
      event = JSON.parse(raw) as JobEvent;
    } catch {
      return;
    }
    for (const h of set) h(event);
  }

  async onModuleDestroy(): Promise<void> {
    await this.sub.quit().catch(() => {});
  }
}
