-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────
CREATE TYPE user_role        AS ENUM ('admin', 'viewer');
CREATE TYPE api_key_status   AS ENUM ('active', 'quota_exhausted', 'disabled');
CREATE TYPE area_type        AS ENUM ('country', 'custom', 'derived');
CREATE TYPE job_mode         AS ENUM ('default', 'auto', 'manual');
CREATE TYPE job_status       AS ENUM ('pending', 'running', 'paused', 'completed', 'cancelled', 'failed');
CREATE TYPE api_call_status  AS ENUM ('ok', 'failed', 'rate_limited');

-- ─────────────────────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  role            user_role NOT NULL DEFAULT 'admin',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- api_keys
-- ─────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label           text NOT NULL,
  key_encrypted   text NOT NULL,
  iv              text NOT NULL,
  auth_tag        text NOT NULL,
  key_masked      text NOT NULL,
  daily_quota     integer NOT NULL DEFAULT 10000,
  used_today      integer NOT NULL DEFAULT 0,
  reset_at        timestamptz NOT NULL DEFAULT now(),
  status          api_key_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- areas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE areas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            area_type NOT NULL,
  name            text NOT NULL,
  iso_code        text,
  polygon         geometry(MultiPolygon, 4326) NOT NULL,
  area_km2        double precision,
  parent_area_id  uuid REFERENCES areas(id) ON DELETE SET NULL,
  is_preset       boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX areas_polygon_gist ON areas USING GIST (polygon);
CREATE INDEX areas_type_idx     ON areas (type);
CREATE INDEX areas_iso_idx      ON areas (iso_code);
CREATE INDEX areas_name_trgm    ON areas USING GIN (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- scrape_jobs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE scrape_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id             uuid NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  polygon_snapshot    geometry(MultiPolygon, 4326) NOT NULL,
  types               text[] NOT NULL,
  initial_radius_m    integer NOT NULL,
  mode                job_mode NOT NULL DEFAULT 'default',
  status              job_status NOT NULL DEFAULT 'pending',
  progress_done       integer NOT NULL DEFAULT 0,
  progress_total      integer NOT NULL DEFAULT 0,
  estimated_cost_usd  double precision,
  actual_cost_usd     double precision NOT NULL DEFAULT 0,
  max_cost_usd        double precision NOT NULL,
  error               text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scrape_jobs_status_idx      ON scrape_jobs (status);
CREATE INDEX scrape_jobs_area_idx        ON scrape_jobs (area_id);
CREATE INDEX scrape_jobs_created_at_idx  ON scrape_jobs (created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- places
-- ─────────────────────────────────────────────────────────────
CREATE TABLE places (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id            text NOT NULL UNIQUE,
  name                text,
  formatted_address   text,
  city                text,
  country             text,
  location            geography(Point, 4326) NOT NULL,
  types               text[] NOT NULL DEFAULT '{}',
  primary_type        text,
  business_status     text,
  phone               text,
  google_maps_uri     text,
  raw_data            jsonb NOT NULL,
  source_job_ids      uuid[] NOT NULL DEFAULT '{}',
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX places_location_gist     ON places USING GIST (location);
CREATE INDEX places_types_gin         ON places USING GIN (types);
CREATE INDEX places_country_idx       ON places (country);
CREATE INDEX places_primary_type_idx  ON places (primary_type);
CREATE INDEX places_name_trgm         ON places USING GIN (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- api_calls (one row per Google API request)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE api_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES scrape_jobs(id) ON DELETE CASCADE,
  key_id          uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  cell_lat        double precision NOT NULL,
  cell_lng        double precision NOT NULL,
  cell_radius_m   integer NOT NULL,
  cell_geom       geography(Point, 4326) NOT NULL,
  results_count   integer NOT NULL DEFAULT 0,
  overflow        boolean NOT NULL DEFAULT false,
  status          api_call_status NOT NULL,
  latency_ms      integer,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_calls_geom_gist  ON api_calls USING GIST (cell_geom);
CREATE INDEX api_calls_job_idx    ON api_calls (job_id, created_at);
CREATE INDEX api_calls_key_idx    ON api_calls (key_id, created_at);
-- Used by the worker cache lookup: "did we already scan this exact cell recently?"
CREATE INDEX api_calls_cache_idx  ON api_calls (cell_lat, cell_lng, cell_radius_m, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Trigger: auto-fill places.country from the country polygon
-- the point falls into. Runs on INSERT and on UPDATE of location.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fill_place_country()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.country IS NULL THEN
    SELECT a.iso_code
      INTO NEW.country
      FROM areas a
      WHERE a.type = 'country'
        AND a.iso_code IS NOT NULL
        AND ST_Contains(a.polygon, NEW.location::geometry)
      LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER places_fill_country
  BEFORE INSERT ON places
  FOR EACH ROW EXECUTE FUNCTION fill_place_country();

-- ─────────────────────────────────────────────────────────────
-- Trigger: bump updated_at on row mutation.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER api_keys_touch_updated_at
  BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER areas_touch_updated_at
  BEFORE UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER scrape_jobs_touch_updated_at
  BEFORE UPDATE ON scrape_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
