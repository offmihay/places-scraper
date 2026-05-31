import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@places/db';
import { decryptSecret } from '@places/shared';
import { DRIZZLE } from '../db/db.tokens.js';
import { AppConfigService } from '../config/config.service.js';

export interface ClaimedKey {
  id: string;
  key: string;
}

@Injectable()
export class KeysClaimService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  /**
   * Atomic claim — picks the least-used active key, increments used_today
   * and flips status to quota_exhausted if the bump hits the quota.
   * Uses FOR UPDATE SKIP LOCKED so parallel workers don't fight.
   *
   * Retries internally on null: with concurrency=5 and a single key,
   * four out of five SKIP-LOCKED claims return nothing for a few ms
   * while the row lock is held. We sleep 30→90→180ms and try again
   * before reporting "no active keys", which is meant to signal
   * genuine quota exhaustion / disabled-keys, not lock contention.
   */
  async claim(): Promise<ClaimedKey | null> {
    const backoffMs = [0, 30, 90, 180];
    for (const wait of backoffMs) {
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const row = await this.claimOnce();
      if (row) return row;
    }
    return null;
  }

  private async claimOnce(): Promise<ClaimedKey | null> {
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
      key: decryptSecret(
        { ciphertext: row.key_encrypted, iv: row.iv, authTag: row.auth_tag },
        this.config.get('MASTER_ENCRYPTION_KEY'),
      ),
    };
  }

  /**
   * Forcibly mark a key as exhausted when Google rejects it (e.g. invalid
   * key, quota cap on Google's side). Refunds the optimistic +1 we did.
   */
  async markExhausted(keyId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE api_keys
      SET status = 'quota_exhausted',
          used_today = GREATEST(used_today - 1, 0)
      WHERE id = ${keyId}
    `);
  }

  /** Optimistic +1 wasn't actually billed — give it back (network error etc.) */
  async refund(keyId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE api_keys
      SET used_today = GREATEST(used_today - 1, 0)
      WHERE id = ${keyId}
    `);
  }
}
