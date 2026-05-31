import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { METRES_PER_DEGREE_LAT } from '@places/shared';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';
import { KeysClaimService } from '../keys/keys-claim.service.js';
import { PlacesClient } from '../scraper/places-client.js';
import { EventsPublisher } from '../events/events.service.js';
import { upsertPlaces } from './places-upsert.js';
import {
  JOB_SCRAPE_CELL,
  QUEUE_CELLS,
  type CellJobData,
} from '../queue/queue.constants.js';

const MAX_QUADTREE_DEPTH = 6;

@Processor(QUEUE_CELLS, {
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  limiter: {
    max: Number(process.env.WORKER_RATE_LIMIT_MAX ?? 10),
    duration: Number(process.env.WORKER_RATE_LIMIT_DURATION_MS ?? 1000),
  },
})
export class CellProcessor extends WorkerHost {
  private readonly log = new Logger(CellProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(KeysClaimService) private readonly keys: KeysClaimService,
    @Inject(PlacesClient) private readonly client: PlacesClient,
    @Inject(EventsPublisher) private readonly events: EventsPublisher,
    @InjectQueue(QUEUE_CELLS) private readonly cellsQueue: Queue<CellJobData>,
  ) {
    super();
  }

  async process(job: Job<CellJobData>): Promise<{ status: string; results?: number }> {
    try {
      return await this.processInner(job);
    } catch (err) {
      this.log.error(
        {
          jobId: job.data.jobId,
          lat: job.data.lat,
          lng: job.data.lng,
          err: (err as Error).message,
        },
        'cell failed',
      );
      throw err;
    }
  }

  private async processInner(
    job: Job<CellJobData>,
  ): Promise<{ status: string; results?: number }> {
    const { jobId, lat, lng, radiusM, depth } = job.data;
    const costPerCall = this.config.get('GOOGLE_PLACES_COST_PER_CALL_USD');

    const scrapeJob = await this.loadJob(jobId);
    if (!scrapeJob) {
      this.log.warn({ jobId }, 'parent job vanished');
      return { status: 'orphaned' };
    }
    if (scrapeJob.status === 'cancelled' || scrapeJob.status === 'paused') {
      return { status: scrapeJob.status };
    }
    if (scrapeJob.actualCostUsd + costPerCall > scrapeJob.maxCostUsd) {
      await this.db
        .update(schema.scrapeJobs)
        .set({ status: 'paused', error: 'max_cost reached' })
        .where(eq(schema.scrapeJobs.id, jobId));
      this.log.warn({ jobId, actual: scrapeJob.actualCostUsd }, 'paused on max_cost');
      this.events.publish({ kind: 'status', jobId, status: 'paused' });
      return { status: 'paused' };
    }

    if (await this.cacheHit(jobId, lat, lng, radiusM)) {
      const after = await this.bumpProgress(jobId, 0);
      this.events.publish({
        kind: 'cell',
        jobId,
        lat,
        lng,
        radiusM,
        status: 'cache_hit',
        resultsCount: 0,
        overflow: false,
      });
      this.events.publish({ kind: 'progress', jobId, ...after });
      await this.maybeFinish(jobId);
      return { status: 'cache-hit' };
    }

    const claim = await this.keys.claim();
    if (!claim) {
      throw new Error('no active api keys available'); // BullMQ retries
    }

    const apiRes = await this.client.nearbySearch({
      apiKey: claim.key,
      lat,
      lng,
      radiusM,
      includedTypes: scrapeJob.types,
    });

    if (!apiRes.ok) {
      const callStatus = apiRes.error.kind === 'rate-limited' ? 'rate_limited' : 'failed';
      await this.logCall({
        jobId,
        keyId: claim.id,
        lat,
        lng,
        radiusM,
        status: callStatus,
        resultsCount: 0,
        overflow: false,
        latencyMs: apiRes.latencyMs,
        errorMessage: apiRes.error.message.slice(0, 500),
      });
      if (apiRes.error.kind === 'quota-exhausted') {
        await this.keys.markExhausted(claim.id);
      } else {
        await this.keys.refund(claim.id);
      }
      this.events.publish({
        kind: 'cell',
        jobId,
        lat,
        lng,
        radiusM,
        status: callStatus,
        resultsCount: 0,
        overflow: false,
      });
      throw new Error(`places api ${apiRes.error.kind}: ${apiRes.error.message.slice(0, 200)}`);
    }

    const placesArr = apiRes.places;
    const inserted = await upsertPlaces(this.db, jobId, placesArr);
    const overflow = placesArr.length >= 20;

    await this.logCall({
      jobId,
      keyId: claim.id,
      lat,
      lng,
      radiusM,
      status: 'ok',
      resultsCount: placesArr.length,
      overflow,
      latencyMs: apiRes.latencyMs,
    });

    const after = await this.bumpProgress(jobId, costPerCall);

    if (overflow && depth < MAX_QUADTREE_DEPTH) {
      const minRadius = this.config.get('MIN_CELL_RADIUS_M');
      const childRadius = Math.floor(radiusM / 2);
      if (childRadius >= minRadius) {
        await this.enqueueChildren({ jobId, lat, lng, radiusM, depth });
      }
    }

    this.events.publish({
      kind: 'cell',
      jobId,
      lat,
      lng,
      radiusM,
      status: 'ok',
      resultsCount: placesArr.length,
      overflow,
    });
    this.events.publish({ kind: 'progress', jobId, ...after });
    await this.maybeFinish(jobId);
    return { status: 'ok', results: inserted };
  }

