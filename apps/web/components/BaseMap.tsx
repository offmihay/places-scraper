'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, type ReactNode } from 'react';

const RASTER_OSM: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

interface Props {
  initialCenter?: [number, number];
  initialZoom?: number;
  onLoad?: (map: MlMap) => void;
  onMoveEnd?: (map: MlMap) => void;
  style?: React.CSSProperties;
  children?: ReactNode;
}

/**
 * Minimal MapLibre wrapper — OSM raster tiles, no token required. Hands the
 * Map instance to the caller via onLoad so they can add their own sources /
 * layers without coupling to react-map-gl. Future enhancement: vector tiles
 * + terra-draw integration for AreaEditor.
 */
export default function BaseMap({
  initialCenter = [10, 50],
  initialZoom = 4,
  onLoad,
  onMoveEnd,
  style,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: RASTER_OSM,
      center: initialCenter,
      zoom: initialZoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    map.on('load', () => onLoad?.(map));
    if (onMoveEnd) map.on('moveend', () => onMoveEnd(map));
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }}>
      {children}
    </div>
  );
}
