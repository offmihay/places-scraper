import { z } from 'zod';

export const AreaType = z.enum(['country', 'custom', 'derived']);
export type AreaType = z.infer<typeof AreaType>;

const positionSchema = z.tuple([z.number(), z.number()]);

export const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(positionSchema)),
});

export const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(positionSchema))),
});

export const anyPolygonGeometrySchema = z.union([
  polygonGeometrySchema,
  multiPolygonGeometrySchema,
]);

export const createAreaSchema = z.object({
  name: z.string().min(1).max(200),
  polygon: anyPolygonGeometrySchema,
});
export type CreateAreaInput = z.infer<typeof createAreaSchema>;

export const deriveAreaSchema = z.object({
  name: z.string().min(1).max(200),
  baseAreaId: z.string().uuid(),
  operation: z.enum(['subtract', 'intersect', 'union']),
  otherAreaId: z.string().uuid().optional(),
  otherPolygon: anyPolygonGeometrySchema.optional(),
});
export type DeriveAreaInput = z.infer<typeof deriveAreaSchema>;
