# 02. Architecture

A high-level view of the system: what runs, what talks to what, and
why those choices were made. For business context read
[01-product.md](./01-product.md) first.

## System shape

Three independently deployable processes sit on top of two pieces of
shared infrastructure.

```
   ┌──────────┐                   ┌──────────┐
   │  Web UI  │ ── HTTP / SSE ──▶ │   API    │
   └──────────┘                   └────┬─────┘
                                       │
                          ┌────────────┼────────────┐
                          │            │            │
                          ▼            ▼            ▼
                       ┌────────┐  ┌───────┐  ┌────────┐
                       │ Queue  │  │ Event │  │   DB   │
                       │ broker │  │  bus  │  │        │
                       └────┬───┘  └───┬───┘  └────┬───┘
                            │          │           │
                            ▼          │           │
                       ┌────────┐      │           │
                       │ Worker │──────┴──────────▶┘
                       └────┬───┘
                            │
                            ▼
                   external Google Maps API
```

| Process | Owns |
|---------|------|
| **API** | Authentication, all CRUD over the operator-facing entities, the live-updates stream the UI consumes. Never talks to Google directly. |
| **Worker** | The scrape pipeline: decomposes a job into cells, makes the Google calls, persists results, publishes live events. Recursively enqueues its own work when cells need to split. |
| **Web UI** | A single-page admin console. Pure client-side once authenticated; the server doesn't render data for logged-in users. |
| **Database** | Authoritative store. Spatial-aware so polygon operations, point-in-polygon lookups, and coverage geometry happen at the data layer rather than in application code. |
| **Queue broker** | Job state, retries, rate-limiting, fan-out from one job into thousands of cells. |
| **Event bus** | A separate publish/subscribe channel used purely for live UI updates — independent of the queue so a slow subscriber can't back-pressure scrape work. |

## How a job flows

A job moves through the system in three handoffs:

1. **Operator → API.** The UI gathers the inputs (area, categories,
   budget) and asks the API to estimate the cost. The operator
   confirms, the API stores the job record and hands one orchestration
   task to the queue.
2. **API → Worker (orchestration).** The worker reads the job, asks
   the database which grid points fall inside the area's polygon, and
   fans those points out as one cell task per point.
3. **Worker → Worker (cells).** A pool of cell workers picks up
   tasks concurrently, each one making one external call, persisting
   what came back, and — if the result hit the cap — spawning four
   children at half the radius. Every state change publishes an
   event so the operator's job page updates without polling.

Cancel, pause, and resume all hook into this flow by mutating the job's
status. Workers check that status before each external call and exit
cleanly if the operator pulled the brake.

## Why three processes, not one

A web application that also runs the scrape inline ties two completely
different latency profiles together. HTTP requests need to answer in
milliseconds; a scrape worker spends minutes or hours processing one
job. Splitting them means:

- **Latency isolation.** A heavy scrape doesn't degrade login or page
  loads.
- **Independent scaling.** Need more throughput on scrapes? Add more
  worker containers without touching the API.
- **Crash isolation.** A bad cell can't take the API down with it;
  the API can be redeployed without dropping in-flight scrape work.

The web UI is the third process by convention — it's a static-ish
client bundle that doesn't need to be co-located with API code.

## Why a spatial database

Every interesting query in this system is geometric: "which grid
centres fall inside this polygon", "what's the difference between
this area and the union of buffered cell footprints", "which places
sit within a few kilometres of this point". Pushing that into
application code means transferring polygons and millions of points
back and forth; doing it in the database means one round-trip and
correct indexing.

PostGIS is the de facto choice. The decision is not really "PostGIS
or something else", it's "PostGIS or accept that the whole thing
will be slower and more code". We use PostGIS.

## Why a queue, not a thread pool

Three properties out of the queue we couldn't easily build:

- **Durability.** A worker can die mid-job and resume from where it
  left off — the queue knows what's in flight, what's pending, what
  failed.
- **Rate limiting at the right layer.** External APIs have per-second
  limits. A queue enforces those across all worker concurrency
  uniformly; threads would each need their own bookkeeping.
- **Recursion.** When a cell splits into four children, the worker
  needs to enqueue those children somewhere. The same queue it's
  draining is the natural place.

## Why a separate event bus

The queue is for *work*. The event bus is for *notifications*. They
overlap in spirit but coupling them has bad failure modes:

- A queue full of work doesn't mean the UI gets stale notifications.
- A slow UI subscriber can't slow down job processing.
- The event bus has fire-and-forget semantics, which is appropriate
  for "the progress just went from 41 to 42 of 100" but disastrous
  for actual work.

Splitting them costs one extra piece of infrastructure conceptually
(the same broker can serve both roles physically) and buys clean
failure modes.

## Why authentication on the API only

The UI is a client-side application; anything sensitive has to be
verified at the API. The UI's job is to present an authenticated
operator with the right buttons. Trying to enforce authorization in
two places creates drift.

## Operational shape

Each of the three processes can be deployed and scaled independently:

- API behind a normal HTTP load balancer.
- Worker as a pool of replicas (one is fine for low volume, more for
  parallelism). They coordinate through the queue, so the count is a
  pure throughput knob.
- UI as static assets — anything that can serve a Next.js standalone
  build works.

The database and queue broker are shared singletons. The database is
the system of record; everything else can be rebuilt from it.

## What stays out of the architecture

A few things are deliberately *not* part of the system today and would
fit cleanly when they're needed:

- **A read replica** for analytics queries that would otherwise lock
  the scrape pipeline.
- **A separate email-enrichment pipeline** that walks places'
  websites — orthogonal to the scrape concerns.
- **A horizontally sharded queue** if a single broker becomes a
  bottleneck. The application code doesn't care which queue a job
  goes through; this is a deployment concern.

Each of those is an evolution of the current shape, not a redesign.
