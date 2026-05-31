import {
  pgTable,
  uuid,
  text,
  boolean,
  doublePrecision,
  timestamp,
  pgEnum,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { multiPolygon4326 } from './columns.js';

export const areaType = pgEnum('area_type', ['country', 'custom', 'derived']);

export const areas = pgTable(
  'areas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: areaType('type').notNull(),
    name: text('name').notNull(),
    isoCode: text('iso_code'),
    polygon: multiPolygon4326('polygon').notNull(),
    areaKm2: doublePrecision('area_km2'),
    parentAreaId: uuid('parent_area_id').references((): AnyPgColumn => areas.id, {
      onDelete: 'set null',
    }),
    isPreset: boolean('is_preset').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    typeIdx: index('areas_type_idx').on(t.type),
    isoIdx: index('areas_iso_idx').on(t.isoCode),
    // Spatial index is created manually in init.sql (GIST not natively supported by drizzle-kit yet).
  }),
);

export type Area = typeof areas.$inferSelect;
export type NewArea = typeof areas.$inferInsert;
