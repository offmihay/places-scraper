import { z } from 'zod';

export const estimateJobSchema = z.object({
  areaId: z.string().uuid(),
  types: z.array(z.string().min(1)).min(1).max(50),
  mode: z.enum(['default', 'auto', 'manual']).default('default'),
  radiusM: z.number().int().min(50).max(50000).optional(),
});
export type EstimateJobDto = z.infer<typeof estimateJobSchema>;

export const createJobSchema = estimateJobSchema.extend({
  maxCostUsd: z.number().positive(),
});
export type CreateJobDto = z.infer<typeof createJobSchema>;

export const listJobsQuerySchema = z.object({
  status: z
    .enum(['pending', 'running', 'paused', 'completed', 'cancelled', 'failed'])
    .optional(),
  areaId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

export const resumeJobSchema = z.object({
  maxCostUsd: z.number().positive().optional(),
});
export type ResumeJobDto = z.infer<typeof resumeJobSchema>;
