import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDatabase, schema } from '@places/db';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..', '..');
config({ path: join(repoRoot, '.env') });

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const password = process.env.ADMIN_PASSWORD ?? 'admin12345';

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDatabase(databaseUrl);

const existing = await db
  .select({ id: schema.users.id })
  .from(schema.users)
  .where(eq(schema.users.email, email.toLowerCase()))
  .limit(1);

const passwordHash = await bcrypt.hash(password, 12);

if (existing.length > 0) {
  await db
    .update(schema.users)
    .set({ passwordHash, role: 'admin' })
    .where(eq(schema.users.email, email.toLowerCase()));
  console.log(`updated existing admin: ${email}`);
} else {
  await db.insert(schema.users).values({
    email: email.toLowerCase(),
    passwordHash,
    role: 'admin',
  });
  console.log(`created admin: ${email}`);
}

console.log(`password set to: ${password} (change via ADMIN_PASSWORD env var)`);
process.exit(0);
