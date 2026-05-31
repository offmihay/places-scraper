import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { pointGeography } from './columns.js';

export const places = pgTable(
  'places',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    placeId: text('place_id').notNull(),
    name: text('name'),
    formattedAddress: text('formatted_address'),
    city: text('city'),
    country: text('country'), // ISO-2; filled by trigger via point-in-polygon against areas.
    location: pointGeography('location').notNull(),
    types: text('types').array().notNull().default([]),
    primaryType: text('primary_type'),
    businessStatus: text('business_status'),
    phone: text('phone'),
    googleMapsUri: text('google_maps_uri'),
    rawData: jsonb('raw_data').notNull(),
    sourceJobIds: uuid('source_job_ids').array().notNull().default([]),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    placeIdUq: uniqueIndex('places_place_id_uq').on(t.placeId),
    countryIdx: index('places_country_idx').on(t.country),
    primaryTypeIdx: index('places_primary_type_idx').on(t.primaryType),
    // GIST + GIN indexes are created in init.sql.
  }),
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
