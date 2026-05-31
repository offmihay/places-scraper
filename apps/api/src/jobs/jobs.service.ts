import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { desc, eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';
import { QUEUE_ORCHESTRATOR } from '../queue/queue.module.js';
import type { CreateJobDto } from './jobs.dto.js';

@Injectable()
export class JobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @InjectQueue(QUEUE_ORCHESTRATOR) private readonly orchestratorQueue: Queue<{ jobId: string }>,
  ) {}

  list(limit = 50, offset = 0) {
    return this.db
      .select()
      .from(schema.scrapeJobs)
      .orderBy(desc(schema.scrapeJobs.createdAt))
      .limit(limit)
      .offset(offset);
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

  async create(dto: CreateJobDto, createdBy?: string) {
    const [area] = await this.db
      .select({ id: schema.areas.id })
      .from(schema.areas)
      .where(eq(schema.areas.id, dto.areaId))
      .limit(1);
    if (!area) throw new BadRequestException('Area not found');

    const initialRadius =
      dto.radiusM ?? (dto.mode === 'default' ? this.config.get('DEFAULT_CELL_RADIUS_M') : 1500);

    // Snapshot the polygon into the job row so subsequent area edits don't
    // change what's being scanned. Drizzle handles text[] natively via its
    // postgres-js driver, but we need a SQL subquery for the geometry copy.
    const [created] = await this.db
      .insert(schema.scrapeJobs)
      .values({
        areaId: dto.areaId,
        polygonSnapshot: sql`(SELECT polygon FROM areas WHERE id = ${dto.areaId})` as never,
        types: dto.types,
        initialRadiusM: initialRadius,
        mode: dto.mode,
        maxCostUsd: dto.maxCostUsd,
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
    // Remove the orchestrator job if it hasn't dispatched yet.
    await this.orchestratorQueue.remove(`orch__${id}`).catch(() => {});
    return this.get(id);
  }
}
