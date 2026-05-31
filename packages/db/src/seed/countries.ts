import { config } from 'dotenv';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..', '..');
config({ path: join(repoRoot, '.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';

const dataDir = join(__dirname, '..', '..', 'data');
const geojsonPath = join(dataDir, 'ne_10m_admin_0_countries.geojson');

async function ensureGeoJSON(): Promise<string> {
  try {
    await stat(geojsonPath);
    console.log(`using cached ${geojsonPath}`);
    return readFile(geojsonPath, 'utf8');
  } catch {
    // fallthrough — download
  }
  console.log(`downloading ${NE_URL}`);
  await mkdir(dataDir, { recursive: true });
  const res = await fetch(NE_URL);
  if (!res.ok) {
    throw new Error(`Failed to download Natural Earth GeoJSON: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  await writeFile(geojsonPath, text, 'utf8');
  console.log(`cached to ${geojsonPath} (${(text.length / 1024 / 1024).toFixed(1)} MB)`);
  return text;
}

interface NEFeature {
  type: 'Feature';
  properties: Record<string, unknown> & {
    NAME?: string;
    NAME_EN?: string;
    NAME_LONG?: string;
    ISO_A2?: string;
    ISO_A2_EH?: string;
    ADM0_A3?: string;
  };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

interface NECollection {
  type: 'FeatureCollection';
  features: NEFeature[];
}

function pickIso(p: NEFeature['properties']): string | null {
  // Natural Earth uses "-99" / "" as missing-value sentinels.
  const candidates = [p.ISO_A2, p.ISO_A2_EH];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length === 2 && candidate !== '-9') {
      return candidate.toUpperCase();
    }
  }
  return null;
}

function pickName(p: NEFeature['properties']): string {
  return (
    (typeof p.NAME_LONG === 'string' && p.NAME_LONG) ||
    (typeof p.NAME_EN === 'string' && p.NAME_EN) ||
    (typeof p.NAME === 'string' && p.NAME) ||
    'Unknown'
  );
}

async function main() {
  const text = await ensureGeoJSON();
  const collection: NECollection = JSON.parse(text);
  console.log(`parsed ${collection.features.length} features`);

  const sql = postgres(url!, { max: 1 });

  // Wipe existing country presets so the seed is idempotent.
  const deleted = await sql`DELETE FROM areas WHERE type = 'country' AND is_preset = true`;
  console.log(`removed ${deleted.count} existing country presets`);

  let inserted = 0;
  let skipped = 0;
  for (const f of collection.features) {
    const iso = pickIso(f.properties);
    const name = pickName(f.properties);
    if (!iso) {
      skipped += 1;
      continue;
    }
    const geomJson = JSON.stringify(f.geometry);
    await sql`
      INSERT INTO areas (type, name, iso_code, polygon, area_km2, is_preset)
      VALUES (
        'country',
        ${name},
        ${iso},
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)),
        ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)::geography) / 1000000,
        true
      )
    `;
    inserted += 1;
    if (inserted % 25 === 0) console.log(`  ${inserted} inserted…`);
  }

  await sql.end();
  console.log(`done — inserted ${inserted}, skipped ${skipped} (no ISO-2)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
