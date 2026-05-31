import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@places/db';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from './crypto.js';
import type { CreateKeyDto, UpdateKeyDto } from './keys.dto.js';

export interface ApiKeySafe {
  id: string;
  label: string;
  keyMasked: string;
  dailyQuota: number;
  usedToday: number;
  resetAt: Date;
  status: 'active' | 'quota_exhausted' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

const safeColumns = {
  id: schema.apiKeys.id,
  label: schema.apiKeys.label,
  keyMasked: schema.apiKeys.keyMasked,
  dailyQuota: schema.apiKeys.dailyQuota,
  usedToday: schema.apiKeys.usedToday,
  resetAt: schema.apiKeys.resetAt,
  status: schema.apiKeys.status,
  createdAt: schema.apiKeys.createdAt,
  updatedAt: schema.apiKeys.updatedAt,
};

@Injectable()
export class KeysService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  list(): Promise<ApiKeySafe[]> {
    return this.db.select(safeColumns).from(schema.apiKeys).orderBy(schema.apiKeys.createdAt);
  }

  async create(dto: CreateKeyDto): Promise<ApiKeySafe> {
    const enc = encryptApiKey(dto.key, this.config.get('MASTER_ENCRYPTION_KEY'));
    const [row] = await this.db
      .insert(schema.apiKeys)
      .values({
        label: dto.label,
        keyEncrypted: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        keyMasked: maskApiKey(dto.key),
        dailyQuota: dto.dailyQuota ?? 10_000,
      })
      .returning(safeColumns);
    return row!;
  }

  async update(id: string, dto: UpdateKeyDto): Promise<ApiKeySafe> {
    const [row] = await this.db
      .update(schema.apiKeys)
      .set(dto)
      .where(eq(schema.apiKeys.id, id))
      .returning(safeColumns);
    if (!row) throw new NotFoundException('Key not found');
    return row;
  }

  async remove(id: string): Promise<void> {
    const result = await this.db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));
    if (result.count === 0) throw new NotFoundException('Key not found');
  }

  /**
   * Returns a decrypted active key with quota left, atomically incrementing
   * used_today. Used by the worker; never expose this over HTTP.
   */
  async claimNextActive(): Promise<{ id: string; key: string } | null> {
    const masterKey = this.config.get('MASTER_ENCRYPTION_KEY');
    const rows = await this.db.execute<{
      id: string;
      key_encrypted: string;
      iv: string;
      auth_tag: string;
    }>(sql`
      UPDATE api_keys
      SET used_today = used_today + 1,
          status = CASE
            WHEN used_today + 1 >= daily_quota THEN 'quota_exhausted'::api_key_status
            ELSE status
          END
      WHERE id = (
        SELECT id FROM api_keys
        WHERE status = 'active' AND used_today < daily_quota
        ORDER BY used_today ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, key_encrypted, iv, auth_tag
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      key: decryptApiKey(
        { ciphertext: row.key_encrypted, iv: row.iv, authTag: row.auth_tag },
        masterKey,
      ),
    };
  }

  async resetDailyUsage(): Promise<number> {
    const result = await this.db.execute(sql`
      UPDATE api_keys
      SET used_today = 0,
          reset_at = now(),
          status = CASE
            WHEN status = 'quota_exhausted' THEN 'active'::api_key_status
            ELSE status
          END
      WHERE used_today > 0 OR status = 'quota_exhausted'
    `);
    return result.count;
  }
}
