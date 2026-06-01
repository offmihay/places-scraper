# Places Scraper

Admin platform that scrapes Google Places by polygon. Pick an area on
a map, set a budget cap, and the system tiles the polygon with
overlapping search cells, splits any cell that overflows the API's
result cap, and lands the results in a spatial database with a live
coverage map.

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm docker:up        # postgres + postgis + redis + adminer
pnpm db:migrate
pnpm db:seed:countries
pnpm --filter @places/api seed:admin   # admin@example.com / admin12345
pnpm dev              # api + worker + web in parallel
```

Open <http://localhost:3000> and log in.

## Layout

```
apps/
  api/      HTTP API
  worker/   scrape pipeline
  web/      admin UI
packages/
  shared/   types + helpers shared by api and worker
  db/       schema, migrations, seeds
```

## Documentation

The [`docs/`](./docs/README.md) folder is the source of truth for what
the product does and how it's put together. Start there before
exploring the code.

| Doc | What it covers |
|-----|----------------|
| [docs/01-product.md](./docs/01-product.md) | What the tool does, who it's for, the workflow, what's in and out of scope. |
| [docs/02-architecture.md](./docs/02-architecture.md) | The three services, how they communicate, why this stack. |

## Deploying

The repo ships Dockerfiles and a `docker-compose.prod.yml` for a
single-host deploy. After `docker compose -f docker-compose.prod.yml up -d --build`,
run the three setup commands once:

```bash
docker compose -f docker-compose.prod.yml exec api pnpm migrate
docker compose -f docker-compose.prod.yml exec api pnpm seed:countries
docker compose -f docker-compose.prod.yml exec api pnpm seed:admin
```

For managed PaaS (Railway for api+worker+postgres+redis, Vercel for
web) the same images apply unchanged.

## Required secrets

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | Postgres with PostGIS enabled |
| `REDIS_URL` | Redis 7+ |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | 32+ random chars each |
| `MASTER_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_API_URL` | Public URL the web UI calls |

The encryption key protects stored Google API keys at rest; rotating
it requires re-encrypting existing rows.

## Status

The system is feature-complete for the workflow described in
[docs/01-product.md](./docs/01-product.md). Hardening work (tests,
observability, secret rotation tooling) is tracked outside this
README.
