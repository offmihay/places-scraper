import { customType } from 'drizzle-orm/pg-core';
import type { AnyPolygon } from '@places/shared';

/** MultiPolygon in EPSG:4326 — stored as PostGIS geometry. */
export const multiPolygon4326 = customType<{ data: AnyPolygon; driverData: string }>({
  dataType: () => 'geometry(MultiPolygon, 4326)',
});

/** Point geography in EPSG:4326 — distance queries in metres. */
export const pointGeography = customType<{
  data: { lat: number; lng: number };
  driverData: string;
}>({
  dataType: () => 'geography(Point, 4326)',
});
