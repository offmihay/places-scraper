import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  MASTER_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'MASTER_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  WORKER_RATE_LIMIT_DURATION_MS: z.coerce.number().int().positive().default(1000),

  MIN_CELL_RADIUS_M: z.coerce.number().int().positive().default(50),
  DEFAULT_CELL_RADIUS_M: z.coerce.number().int().positive().default(1500),
  CACHE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),

  GOOGLE_PLACES_BASE_URL: z.string().url().default('https://places.googleapis.com'),
  GOOGLE_PLACES_COST_PER_CALL_USD: z.coerce.number().positive().default(0.035),
});

export type WorkerConfig = z.infer<typeof configSchema>;