  private async loadJob(jobId: string) {
    const [row] = await this.db
      .select()
      .from(schema.scrapeJobs)
      .where(eq(schema.scrapeJobs.id, jobId))
      .limit(1);
    return row ?? null;
  }

  private async cacheHit(
    jobId: string,
    lat: number,
    lng: number,
    radiusM: number,
  ): Promise<boolean> {
    const ttlDays = this.config.get('CACHE_TTL_DAYS');
    if (ttlDays === 0) return false;
    const rows = await this.db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM api_calls
        WHERE job_id = ${jobId}
          AND cell_lat = ${lat}
          AND cell_lng = ${lng}
          AND cell_radius_m = ${radiusM}
          AND status = 'ok'
          AND created_at > now() - (${ttlDays} || ' days')::interval
        LIMIT 1
      ) AS exists
    `);
    return rows[0]?.exists === true;
  }

  private async logCall(args: {
    jobId: string;
    keyId: string;
    lat: number;
    lng: number;
    radiusM: number;
    status: 'ok' | 'failed' | 'rate_limited';
    resultsCount: number;
    overflow: boolean;
    latencyMs: number;
    errorMessage?: string;
  }) {
    await this.db.execute(sql`
      INSERT INTO api_calls (
        job_id, key_id, cell_lat, cell_lng, cell_radius_m,
        cell_geom, results_count, overflow, status, latency_ms, error_message
      ) VALUES (
        ${args.jobId},
        ${args.keyId},
        ${args.lat},
        ${args.lng},
        ${args.radiusM},
        ST_SetSRID(ST_Point(${args.lng}, ${args.lat}), 4326)::geography,
        ${args.resultsCount},
        ${args.overflow},
        ${args.status}::api_call_status,
        ${args.latencyMs},
        ${args.errorMessage ?? null}
      )
    `);
  }

  private async bumpProgress(
    jobId: string,
    costInc: number,
  ): Promise<{ done: number; total: number; costUsd: number }> {
    const rows = await this.db.execute<{
      progress_done: number;
      progress_total: number;
      actual_cost_usd: number;
    }>(sql`
      UPDATE scrape_jobs
      SET progress_done = progress_done + 1,
          actual_cost_usd = actual_cost_usd + ${costInc}
      WHERE id = ${jobId}
      RETURNING progress_done, progress_total, actual_cost_usd
    `);
    const r = rows[0]!;
    return {
      done: Number(r.progress_done),
      total: Number(r.progress_total),
      costUsd: Number(r.actual_cost_usd),
    };
  }

  private async maybeFinish(jobId: string): Promise<void> {
    const rows = await this.db.execute<{ id: string }>(sql`
      UPDATE scrape_jobs
      SET status = 'completed',
          completed_at = now()
      WHERE id = ${jobId}
        AND status = 'running'
        AND progress_done >= progress_total
      RETURNING id
    `);
    if (rows.length > 0) {
      this.events.publish({ kind: 'status', jobId, status: 'completed' });
    }
  }

  private async enqueueChildren(parent: CellJobData): Promise<void> {
    const { jobId, lat, lng, radiusM, depth } = parent;
    const childRadius = Math.floor(radiusM / 2);
    const dLat = childRadius / METRES_PER_DEGREE_LAT;
    const dLng = childRadius / (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));

    const offsets: Array<[number, number]> = [
      [+dLat / 2, +dLng / 2],
      [+dLat / 2, -dLng / 2],
      [-dLat / 2, +dLng / 2],
      [-dLat / 2, -dLng / 2],
    ];

    const children = offsets.map(([latOff, lngOff]) => {
      const childLat = lat + latOff;
      const childLng = lng + lngOff;
      return {
        name: JOB_SCRAPE_CELL,
        data: {
          jobId,
          lat: childLat,
          lng: childLng,
          radiusM: childRadius,
          depth: depth + 1,
        } satisfies CellJobData,
        opts: {
          attempts: 5,
          backoff: { type: 'exponential' as const, delay: 2000 },
          jobId: `${jobId}__${depth + 1}__${childLat.toFixed(6)}__${childLng.toFixed(6)}`,
        },
      };
    });

    await this.cellsQueue.addBulk(children);
    // Adjust progress_total: we added 4 children but the parent counts as done.
    await this.db.execute(sql`
      UPDATE scrape_jobs SET progress_total = progress_total + 4 WHERE id = ${jobId}
    `);
  }
}
