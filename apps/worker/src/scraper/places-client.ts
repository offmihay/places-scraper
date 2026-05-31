import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/config.service.js';
import type {
  NearbySearchError,
  NearbySearchOptions,
  NearbySearchResponse,
} from './places-client.types.js';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.types',
  'places.primaryType',
  'places.businessStatus',
  'places.internationalPhoneNumber',
  'places.nationalPhoneNumber',
  'places.googleMapsUri',
  'places.location',
  'places.addressComponents',
].join(',');

export interface NearbySearchResult {
  ok: true;
  places: NonNullable<NearbySearchResponse['places']>;
  latencyMs: number;
}

export interface NearbySearchFailure {
  ok: false;
  error: NearbySearchError;
  latencyMs: number;
}

@Injectable()
export class PlacesClient {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async nearbySearch(opts: NearbySearchOptions): Promise<NearbySearchResult | NearbySearchFailure> {
    const url = `${this.config.get('GOOGLE_PLACES_BASE_URL')}/v1/places:searchNearby`;
    const body = {
      includedTypes: opts.includedTypes,
      maxResultCount: opts.maxResultCount ?? 20,
      languageCode: opts.languageCode ?? 'en',
      ...(opts.regionCode ? { regionCode: opts.regionCode } : {}),
      locationRestriction: {
        circle: {
          center: { latitude: opts.lat, longitude: opts.lng },
          radius: opts.radiusM,
        },
      },
    };

    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': opts.apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        ok: false,
        error: { kind: 'network', message: (err as Error).message },
        latencyMs: Date.now() - start,
      };
    }
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const message = await res.text().catch(() => '');
      return { ok: false, error: classifyError(res.status, message), latencyMs };
    }

    const json = (await res.json()) as NearbySearchResponse;
    return { ok: true, places: json.places ?? [], latencyMs };
  }
}

function classifyError(status: number, message: string): NearbySearchError {
  if (status === 401 || status === 403) {
    if (/quota|RESOURCE_EXHAUSTED/i.test(message)) {
      return { kind: 'quota-exhausted', status, message };
    }
    return { kind: 'unauthorized', status, message };
  }
  if (status === 429) return { kind: 'rate-limited', status, message };
  if (status >= 500) return { kind: 'other', status, message };
  return { kind: 'other', status, message };
}
