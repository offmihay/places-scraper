import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { scrapeJobs } from './scrape-jobs.js';
import { apiKeys } from './api-keys.js';
import { pointGeography } from './columns.js';

export const apiCallStatus = pgEnum('api_call_status', ['ok', 'failed', 'rate_limited']);

export const apiCalls = pgTable(
  'api_calls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => scrapeJobs.id, { onDelete: 'cascade' }),
    keyId: uuid('key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
    cellLat: doublePrecision('cell_lat').notNull(),
    cellLng: doublePrecision('cell_lng').notNull(),
    cellRadiusM: integer('cell_radius_m').notNull(),
    // Centre point for spatial filtering on the coverage map.
    cellGeom: pointGeography('cell_geom').notNull(),
    resultsCount: integer('results_count').notNull().default(0),
    overflow: boolean('overflow').notNull().default(false),
    status: apiCallStatus('status').notNull(),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    jobIdx: index('api_calls_job_idx').on(t.jobId, t.createdAt),
    keyIdx: index('api_calls_key_idx').on(t.keyId, t.createdAt),
    // Spatial + cache-lookup indexes are in init.sql.
  }),
);

export type ApiCall = typeof apiCalls.$inferSelect;
export type NewApiCall = typeof apiCalls.$inferInsert;
