export type Position = [number, number];

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface GeoJSONMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type AnyPolygon = GeoJSONPolygon | GeoJSONMultiPolygon;

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}
