import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

const sql = postgres(url, { max: 1 });

await sql`
  CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const applied = new Set(
  (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name),
);

const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();

let appliedCount = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip  ${file}`);
    continue;
  }
  const sqlText = await readFile(join(migrationsDir, file), 'utf8');
  console.log(`apply ${file}`);
  await sql.begin(async (tx) => {
    await tx.unsafe(sqlText);
    await tx`INSERT INTO _migrations (name) VALUES (${file})`;
  });
  appliedCount += 1;
}

await sql.end();
console.log(`done — ${appliedCount} migration(s) applied`);
