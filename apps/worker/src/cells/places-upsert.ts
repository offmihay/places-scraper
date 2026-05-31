import type { Database } from '@places/db';
import { sql } from 'drizzle-orm';
import type { PlaceFromApi } from '../scraper/places-client.types.js';

function extractCity(place: PlaceFromApi): string | null {
  const comp = place.addressComponents ?? [];
  const locality =
    comp.find((c) => c.types?.includes('locality')) ??
    comp.find((c) => c.types?.includes('postal_town')) ??
    comp.find((c) => c.types?.includes('administrative_area_level_2'));
  return locality?.longText ?? locality?.shortText ?? null;
}

export async function upsertPlaces(
  db: Database,
  jobId: string,
  places: PlaceFromApi[],
): Promise<number> {
  if (places.length === 0) return 0;

  let count = 0;
  for (const p of places) {
    if (!p.id || !p.location) continue;

    const name = p.displayName?.text ?? null;
    const address = p.formattedAddress ?? p.shortFormattedAddress ?? null;
    const city = extractCity(p);
    const types = p.types ?? [];
    const primaryType = p.primaryType ?? null;
    const businessStatus = p.businessStatus ?? null;
    const phone = p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null;
    const uri = p.googleMapsUri ?? null;
    const lng = p.location.longitude;
    const lat = p.location.latitude;

    await db.execute(sql`
      INSERT INTO places (
        place_id, name, formatted_address, city,
        location, types, primary_type, business_status,
        phone, google_maps_uri, raw_data, source_job_ids
      ) VALUES (
        ${p.id},
        ${name},
        ${address},
        ${city},
        ST_SetSRID(ST_Point(${lng}, ${lat}), 4326)::geography,
        ${types}::text[],
        ${primaryType},
        ${businessStatus},
        ${phone},
        ${uri},
        ${JSON.stringify(p)}::jsonb,
        ARRAY[${jobId}::uuid]
      )
      ON CONFLICT (place_id) DO UPDATE SET
        name = EXCLUDED.name,
        formatted_address = EXCLUDED.formatted_address,
        city = COALESCE(places.city, EXCLUDED.city),
        types = EXCLUDED.types,
        primary_type = EXCLUDED.primary_type,
        business_status = EXCLUDED.business_status,
        phone = COALESCE(EXCLUDED.phone, places.phone),
        google_maps_uri = COALESCE(EXCLUDED.google_maps_uri, places.google_maps_uri),
        raw_data = EXCLUDED.raw_data,
        last_seen_at = now(),
        source_job_ids = (
          SELECT ARRAY(SELECT DISTINCT unnest(places.source_job_ids || EXCLUDED.source_job_ids))
        )
    `);
    count += 1;
  }
  return count;
}
