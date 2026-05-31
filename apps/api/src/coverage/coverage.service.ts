import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '@places/db';
import { DRIZZLE } from '../db/db.tokens.js';
import type { CellsQuery, HeatmapQuery, UncoveredQuery } from './coverage.dto.js';

@Injectable()
export class CoverageService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Each api_calls row becomes a Point Feature carrying its radius and
   * outcome. Front-end draws circles by converting metres to pixels at
   * the current zoom — see MapLibre circle-radius expression.
   */
  async cells(query: CellsQuery) {
    const where = this.cellsWhere(query);
    const rows = await this.db.execute<{ feature: string }>(sql`
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(cell_geom::geometry)::json,
        'properties', json_build_object(
          'id', id,
          'jobId', job_id,
          'radius', cell_radius_m,
          'status', status,
          'resultsCount', results_count,
          'overflow', overflow,
          'latencyMs', latency_ms,
          'createdAt', created_at
        )
      )::text AS feature
      FROM api_calls
      ${where}
      ORDER BY created_at DESC
      LIMIT ${query.limit}
    `);
    return {
      type: 'FeatureCollection' as const,
      features: rows.map((r) => JSON.parse(r.feature) as Record<string, unknown>),
    };
  }

  /**
   * Buffered union of all successful cells in the area, then subtracted
   * from the area polygon. The result is a MultiPolygon of what's NOT
   * yet covered — fed straight back into POST /api/areas to create a
   * supplementary-scan target.
   */
  async uncovered(areaId: string, query: UncoveredQuery) {
    const [area] = await this.db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM areas WHERE id = ${areaId}) AS exists
    `);
    if (!area?.exists) throw new NotFoundException('Area not found');

    const sinceClause = query.since
      ? sql`AND created_at >= ${query.since}`
      : sql``;

    const rows = await this.db.execute<{ geojson: string | null; covered_km2: number; total_km2: number }>(sql`
      WITH area AS (
        SELECT polygon AS poly,
               area_km2 AS total_km2
        FROM areas WHERE id = ${areaId}
      ),
      cells AS (
        SELECT ST_Buffer(cell_geom, cell_radius_m)::geometry AS buf
        FROM api_calls
        WHERE status = 'ok' AND results_count > 0
        ${sinceClause}
          AND ST_Intersects(cell_geom::geometry, (SELECT poly FROM area))
      ),
      union_buf AS (
        SELECT ST_Union(buf) AS u FROM cells
      ),
      diff AS (
        SELECT
          CASE WHEN union_buf.u IS NULL
            THEN area.poly
            ELSE ST_Multi(ST_CollectionExtract(ST_Difference(area.poly, ST_Intersection(union_buf.u, area.poly)), 3))
          END AS poly,
          area.total_km2 AS total_km2,
          COALESCE(ST_Area(ST_Intersection(union_buf.u, area.poly)::geography) / 1000000, 0) AS covered_km2
        FROM area, union_buf
      )
      SELECT
        CASE WHEN ST_IsEmpty(poly) THEN NULL ELSE ST_AsGeoJSON(poly)::text END AS geojson,
        covered_km2,
        total_km2
      FROM diff
    `);
    const row = rows[0]!;
    return {
      geometry: row.geojson ? (JSON.parse(row.geojson) as Record<string, unknown>) : null,
      coveredKm2: Number(row.covered_km2),
      totalKm2: Number(row.total_km2),
      uncoveredKm2: Number(row.total_km2) - Number(row.covered_km2),
    };
  }

  async summary(areaId: string) {
    const rows = await this.db.execute<{
      area_id: string;
      total_km2: number;
      covered_km2: number;
      last_scan_at: Date | null;
      total_places: string;
    }>(sql`
      WITH area AS (
        SELECT id, polygon AS poly, area_km2 AS total_km2
        FROM areas WHERE id = ${areaId}
      ),
      cells AS (
        SELECT ST_Buffer(cell_geom, cell_radius_m)::geometry AS buf, created_at
        FROM api_calls
        WHERE status = 'ok'
          AND ST_Intersects(cell_geom::geometry, (SELECT poly FROM area))
      ),
      covered AS (
        SELECT
          COALESCE(ST_Area(ST_Intersection(ST_Union(buf), (SELECT poly FROM area))::geography) / 1000000, 0) AS km2,
          MAX(created_at) AS last_at
        FROM cells
      ),
      total_places AS (
        SELECT COUNT(*)::text AS cnt FROM places
        WHERE ST_Contains((SELECT poly FROM area), location::geometry)
      )
      SELECT
        area.id AS area_id,
        area.total_km2,
        covered.km2 AS covered_km2,
        covered.last_at AS last_scan_at,
        total_places.cnt AS total_places
      FROM area, covered, total_places
    `);
    if (rows.length === 0) throw new NotFoundException('Area not found');
    const r = rows[0]!;
    const total = Number(r.total_km2);
    const covered = Number(r.covered_km2);
    return {
      areaId,
      totalKm2: total,
      coveredKm2: covered,
      coveragePercent: total > 0 ? Math.min(100, Math.round((covered / total) * 1000) / 10) : 0,
      lastScanAt: r.last_scan_at,
      totalPlaces: Number(r.total_places),
    };
  }

  /**
   * Snap points to a grid via ST_SnapToGrid, count per cell. Used by the
   * Coverage map when zoomed out enough that individual points stop
   * making sense.
   */
  async heatmap(query: HeatmapQuery) {
    const rows = await this.db.execute<{
      lng: number;
      lat: number;
      count: string;
    }>(sql`
      SELECT
        ST_X(snap) AS lng,
        ST_Y(snap) AS lat,
        COUNT(*)::text AS count
      FROM (
        SELECT ST_SnapToGrid(location::geometry, ${query.gridDeg}) AS snap
        FROM places
        WHERE location && ST_MakeEnvelope(
          ${query.bbox.minLng}, ${query.bbox.minLat},
          ${query.bbox.maxLng}, ${query.bbox.maxLat}, 4326
        )::geography
      ) s
      GROUP BY snap
    `);
    return {
      gridDeg: query.gridDeg,
      points: rows.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        count: Number(r.count),
      })),
    };
  }

  private cellsWhere(q: CellsQuery): SQL {
    const parts: SQL[] = [sql`TRUE`];
    if (q.jobId) parts.push(sql`job_id = ${q.jobId}`);
    if (q.status) parts.push(sql`status = ${q.status}::api_call_status`);
    if (q.since) parts.push(sql`created_at >= ${q.since}`);
    if (q.bbox) {
      parts.push(
        sql`cell_geom && ST_MakeEnvelope(${q.bbox.minLng}, ${q.bbox.minLat}, ${q.bbox.maxLng}, ${q.bbox.maxLat}, 4326)::geography`,
      );
    }
    return sql`WHERE ${sql.join(parts, sql` AND `)}`;
  }
}
