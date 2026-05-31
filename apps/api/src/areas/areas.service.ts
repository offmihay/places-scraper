import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { DRIZZLE } from '../db/db.tokens.js';
import type {
  AnyPolygonGeometry,
  CreateAreaDto,
  DeriveAreaDto,
  ListAreasQuery,
  UpdateAreaDto,
} from './areas.dto.js';

export type AreaRow = typeof schema.areas.$inferSelect;
export type AreaListRow = Omit<AreaRow, 'polygon'>;

export interface AreaDetail extends AreaListRow {
  polygon: AnyPolygonGeometry;
}

const listColumns = {
  id: schema.areas.id,
  type: schema.areas.type,
  name: schema.areas.name,
  isoCode: schema.areas.isoCode,
  areaKm2: schema.areas.areaKm2,
  parentAreaId: schema.areas.parentAreaId,
  isPreset: schema.areas.isPreset,
  createdBy: schema.areas.createdBy,
  createdAt: schema.areas.createdAt,
  updatedAt: schema.areas.updatedAt,
};

@Injectable()
export class AreasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(query: ListAreasQuery): Promise<AreaListRow[]> {
    const filters: SQL[] = [];
    if (query.type) filters.push(eq(schema.areas.type, query.type));
    if (query.search) filters.push(ilike(schema.areas.name, `%${query.search}%`));

    return this.db
      .select(listColumns)
      .from(schema.areas)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.areas.createdAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async get(id: string): Promise<AreaDetail> {
    const rows = await this.db.execute<{
      id: string;
      type: 'country' | 'custom' | 'derived';
      name: string;
      iso_code: string | null;
      polygon: string;
      area_km2: number | null;
      parent_area_id: string | null;
      is_preset: boolean;
      created_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>(sql`
      SELECT id, type, name, iso_code, ST_AsGeoJSON(polygon)::text AS polygon,
             area_km2, parent_area_id, is_preset, created_by, created_at, updated_at
      FROM areas WHERE id = ${id} LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Area not found');
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      isoCode: row.iso_code,
      polygon: JSON.parse(row.polygon) as AnyPolygonGeometry,
      areaKm2: row.area_km2,
      parentAreaId: row.parent_area_id,
      isPreset: row.is_preset,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async create(dto: CreateAreaDto, createdBy: string): Promise<AreaDetail> {
    const id = await this.insertFromGeoJSON({
      type: 'custom',
      name: dto.name,
      geometry: dto.polygon,
      createdBy,
    });
    return this.get(id);
  }

  async cloneCountry(countryAreaId: string, createdBy: string, name?: string): Promise<AreaDetail> {
    const [src] = await this.db
      .select({
        id: schema.areas.id,
        name: schema.areas.name,
        type: schema.areas.type,
        isoCode: schema.areas.isoCode,
      })
      .from(schema.areas)
      .where(eq(schema.areas.id, countryAreaId))
      .limit(1);
    if (!src) throw new NotFoundException('Source area not found');
    if (src.type !== 'country') {
      throw new BadRequestException('Source area must be a country');
    }

    const clonedName = name ?? `${src.name} (custom)`;
    const rows = await this.db.execute<{ id: string }>(sql`
      INSERT INTO areas (type, name, iso_code, polygon, area_km2, parent_area_id, is_preset, created_by)
      SELECT 'custom', ${clonedName}, iso_code, polygon, area_km2, id, false, ${createdBy}
      FROM areas WHERE id = ${countryAreaId}
      RETURNING id
    `);
    return this.get(rows[0]!.id);
  }

  async derive(dto: DeriveAreaDto, createdBy: string): Promise<AreaDetail> {
    const [base] = await this.db
      .select({ id: schema.areas.id })
      .from(schema.areas)
      .where(eq(schema.areas.id, dto.baseAreaId))
      .limit(1);
    if (!base) throw new NotFoundException('Base area not found');

    // Resolve "other" as a SQL expression yielding a geometry.
    const otherGeomExpr = dto.otherAreaId
      ? sql`(SELECT polygon FROM areas WHERE id = ${dto.otherAreaId})`
      : sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(dto.otherPolygon)}), 4326)`;

    const opFn =
      dto.operation === 'subtract'
        ? sql.raw('ST_Difference')
        : dto.operation === 'intersect'
          ? sql.raw('ST_Intersection')
          : sql.raw('ST_Union');

    const rows = await this.db.execute<{ id: string; empty: boolean }>(sql`
      WITH base AS (SELECT polygon AS p FROM areas WHERE id = ${dto.baseAreaId}),
           other AS (SELECT ${otherGeomExpr} AS p),
           combined AS (
             SELECT ST_Multi(ST_CollectionExtract(${opFn}(base.p, other.p), 3)) AS poly
             FROM base, other
           ),
           inserted AS (
             INSERT INTO areas (type, name, polygon, area_km2, parent_area_id, is_preset, created_by)
             SELECT 'derived',
                    ${dto.name},
                    poly,
                    ST_Area(poly::geography) / 1000000,
                    ${dto.baseAreaId},
                    false,
                    ${createdBy}
             FROM combined
             WHERE NOT ST_IsEmpty(poly)
             RETURNING id
           )
      SELECT id, false AS empty FROM inserted
      UNION ALL
      SELECT NULL::uuid AS id, true AS empty
      WHERE NOT EXISTS (SELECT 1 FROM inserted)
      LIMIT 1
    `);
    const row = rows[0]!;
    if (row.empty) {
      throw new BadRequestException('Derived geometry is empty');
    }
    return this.get(row.id);
  }

  async update(id: string, dto: UpdateAreaDto): Promise<AreaDetail> {
    const [existing] = await this.db
      .select({ id: schema.areas.id, isPreset: schema.areas.isPreset })
      .from(schema.areas)
      .where(eq(schema.areas.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Area not found');
    if (existing.isPreset) throw new ForbiddenException('Preset areas cannot be edited');

    if (dto.name !== undefined && dto.polygon === undefined) {
      await this.db
        .update(schema.areas)
        .set({ name: dto.name })
        .where(eq(schema.areas.id, id));
    } else if (dto.polygon !== undefined) {
      const geomJson = JSON.stringify(dto.polygon);
      await this.db.execute(sql`
        UPDATE areas SET
          name = COALESCE(${dto.name ?? null}, name),
          polygon = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)),
          area_km2 = ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)::geography) / 1000000
        WHERE id = ${id}
      `);
    }
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.areas.id, isPreset: schema.areas.isPreset })
      .from(schema.areas)
      .where(eq(schema.areas.id, id))
      .limit(1);
    if (!existing) throw new NotFoundException('Area not found');
    if (existing.isPreset) throw new ForbiddenException('Preset areas cannot be deleted');
    await this.db.delete(schema.areas).where(eq(schema.areas.id, id));
  }

  private async insertFromGeoJSON(args: {
    type: 'custom';
    name: string;
    geometry: AnyPolygonGeometry;
    createdBy: string | null;
  }): Promise<string> {
    const geomJson = JSON.stringify(args.geometry);
    const rows = await this.db.execute<{ id: string }>(sql`
      INSERT INTO areas (type, name, polygon, area_km2, is_preset, created_by)
      VALUES (
        ${args.type}::area_type,
        ${args.name},
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)),
        ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)::geography) / 1000000,
        false,
        ${args.createdBy}
      )
      RETURNING id
    `);
    return rows[0]!.id;
  }
}
