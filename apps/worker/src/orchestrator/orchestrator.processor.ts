import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { enumerateGridCenters } from '@places/shared';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';
import { EventsPublisher } from '../events/events.service.js';
import {
  JOB_SCRAPE_CELL,
  QUEUE_CELLS,
  QUEUE_ORCHESTRATOR,
  type CellJobData,
  type OrchestratorJobData,
} from '../queue/queue.constants.js';

@Processor(QUEUE_ORCHESTRATOR)
export class OrchestratorProcessor extends WorkerHost {
  private readonly log = new Logger(OrchestratorProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(EventsPublisher) private readonly events: EventsPublisher,
    @InjectQueue(QUEUE_CELLS) private readonly cellsQueue: Queue<CellJobData>,
  ) {
    super();
  }

  async process(job: Job<OrchestratorJobData>): Promise<{ enqueued: number }> {
    try {
      return await this.processInner(job);
    } catch (err) {
      this.log.error(
        { jobId: job.data.jobId, err: (err as Error).message, stack: (err as Error).stack },
        'orchestrator failed',
      );
      throw err;
    }
  }

  private async processInner(job: Job<OrchestratorJobData>): Promise<{ enqueued: number }> {
    const { jobId } = job.data;
    this.log.log({ jobId }, 'orchestrating job');

    const [scrapeJob] = await this.db
      .select()
      .from(schema.scrapeJobs)
      .where(eq(schema.scrapeJobs.id, jobId))
      .limit(1);

    if (!scrapeJob) throw new Error(`scrape_job ${jobId} not found`);
    if (scrapeJob.status === 'cancelled') {
      this.log.warn({ jobId }, 'job already cancelled, skipping orchestration');
      return { enqueued: 0 };
    }

    const bbox = await this.computeBbox(jobId);
    const radius = scrapeJob.initialRadiusM;

    const candidates = [...enumerateGridCenters(bbox, radius)];
    if (candidates.length === 0) {
      await this.markEmpty(jobId);
      return { enqueued: 0 };
    }

    // Single-query filter: which candidates fall inside the polygon?
    const inside = await this.filterInside(jobId, candidates);
    this.log.log(
      { jobId, candidates: candidates.length, inside: inside.length, radius },
      'grid generated',
    );

    if (inside.length === 0) {
      await this.markEmpty(jobId);
      return { enqueued: 0 };
    }

    await this.db
      .update(schema.scrapeJobs)
      .set({ status: 'running', progressTotal: inside.length, startedAt: new Date() })
      .where(eq(schema.scrapeJobs.id, jobId));
    this.events.publish({ kind: 'status', jobId, status: 'running' });
    this.events.publish({ kind: 'progress', jobId, done: 0, total: inside.length, costUsd: 0 });

    const cellJobs = inside.map((c) => ({
      name: JOB_SCRAPE_CELL,
      data: { jobId, lat: c.lat, lng: c.lng, radiusM: radius, depth: 0 } as CellJobData,
      opts: {
        attempts: 5,
        backoff: { type: 'exponential' as const, delay: 2000 },
        jobId: `${jobId}__0__${c.lat.toFixed(6)}__${c.lng.toFixed(6)}`,
      },
    }));

    // Bulk add in chunks so we don't blow up Redis pipeline buffers on huge jobs.
    const CHUNK = 500;
    for (let i = 0; i < cellJobs.length; i += CHUNK) {
      await this.cellsQueue.addBulk(cellJobs.slice(i, i + CHUNK));
    }
    return { enqueued: cellJobs.length };
  }

  private async computeBbox(jobId: string) {
    const rows = await this.db.execute<{
      min_lng: number;
      min_lat: number;
      max_lng: number;
      max_lat: number;
    }>(sql`
      SELECT
        ST_XMin(polygon_snapshot) AS min_lng,
        ST_YMin(polygon_snapshot) AS min_lat,
        ST_XMax(polygon_snapshot) AS max_lng,
        ST_YMax(polygon_snapshot) AS max_lat
      FROM scrape_jobs WHERE id = ${jobId}
    `);
    const r = rows[0]!;
    return {
      minLat: Number(r.min_lat),
      minLng: Number(r.min_lng),
      maxLat: Number(r.max_lat),
      maxLng: Number(r.max_lng),
    };
  }

  private async filterInside(
    jobId: string,
    candidates: { lat: number; lng: number }[],
  ): Promise<{ lat: number; lng: number }[]> {
    const json = JSON.stringify(candidates);
    const rows = await this.db.execute<{ lat: number; lng: number }>(sql`
      WITH job AS (SELECT polygon_snapshot AS poly FROM scrape_jobs WHERE id = ${jobId}),
           pts AS (
             SELECT (e->>'lat')::float8 AS lat, (e->>'lng')::float8 AS lng
             FROM jsonb_array_elements(${json}::jsonb) AS e
           )
      SELECT lat, lng
      FROM pts, job
      WHERE ST_Contains(job.poly, ST_SetSRID(ST_Point(lng, lat), 4326))
    `);
    return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }));
  }

  private async markEmpty(jobId: string): Promise<void> {
    await this.db
      .update(schema.scrapeJobs)
      .set({
        status: 'completed',
        progressTotal: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(schema.scrapeJobs.id, jobId));
  }
}
