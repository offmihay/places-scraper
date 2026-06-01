import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  MASTER_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'MASTER_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),

  DEFAULT_CELL_RADIUS_M: z.coerce.number().int().positive().default(1500),
  GOOGLE_PLACES_COST_PER_CALL_USD: z.coerce.number().positive().default(0.035),

  // Comma-separated list of allowed Origins for CORS. Required in production
  // so the api isn't open to any caller; in dev defaults to allowing all.
  WEB_ORIGIN: z.string().optional(),
}).superRefine((cfg, ctx) => {
  if (cfg.NODE_ENV !== 'production') return;
  if (/^0+$/.test(cfg.MASTER_ENCRYPTION_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MASTER_ENCRYPTION_KEY'],
      message: 'placeholder value from .env.example is not allowed in production',
    });
  }
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (cfg[k].startsWith('change-me-')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [k],
        message: 'placeholder value from .env.example is not allowed in production',
      });
    }
  }
  if (!cfg.WEB_ORIGIN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['WEB_ORIGIN'],
      message: 'required in production (comma-separated allowed Origins for CORS)',
    });
  }
});

export type AppConfig = z.infer<typeof configSchema>;
