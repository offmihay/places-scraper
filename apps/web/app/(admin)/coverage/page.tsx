'use client';

import { Card, Select, Space, Switch, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { Map as MlMap } from 'maplibre-gl';
import { useCallback, useEffect, useState } from 'react';
import BaseMap from '../../../components/BaseMap';
import { api } from '../../../lib/api';

interface AreaRow {
  id: string;
  name: string;
  isoCode: string | null;
  areaKm2: number | null;
}

interface CoverageFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSON.Feature[];
}

interface AreaSummary {
  totalKm2: number;
  coveredKm2: number;
  coveragePercent: number;
  lastScanAt: string | null;
  totalPlaces: number;
}

const CELL_LAYER_ID = 'coverage-cells';
const PLACE_LAYER_ID = 'coverage-places';

export default function CoveragePage() {
  const [map, setMap] = useState<MlMap | null>(null);
  const [bbox, setBbox] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | undefined>();
  const [showPlaces, setShowPlaces] = useState(true);

  const areas = useQuery({
    queryKey: ['areas', 'coverage'],
    queryFn: () => api.get<AreaRow[]>('/api/areas', { query: { limit: 500 } }),
  });

  const cells = useQuery({
    queryKey: ['coverage-cells', bbox],
    queryFn: () =>
      api.get<CoverageFeatureCollection>('/api/coverage/cells', {
        query: { bbox: bbox ?? undefined, limit: 5000 },
      }),
    enabled: !!bbox,
  });

  const places = useQuery({
    queryKey: ['coverage-places', bbox, showPlaces],
    queryFn: () =>
      api.get<CoverageFeatureCollection>('/api/places/geojson', {
        query: { bbox: bbox ?? undefined },
      }),
    enabled: !!bbox && showPlaces,
  });

  const summary = useQuery({
    queryKey: ['coverage-summary', areaId],
    queryFn: () => api.get<AreaSummary>(`/api/coverage/areas/${areaId}/summary`),
    enabled: !!areaId,
  });

  const onMoveEnd = useCallback((m: MlMap) => {
    const b = m.getBounds();
    setBbox(
      `${b.getWest().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b
        .getNorth()
        .toFixed(4)}`,
    );
  }, []);

  // Cells layer (circles sized by radius).
  useEffect(() => {
    if (!map || !cells.data) return;
    const id = CELL_LAYER_ID;
    const data = cells.data as unknown as GeoJSON.FeatureCollection;
    if (map.getSource(id)) {
      (map.getSource(id) as maplibregl.GeoJSONSource).setData(data);
      return;
    }
    map.addSource(id, { type: 'geojson', data });
    map.addLayer({
      id,
      type: 'circle',
      source: id,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          // Roughly preserve "metres on the ground" → pixels.
          5,
          ['/', ['get', 'radius'], 4000],
          12,
          ['/', ['get', 'radius'], 50],
          18,
          ['/', ['get', 'radius'], 1],
        ],
        'circle-color': [
          'match',
          ['get', 'status'],
          'ok',
          ['case', ['get', 'overflow'], '#f59e0b', '#22c55e'],
          'failed',
          '#ef4444',
          'rate_limited',
          '#f97316',
          '#9ca3af',
        ],
        'circle-opacity': 0.35,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#1f2937',
        'circle-stroke-opacity': 0.4,
      },
    });
  }, [map, cells.data]);

  // Places layer.
  useEffect(() => {
    if (!map) return;
    const id = PLACE_LAYER_ID;
    if (!showPlaces) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      return;
    }
    if (places.data) {
      const data = places.data as unknown as GeoJSON.FeatureCollection;
      if (map.getSource(id)) {
        (map.getSource(id) as maplibregl.GeoJSONSource).setData(data);
        map.setLayoutProperty(id, 'visibility', 'visible');
        return;
      }
      map.addSource(id, { type: 'geojson', data });
      map.addLayer({
        id,
        type: 'circle',
        source: id,
        paint: {
          'circle-radius': 3.5,
          'circle-color': '#1d4ed8',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
        },
      });
    }
  }, [map, places.data, showPlaces]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, height: 'calc(100vh - 48px)' }}>
      <Card title="Coverage" size="small" bodyStyle={{ padding: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary">Focus on area</Typography.Text>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Pick area to focus"
              value={areaId}
              onChange={setAreaId}
              options={(areas.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.name}${a.isoCode ? ` (${a.isoCode})` : ''}`,
              }))}
            />
          </div>
          {summary.data ? (
            <Card size="small" style={{ marginTop: 12 }}>
              <div>
                Total: <b>{Math.round(summary.data.totalKm2).toLocaleString()}</b> km²
              </div>
              <div>
                Covered: <b>{Math.round(summary.data.coveredKm2).toLocaleString()}</b> km²
              </div>
              <div>
                Coverage: <b>{summary.data.coveragePercent}%</b>
              </div>
              <div>
                Places in area: <b>{summary.data.totalPlaces.toLocaleString()}</b>
              </div>
              <div>
                Last scan:{' '}
                {summary.data.lastScanAt
                  ? new Date(summary.data.lastScanAt).toLocaleString()
                  : '—'}
              </div>
            </Card>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <Switch checked={showPlaces} onChange={setShowPlaces} /> &nbsp;Show places
          </div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>
            Showing api_calls cells (status colour-coded) and points. terra-draw integration
            for "Scan uncovered" comes next; for now the API does it via{' '}
            <code>GET /api/coverage/areas/:id/uncovered</code>.
          </Typography.Paragraph>
        </Space>
      </Card>

      <div style={{ background: '#000', borderRadius: 6, overflow: 'hidden' }}>
        <BaseMap onLoad={setMap} onMoveEnd={onMoveEnd} initialZoom={3} />
      </div>
    </div>
  );
}
