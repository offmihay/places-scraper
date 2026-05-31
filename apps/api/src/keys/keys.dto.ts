import { z } from 'zod';

export const createKeySchema = z.object({
  label: z.string().min(1).max(120),
  key: z.string().min(10),
  dailyQuota: z.number().int().min(1).max(1_000_000).optional(),
});
export type CreateKeyDto = z.infer<typeof createKeySchema>;

export const updateKeySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  dailyQuota: z.number().int().min(1).max(1_000_000).optional(),
  status: z.enum(['active', 'quota_exhausted', 'disabled']).optional(),
});
export type UpdateKeyDto = z.infer<typeof updateKeySchema>;
