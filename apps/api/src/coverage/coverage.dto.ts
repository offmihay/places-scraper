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

export const cellsQuerySchema = z.object({
  bbox: bboxSchema.optional(),
  jobId: z.string().uuid().optional(),
  since: z.coerce.date().optional(),
  status: z.enum(['ok', 'failed', 'rate_limited']).optional(),
  limit: z.coerce.number().int().min(1).max(50000).default(5000),
});
export type CellsQuery = z.infer<typeof cellsQuerySchema>;

export const uncoveredQuerySchema = z.object({
  since: z.coerce.date().optional(),
});
export type UncoveredQuery = z.infer<typeof uncoveredQuerySchema>;

export const heatmapQuerySchema = z.object({
  bbox: bboxSchema,
  /** snap-to-grid cell size in degrees; ~0.01 ≈ 1km */
  gridDeg: z.coerce.number().min(0.001).max(1).default(0.05),
});
export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;
