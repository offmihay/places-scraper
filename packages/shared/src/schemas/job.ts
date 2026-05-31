import { z } from 'zod';

export const JobMode = z.enum(['default', 'auto', 'manual']);
export type JobMode = z.infer<typeof JobMode>;

export const JobStatus = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const estimateJobSchema = z.object({
  areaId: z.string().uuid(),
  types: z.array(z.string().min(1)).min(1),
  mode: JobMode.default('default'),
  radius: z.number().int().min(50).max(50000).optional(),
});
export type EstimateJobInput = z.infer<typeof estimateJobSchema>;

export const createJobSchema = estimateJobSchema.extend({
  maxCostUsd: z.number().positive(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;
