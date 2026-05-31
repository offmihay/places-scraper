import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { Database } from '@places/db';
import { DRIZZLE } from '../db/db.tokens.js';
import type { GeojsonQuery, ListPlacesQuery } from './places.dto.js';

export interface PlaceListRow {
  id: string;
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  types: string[];
  primaryType: string | null;
  businessStatus: string | null;
  phone: string | null;
  googleMapsUri: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface CountryStat {
  country: string | null;
  count: number;
}
export interface TypeStat {
  type: string;
  count: number;
}

@Injectable()
export class PlacesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(query: ListPlacesQuery) {
    const where = this.whereClauses(query);
    const orderBy = this.orderClause(query.sort);
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT
        id, place_id AS "placeId", name, formatted_address AS "formattedAddress",
        city, country,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        types, primary_type AS "primaryType", business_status AS "businessStatus",
        phone, google_maps_uri AS "googleMapsUri",
        first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt",
        COUNT(*) OVER ()::text AS _full_count
      FROM places
      ${where}
      ${orderBy}
      LIMIT ${query.limit} OFFSET ${query.offset}
    `);

    const total = rows[0] ? Number(rows[0]._full_count) : 0;
    return {
      rows: rows.map((r) => {
        const { _full_count: _, ...rest } = r;
        return rest as unknown as PlaceListRow;
      }),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(id: string): Promise<PlaceListRow & { rawData: unknown }> {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      SELECT
        id, place_id AS "placeId", name, formatted_address AS "formattedAddress",
        city, country,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng,
        types, primary_type AS "primaryType", business_status AS "businessStatus",
        phone, google_maps_uri AS "googleMapsUri",
        raw_data AS "rawData",
        first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
      FROM places WHERE id = ${id} LIMIT 1
    `);
    if (rows.length === 0) throw new NotFoundException('Place not found');
    return rows[0] as unknown as PlaceListRow & { rawData: unknown };
  }

  async remove(id: string): Promise<void> {
    const result = await this.db.execute(sql`DELETE FROM places WHERE id = ${id}`);
    if (result.count === 0) throw new NotFoundException('Place not found');
  }

  /** CSV export streamed via cursor — does NOT materialise everything in memory. */
  async *csvStream(query: Omit<ListPlacesQuery, 'limit' | 'offset' | 'sort'>): AsyncGenerator<string> {
    yield [
      'place_id',
      'name',
      'country',
      'city',
      'formatted_address',
      'primary_type',
      'types',
      'business_status',
      'phone',
      'lat',
      'lng',
      'google_maps_uri',
      'last_seen_at',
    ].join(',') + '\n';

    const where = this.whereClauses({
      ...query,
      sort: 'recent',
      limit: 0,
      offset: 0,
    });
    const BATCH = 1000;
    let offset = 0;
    for (;;) {
      const rows = (await this.db.execute<Record<string, unknown>>(sql`
        SELECT
          place_id AS "placeId", name, formatted_address AS "formattedAddress",
          city, country,
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng,
          types, primary_type AS "primaryType", business_status AS "businessStatus",
          phone, google_maps_uri AS "googleMapsUri",
          last_seen_at AS "lastSeenAt"
        FROM places
        ${where}
        ORDER BY last_seen_at DESC
        LIMIT ${BATCH} OFFSET ${offset}
      `)) as unknown as PlaceListRow[];
      if (rows.length === 0) return;
      for (const r of rows) {
        yield (
          [
            r.placeId,
            csvCell(r.name ?? ''),
            r.country ?? '',
            csvCell(r.city ?? ''),
            csvCell(r.formattedAddress ?? ''),
            r.primaryType ?? '',
            csvCell(r.types.join(';')),
            r.businessStatus ?? '',
            r.phone ?? '',
            String(r.lat),
            String(r.lng),
            r.googleMapsUri ?? '',
            r.lastSeenAt instanceof Date ? r.lastSeenAt.toISOString() : String(r.lastSeenAt),
          ].join(',') + '\n'
        );
      }
      offset += rows.length;
      if (rows.length < BATCH) return;
    }
  }

  async stats(): Promise<{ byCountry: CountryStat[]; byType: TypeStat[]; total: number }> {
    const [byCountryRaw, byTypeRaw, totalRaw] = await Promise.all([
      this.db.execute<{ country: string | null; count: string }>(sql`
        SELECT country, COUNT(*)::text AS count FROM places
        GROUP BY country ORDER BY COUNT(*) DESC NULLS LAST LIMIT 250
      `),
      this.db.execute<{ type: string; count: string }>(sql`
        SELECT t AS type, COUNT(*)::text AS count
        FROM places, unnest(types) AS t
        GROUP BY t ORDER BY COUNT(*) DESC LIMIT 250
      `),
      this.db.execute<{ count: string }>(sql`SELECT COUNT(*)::text AS count FROM places`),
    ]);
    return {
      byCountry: byCountryRaw.map((r) => ({ country: r.country, count: Number(r.count) })),
      byType: byTypeRaw.map((r) => ({ type: r.type, count: Number(r.count) })),
      total: Number(totalRaw[0]?.count ?? 0),
    };
  }

  async geojson(query: GeojsonQuery, limit: number) {
    const where = this.whereClauses({
      ...query,
      sort: 'recent',
      limit: 0,
      offset: 0,
    });
    const rows = await this.db.execute<{ feature: string }>(sql`
      SELECT (
        jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(p)::jsonb,
          'properties', jsonb_build_object(
            'id', id,
            'placeId', place_id,
            'name', name,
            'country', country,
            'city', city,
            'primaryType', primary_type,
            'businessStatus', business_status
          )
        )
      )::text AS feature
      FROM (
        SELECT id, place_id, name, country, city, primary_type, business_status, location::geometry AS p
        FROM places
        ${where}
        ORDER BY last_seen_at DESC
        LIMIT ${limit}
      ) sub
    `);
    return {
      type: 'FeatureCollection' as const,
      features: rows.map((r) => JSON.parse(r.feature) as Record<string, unknown>),
    };
  }

  private whereClauses(q: ListPlacesQuery): SQL {
    const parts: SQL[] = [sql`TRUE`];
    if (q.country) parts.push(sql`country = ${q.country.toUpperCase()}`);
    if (q.city) parts.push(sql`city ILIKE ${'%' + q.city + '%'}`);
    if (q.businessStatus) parts.push(sql`business_status = ${q.businessStatus}`);
    if (q.types && q.types.length > 0) {
      // postgres-js refuses to encode JS arrays as text[], so we ship them
      // as a JSON array and turn it back into a text[] inside SQL.
      const typesJson = JSON.stringify(q.types);
      parts.push(
        sql`types && (SELECT array_agg(value::text) FROM jsonb_array_elements_text(${typesJson}::jsonb))`,
      );
    }
    if (q.search) {
      parts.push(sql`(name ILIKE ${'%' + q.search + '%'} OR formatted_address ILIKE ${'%' + q.search + '%'})`);
    }
    if (q.bbox) {
      parts.push(
        sql`location && ST_MakeEnvelope(${q.bbox.minLng}, ${q.bbox.minLat}, ${q.bbox.maxLng}, ${q.bbox.maxLat}, 4326)::geography`,
      );
    }
    if (q.near) {
      parts.push(
        sql`ST_DWithin(location, ST_SetSRID(ST_Point(${q.near.lng}, ${q.near.lat}), 4326)::geography, ${q.near.radius})`,
      );
    }
    if (q.inAreaId) {
      parts.push(
        sql`ST_Contains((SELECT polygon FROM areas WHERE id = ${q.inAreaId}), location::geometry)`,
      );
    }
    // Drizzle's sql.join glues the parts with AND.
    return sql`WHERE ${sql.join(parts, sql` AND `)}`;
  }

  private orderClause(sort: ListPlacesQuery['sort']): SQL {
    switch (sort) {
      case 'name':
        return sql`ORDER BY name NULLS LAST`;
      case 'city':
        return sql`ORDER BY city NULLS LAST, name`;
      case 'recent':
      default:
        return sql`ORDER BY last_seen_at DESC`;
    }
  }
}

function csvCell(s: string): string {
  if (s === '') return '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
