import { z } from 'zod';

export const createJobSchema = z.object({
  areaId: z.string().uuid(),
  types: z.array(z.string().min(1)).min(1).max(50),
  mode: z.enum(['default', 'auto', 'manual']).default('default'),
  radiusM: z.number().int().min(50).max(50000).optional(),
  maxCostUsd: z.number().positive(),
});
export type CreateJobDto = z.infer<typeof createJobSchema>;
