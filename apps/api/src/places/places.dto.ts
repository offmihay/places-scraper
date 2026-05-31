import { z } from 'zod';

const bboxSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  .transform((s) => {
    const [minLng, minLat, maxLng, maxLat] = s.split(',').map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return { minLng, minLat, maxLng, maxLat };
  });

const nearSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+$/)
  .transform((s) => {
    const [lat, lng, radius] = s.split(',').map(Number) as [number, number, number];
    return { lat, lng, radius };
  });

export const listPlacesQuerySchema = z.object({
  country: z.string().length(2).optional(),
  city: z.string().optional(),
  types: z
    .union([z.array(z.string()), z.string()])
    .transform((v) => (Array.isArray(v) ? v : v.split(',').filter(Boolean)))
    .optional(),
  businessStatus: z.string().optional(),
  search: z.string().optional(),
  bbox: bboxSchema.optional(),
  near: nearSchema.optional(),
  inAreaId: z.string().uuid().optional(),
  sort: z.enum(['recent', 'name', 'city']).default('recent'),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListPlacesQuery = z.infer<typeof listPlacesQuerySchema>;

export const geojsonQuerySchema = listPlacesQuerySchema.omit({ sort: true, limit: true, offset: true });
export type GeojsonQuery = z.infer<typeof geojsonQuerySchema>;
