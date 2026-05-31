import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { enumerateGridCenters, estimateCost } from '@places/shared';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';
import { EventsPublisher } from '../events/events-publisher.service.js';
import { QUEUE_ORCHESTRATOR, QUEUE_CELLS } from '../queue/queue.module.js';
import type { CreateJobDto, EstimateJobDto, ListJobsQuery } from './jobs.dto.js';

interface CellJobData {
  jobId: string;
  lat: number;
  lng: number;
  radiusM: number;
  depth: number;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(EventsPublisher) private readonly events: EventsPublisher,
    @InjectQueue(QUEUE_ORCHESTRATOR) private readonly orchestratorQueue: Queue<{ jobId: string }>,
    @InjectQueue(QUEUE_CELLS) private readonly cellsQueue: Queue<CellJobData>,
  ) {}

  list(query: ListJobsQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(schema.scrapeJobs.status, query.status));
    if (query.areaId) filters.push(eq(schema.scrapeJobs.areaId, query.areaId));
    return this.db
      .select()
      .from(schema.scrapeJobs)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.scrapeJobs.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.scrapeJobs)
      .where(eq(schema.scrapeJobs.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Job not found');
    return row;
  }

  /**
   * Cells inside the area assuming the requested initial radius. Used both
   * for cost preview and for sanity checks before insert.
   */
  async estimate(dto: EstimateJobDto) {
    const [area] = await this.db
      .select({ id: schema.areas.id })
      .from(schema.areas)
      .where(eq(schema.areas.id, dto.areaId))
      .limit(1);
    if (!area) throw new BadRequestException('Area not found');

    const radius =
      dto.radiusM ?? (dto.mode === 'default' ? this.config.get('DEFAULT_CELL_RADIUS_M') : 1500);

    const bboxRows = await this.db.execute<{
      min_lng: number;
      min_lat: number;
      max_lng: number;
      max_lat: number;
    }>(sql`
      SELECT ST_XMin(polygon) AS min_lng, ST_YMin(polygon) AS min_lat,
             ST_XMax(polygon) AS max_lng, ST_YMax(polygon) AS max_lat
      FROM areas WHERE id = ${dto.areaId}
    `);
    const b = bboxRows[0]!;
    const candidates = [
      ...enumerateGridCenters(
        {
          minLat: Number(b.min_lat),
          minLng: Number(b.min_lng),
          maxLat: Number(b.max_lat),
          maxLng: Number(b.max_lng),
        },
        radius,
      ),
    ];

    let inside = candidates.length;
    if (candidates.length > 0) {
      const json = JSON.stringify(candidates);
      const cnt = await this.db.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM jsonb_array_elements(${json}::jsonb) AS e,
             (SELECT polygon AS p FROM areas WHERE id = ${dto.areaId}) AS a
        WHERE ST_Contains(a.p, ST_SetSRID(ST_Point((e->>'lng')::float8, (e->>'lat')::float8), 4326))
      `);
      inside = Number(cnt[0]?.count ?? 0);
    }

    const cost = estimateCost(inside, this.config.get('GOOGLE_PLACES_COST_PER_CALL_USD'));
    // Rough duration: rate-limit-bound, assume 10 calls/sec sustained.
    const callsPerSec = 10;
    const estimatedDurationMin = Math.ceil(cost.effectiveCalls / callsPerSec / 60);
    return {
      areaId: dto.areaId,
      radiusM: radius,
      ...cost,
      estimatedDurationMin,
    };
  }

  async create(dto: CreateJobDto, createdBy?: string) {
    const [area] = await this.db
      .select({ id: schema.areas.id })
      .from(schema.areas)
      .where(eq(schema.areas.id, dto.areaId))
      .limit(1);
    if (!area) throw new BadRequestException('Area not found');

    const estimate = await this.estimate(dto);

    const [created] = await this.db
      .insert(schema.scrapeJobs)
      .values({
        areaId: dto.areaId,
        polygonSnapshot: sql`(SELECT polygon FROM areas WHERE id = ${dto.areaId})` as never,
        types: dto.types,
        initialRadiusM: estimate.radiusM,
        mode: dto.mode,
        maxCostUsd: dto.maxCostUsd,
        estimatedCostUsd: estimate.estimatedCostUsd,
        createdBy: createdBy ?? null,
        status: 'pending',
      })
      .returning({ id: schema.scrapeJobs.id });
    const jobId = created!.id;

    await this.orchestratorQueue.add(
      'orchestrate',
      { jobId },
      { jobId: `orch__${jobId}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return this.get(jobId);
  }

  async cancel(id: string) {
    const job = await this.get(id);
    if (job.status === 'completed' || job.status === 'cancelled') return job;
    await this.db
      .update(schema.scrapeJobs)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(eq(schema.scrapeJobs.id, id));
    await this.orchestratorQueue.remove(`orch__${id}`).catch(() => {});
    this.events.publish({ kind: 'status', jobId: id, status: 'cancelled' });
    return this.get(id);
  }

  /**
   * Lift a paused job back to running, optionally bumping the budget so it
   * actually has headroom. Re-enqueue any pending cells (BullMQ keeps them
   * sitting in failed if their last attempt threw on the cost guard).
   */
  async resume(id: string, newMaxCostUsd?: number) {
    const job = await this.get(id);
    if (job.status !== 'paused') {
      throw new BadRequestException(`Job is ${job.status}, only paused jobs can resume`);
    }
    const max = newMaxCostUsd ?? job.maxCostUsd;
    await this.db
      .update(schema.scrapeJobs)
      .set({ status: 'running', maxCostUsd: max, error: null })
      .where(eq(schema.scrapeJobs.id, id));
    this.events.publish({ kind: 'status', jobId: id, status: 'running' });
    // Retry any failed cells; the worker's cost guard will pause again if
    // the new budget is still insufficient.
    await this.retryFailed(id);
    return this.get(id);
  }

  /**
   * Move cells from BullMQ's failed set back to waiting. Useful both for
   * the dedicated POST :id/retry-failed endpoint and as part of resume().
   */
  async retryFailed(id: string): Promise<{ retried: number }> {
    await this.get(id);
    const failed = await this.cellsQueue.getFailed();
    let retried = 0;
    for (const job of failed) {
      if (job.data?.jobId !== id) continue;
      await job.retry();
      retried += 1;
    }
    return { retried };
  }

}
