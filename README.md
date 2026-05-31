# Places Scraper

Admin platform to scrape Google Places (New) API by polygon. Pick an
area on the map, set a cost cap, the worker decomposes the polygon
into a quadtree of `searchNearby` cells, results land in PostGIS with
an automatic country fill, and a live coverage map shows what's been
scanned vs. what's still missing.

```
apps/
  api/      NestJS HTTP API + JWT auth + Drizzle
  worker/   NestJS BullMQ processor + Google Places client
  web/      Next.js 14 admin UI + MapLibre
packages/
  shared/   Zod schemas, types, crypto, grid + cost helpers,
            JobEvent contract shared by api/worker
  db/       Drizzle schema, hand-rolled SQL migrations,
            Natural Earth countries seed
```

## Local development

```bash
cp .env.example .env
pnpm install
pnpm docker:up        # postgres+postgis, redis, adminer
pnpm db:migrate
pnpm db:seed:countries
pnpm --filter @places/api seed:admin   # creates admin@example.com / admin12345
pnpm dev              # turbo runs api + worker + web in parallel
```

Open http://localhost:3000 → log in with the seeded admin.
Adminer for direct DB poking: http://localhost:8080 (server `postgres`).

## Production deploy

The repo ships Dockerfiles for all three services and a
`docker-compose.prod.yml`. Single-host deploy:

```bash
git clone https://github.com/offmihay/places-scraper.git && cd places-scraper
cp .env.example .env       # fill in real secrets — see "Secrets" below
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api pnpm migrate
docker compose -f docker-compose.prod.yml exec api pnpm seed:countries
docker compose -f docker-compose.prod.yml exec api pnpm seed:admin
```

Managed PaaS path (recommended for prod):

- **Railway** — one project, three services: `api` (Dockerfile.api),
  `worker` (Dockerfile.worker), plus the managed Postgres and Redis
  add-ons. Enable PostGIS on the managed Postgres via
  `CREATE EXTENSION postgis;` once.
- **Vercel** — deploy `apps/web` with `NEXT_PUBLIC_API_URL` pointing
  to the Railway api service.

### Secrets

Required environment variables for production (see `.env.example` for
the full list):

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | Postgres with PostGIS enabled |
| `REDIS_URL` | Redis 7+ |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 32+ random chars each |
| `MASTER_ENCRYPTION_KEY` | 64 hex chars — `openssl rand -hex 32` |
| `NEXT_PUBLIC_API_URL` | Public URL of the api service (web sees it) |

Rotate `MASTER_ENCRYPTION_KEY` carefully: existing api_keys rows are
encrypted under the previous key. Plan a re-encrypt migration before
rotating in place.

## Architecture notes

- **PostGIS first-class**: areas store `geometry(MultiPolygon, 4326)`,
  places store `geography(Point, 4326)`, api_calls keep cell centres
  with a GIST index for the coverage map. Migrations are hand-written
  SQL applied by a tiny tracker (`packages/db/src/migrate.ts`) because
  drizzle-kit's PostGIS support is incomplete.
- **Worker isolation**: separate process from the API so a heavy scrape
  job can't tank HTTP latency. Two BullMQ queues:
  `scrape-orchestrator` (one job per scrape — generates the grid) and
  `scrape-cells` (one job per cell — calls Google, upserts places).
  Concurrency 5 and 10 req/sec rate limit are env-configurable.
- **Quadtree**: when a cell returns 20 results (the API hard cap, no
  pagination) the worker splits it into 4 sub-cells with radius/2,
  capped at MAX_QUADTREE_DEPTH=6 and MIN_CELL_RADIUS_M=50.
- **Atomic key claim**: `UPDATE … FOR UPDATE SKIP LOCKED` so parallel
  workers pick distinct keys without lock contention; cron resets
  daily quota at UTC midnight.
- **Cost guard**: each cell checks
  `actual_cost_usd + per_call > max_cost_usd` before calling Google;
  exceeding pauses the job, `POST /api/jobs/:id/resume` lifts it (and
  optionally raises the budget).
- **Live updates**: worker publishes JobEvents on a Redis pub/sub
  channel; API multiplexes one ioredis subscriber across all SSE
  clients with refcounted subscribe/unsubscribe; EventSource auth via
  `?token=` because the browser API can't send headers.

## Known follow-ups (Stage 8 polish)

These were called out as scope-trims during initial implementation
and need a deliberate second pass before treating the app as
production-grade:

- [ ] Unit tests on grid maths, key rotation, quadtree split, geo helpers.
- [ ] Integration tests for the api via @nestjs/testing + supertest.
- [ ] Playwright happy-path: login → draw area → start job → see places.
- [ ] terra-draw integration on `/areas` and `/jobs/new` so users can
      draw polygons directly on the map instead of pasting GeoJSON.
- [ ] supercluster on `/coverage` for >5k point datasets.
- [ ] "Scan uncovered" round-trip: button in `/coverage` that takes the
      uncovered MultiPolygon and pre-fills `/jobs/new`.
- [ ] Sentry SDK + `/metrics` Prometheus endpoint + structured logging
      with job/cell/key IDs for trace correlation.
- [ ] Cookie-based auth + cookie-based SSE (the `?token=` extractor is
      a dev compromise).
- [ ] Daily `pg_dump` to S3 — currently relies on the host's backup.
- [ ] Batched `INSERT … VALUES (...), (...)` upserts to reduce per-cell
      round trips at scale.

## Implementation log

The repo was built in nine stages, each its own commit. See
`git log --oneline` — every commit message explains what was
delivered, what was verified, and what was deferred.
