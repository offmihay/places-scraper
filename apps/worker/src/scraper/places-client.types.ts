export interface PlaceLocation {
  latitude: number;
  longitude: number;
}

export interface PlaceDisplayName {
  text: string;
  languageCode?: string;
}

/** Subset of the Places API (New) response we actually need. */
export interface PlaceFromApi {
  id: string;
  displayName?: PlaceDisplayName;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  location?: PlaceLocation;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
}

export interface NearbySearchResponse {
  places?: PlaceFromApi[];
}

export type NearbySearchError =
  | { kind: 'rate-limited'; status: number; message: string }
  | { kind: 'quota-exhausted'; status: number; message: string }
  | { kind: 'unauthorized'; status: number; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'other'; status: number; message: string };

export interface NearbySearchOptions {
  apiKey: string;
  lat: number;
  lng: number;
  radiusM: number;
  includedTypes: string[];
  maxResultCount?: number;
  languageCode?: string;
  regionCode?: string;
}
