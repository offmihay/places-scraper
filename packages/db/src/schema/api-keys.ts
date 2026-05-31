import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const apiKeyStatus = pgEnum('api_key_status', [
  'active',
  'quota_exhausted',
  'disabled',
]);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull(),
  // AES-256-GCM ciphertext (base64) of the raw key.
  keyEncrypted: text('key_encrypted').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  keyMasked: text('key_masked').notNull(),
  dailyQuota: integer('daily_quota').notNull().default(10000),
  usedToday: integer('used_today').notNull().default(0),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull().defaultNow(),
  status: apiKeyStatus('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
