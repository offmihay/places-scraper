import { z } from 'zod';

const positionSchema = z.tuple([z.number(), z.number()]);

const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(positionSchema)),
});

const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(positionSchema))),
});

export const anyPolygonGeometrySchema = z.union([polygonGeometrySchema, multiPolygonGeometrySchema]);
export type AnyPolygonGeometry = z.infer<typeof anyPolygonGeometrySchema>;

export const listAreasQuerySchema = z.object({
  type: z.enum(['country', 'custom', 'derived']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListAreasQuery = z.infer<typeof listAreasQuerySchema>;

export const createAreaSchema = z.object({
  name: z.string().min(1).max(200),
  polygon: anyPolygonGeometrySchema,
});
export type CreateAreaDto = z.infer<typeof createAreaSchema>;

export const updateAreaSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  polygon: anyPolygonGeometrySchema.optional(),
});
export type UpdateAreaDto = z.infer<typeof updateAreaSchema>;

export const cloneCountrySchema = z.object({
  countryAreaId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
});
export type CloneCountryDto = z.infer<typeof cloneCountrySchema>;

export const deriveAreaSchema = z
  .object({
    name: z.string().min(1).max(200),
    baseAreaId: z.string().uuid(),
    operation: z.enum(['subtract', 'intersect', 'union']),
    otherAreaId: z.string().uuid().optional(),
    otherPolygon: anyPolygonGeometrySchema.optional(),
  })
  .refine((d) => d.otherAreaId !== undefined || d.otherPolygon !== undefined, {
    message: 'otherAreaId or otherPolygon required',
  });
export type DeriveAreaDto = z.infer<typeof deriveAreaSchema>;
