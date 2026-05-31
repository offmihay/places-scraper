# Places Scraper

Monorepo for Google Places scraping platform.

## Structure

- `apps/api` — NestJS HTTP API
- `apps/worker` — NestJS standalone BullMQ worker
- `apps/web` — Next.js 14 admin UI
- `packages/shared` — shared Zod schemas + types
- `packages/db` — Drizzle ORM schema + migrations + seeds

## Local setup

```bash
# 1. install deps
pnpm install

# 2. start postgres + redis + adminer
cp .env.example .env
pnpm docker:up

# 3. apply migrations (after stage 1)
pnpm db:migrate

# 4. seed countries (after stage 1)
pnpm db:seed:countries

# 5. run everything in dev
pnpm dev
```

Adminer (DB UI) → http://localhost:8080 (server: `postgres`, user/pass/db from `.env`).
