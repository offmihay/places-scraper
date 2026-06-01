# 01. Product

## What it is

Places Scraper is a single-tenant admin tool that **systematically
collects every business Google Maps knows about inside an arbitrary
polygon**. The operator picks an area (a country, a city, a custom-drawn
shape), sets a hard budget cap, and the system drives Google's nearby-
search endpoint to densely cover that polygon with overlapping search
cells. Results land in a spatial database that an admin UI lets you
filter, export, and visualise on a map.

## Why this exists

Google's API is designed for one-off proximity queries — "restaurants
near me" — and returns at most twenty results per call with no
pagination. A single dense block of a city can hold ten times that
number, and the other ninety percent are invisible to anyone using the
API the way it was meant to be used.

This tool solves the missing-data problem by:

1. **Tiling** the target polygon with overlapping search cells small
   enough that most cells fit under the result cap.
2. **Splitting** any cell that *does* hit the cap into four smaller
   sub-cells, recursively, until the data fits.
3. **Tracking** what's been scanned and what's still uncovered so the
   operator can target gaps with supplementary runs.
4. **Capping cost** at a budget the operator sets before each run, so
   a misconfigured scan can't drain the billing account.

## Who uses it

A small operations team (one to a handful of people, all administrators
for now) building or maintaining a curated dataset of businesses for
one of:

- **Lead generation** — exporting a CSV of every cafe in a region for a
  sales pipeline.
- **Market analysis** — comparing density of one chain vs. another
  across geographies.
- **Public-records enrichment** — cross-referencing a company list
  against Google Maps to find missing locations.
- **Data ingestion** — feeding a downstream product that wants
  geolocated POI data without paying enterprise data brokers.

It is not designed for end users or multi-tenant SaaS. There is one
shared dataset, one set of API keys, one team's worth of admins.

## The core workflow

A typical session goes:

1. **Configure API keys.** Multiple keys are supported and the system
   rotates between them; each has an operator-chosen daily ceiling
   that protects against runaway spend.
2. **Define an area.** Either a preset country, a custom polygon, or
   one derived from existing areas (subtract, intersect, union).
3. **Start a job.** Pick the area, choose which categories of place
   to scrape, set the initial cell radius, and commit to a maximum
   spend in dollars. The system shows an estimate before charging
   anything.
4. **Watch progress live.** The job page updates in real time as cells
   complete: progress bar, current cost vs. budget, recent cell feed.
5. **Browse results.** Filter, sort, and export the resulting places.
6. **See coverage.** A map view shows which cells have been scanned
   (colour-coded by outcome) and what areas remain uncovered — the
   uncovered geometry can be turned into a new area for a follow-up
   scan in one click.

## What's in scope

- Polygon-based scraping with quadtree refinement when results overflow.
- Live progress tracking with cancel, pause, resume, and retry.
- Cost control: estimate before run, hard budget cap, auto-pause when
  approaching the cap.
- Stored API keys with per-key daily quota tracking and rotation.
- Filter / search / export on the collected dataset.
- A coverage map for spotting gaps and triggering supplementary runs.

## What's not in scope (deliberately)

- **Email harvesting from Google.** The API never returns email
  addresses by design. Enriching places with email requires a separate
  pipeline that scrapes their websites — out of scope here.
- **Bulk review collection.** Pulling reviews at scale is gated by
  Google's terms of service.
- **Multi-tenant SaaS.** One admin, one dataset, one set of keys.
- **Real-time freshness.** Results are cached for a configurable window
  to avoid re-billing identical cells; explicit refresh is a re-run
  past the cache TTL.

## Anti-features (intentional, not bugs)

- **No pagination of cells.** Google offers none; we hit the cap by
  splitting, not by asking for more.
- **No fuzzy text search at scrape time.** Selecting "cafe" returns
  places typed as cafe, full stop. Free-text search is a different,
  more expensive Google product not used here.
- **No automatic re-scrape.** A place's snapshot is taken at scrape
  time. Refreshing requires an explicit run.

## Glossary

| Term | Meaning |
|------|---------|
| **Area** | A named polygon stored in the database. Either a country preset, a custom shape, or one derived from other areas. |
| **Job** | One scraping session targeting one area, with its own budget cap and progress state. |
| **Cell** | One Google API call's footprint — a centre point plus a radius. |
| **Quadtree split** | The recursive subdivision that fires when a cell hits the result cap: one cell becomes four, each at half the radius. |
| **Place** | A unique business record, deduped on its Google identifier. |
| **Cost guard** | The check that pauses a job before it would bill past the budget cap. |
| **Coverage** | The footprint of all successful cells inside an area, visualised on the map as overlapping discs. |
