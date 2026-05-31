import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { areas } from './areas.js';
import { users } from './users.js';
import { multiPolygon4326 } from './columns.js';

export const jobMode = pgEnum('job_mode', ['default', 'auto', 'manual']);

export const jobStatus = pgEnum('job_status', [
  'pending',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
]);

export const scrapeJobs = pgTable(
  'scrape_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    // Snapshot of the polygon at job start time — area edits don't reshape running jobs.
    polygonSnapshot: multiPolygon4326('polygon_snapshot').notNull(),
    types: text('types').array().notNull(),
    initialRadiusM: integer('initial_radius_m').notNull(),
    mode: jobMode('mode').notNull().default('default'),
    status: jobStatus('status').notNull().default('pending'),
    progressDone: integer('progress_done').notNull().default(0),
    progressTotal: integer('progress_total').notNull().default(0),
    estimatedCostUsd: doublePrecision('estimated_cost_usd'),
    actualCostUsd: doublePrecision('actual_cost_usd').notNull().default(0),
    maxCostUsd: doublePrecision('max_cost_usd').notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('scrape_jobs_status_idx').on(t.status),
    areaIdx: index('scrape_jobs_area_idx').on(t.areaId),
    createdAtIdx: index('scrape_jobs_created_at_idx').on(t.createdAt),
  }),
);

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type NewScrapeJob = typeof scrapeJobs.$inferInsert;
