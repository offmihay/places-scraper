/**
 * Spacing factor between adjacent cells. 1.35 ≈ sqrt(3) · cos(30°) — a
 * hex-like packing that overlaps neighbouring search disks by ~10% so
 * no point falls into a gap, without scanning the same area twice.
 */
export const CELL_SPACING_FACTOR = 1.35;

export const METRES_PER_DEGREE_LAT = 111_111;

/** Step between cell centres in latitude degrees. */
export function latStep(radiusM: number): number {
  return (radiusM * CELL_SPACING_FACTOR) / METRES_PER_DEGREE_LAT;
}

/**
 * Step between cell centres in longitude degrees at the given latitude.
 * Longitudes converge towards the poles, so the step depends on lat.
 */
export function lngStep(radiusM: number, atLatDeg: number): number {
  const cosLat = Math.cos((atLatDeg * Math.PI) / 180);
  return (radiusM * CELL_SPACING_FACTOR) / (METRES_PER_DEGREE_LAT * Math.max(cosLat, 1e-6));
}

export interface CellCenter {
  lat: number;
  lng: number;
}

/**
 * Walks a bbox and yields cell centre coordinates. Caller is responsible
 * for filtering centres that fall outside the actual polygon (do it in
 * PostGIS with ST_Contains, that's why we keep the bbox API generic).
 */
export function* enumerateGridCenters(
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  radiusM: number,
): Generator<CellCenter> {
  const dLat = latStep(radiusM);
  for (let lat = bbox.minLat + dLat / 2; lat <= bbox.maxLat; lat += dLat) {
    const dLng = lngStep(radiusM, lat);
    for (let lng = bbox.minLng + dLng / 2; lng <= bbox.maxLng; lng += dLng) {
      yield { lat, lng };
    }
  }
}
