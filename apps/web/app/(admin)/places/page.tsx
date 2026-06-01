'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, buildExportUrl } from '../../../lib/api';

interface Place {
  id: string;
  placeId: string;
  name: string | null;
  formattedAddress: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  types: string[];
  primaryType: string | null;
  phone: string | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
  lastSeenAt: string;
}

interface PlacesPage {
  rows: Place[];
  total: number;
  limit: number;
  offset: number;
}

export default function PlacesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState<string | undefined>();
  const [city, setCity] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [hasWebsite, setHasWebsite] = useState<'yes' | 'no' | undefined>();

  const query = useMemo(
    () => ({
      search: search || undefined,
      country: country || undefined,
      city: city || undefined,
      types: types.length ? types.join(',') : undefined,
      hasWebsite: hasWebsite === 'yes' ? 'true' : hasWebsite === 'no' ? 'false' : undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [search, country, city, types, hasWebsite, page, pageSize],
  );

  const placesQ = useQuery({
    queryKey: ['places', query],
    queryFn: () => api.get<PlacesPage>('/api/places', { query }),
  });

  const stats = useQuery({
    queryKey: ['places-stats'],
    queryFn: () =>
      api.get<{ byCountry: { country: string; count: number }[]; byType: { type: string; count: number }[] }>(
        '/api/places/stats',
      ),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Places
        </Typography.Title>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            const url = buildExportUrl(
              '/api/places/export.csv',
              Object.fromEntries(
                Object.entries(query)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => [k, String(v)]),
              ),
            );
            window.open(url, '_blank');
          }}
        >
          Export CSV
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="Search name or address"
            style={{ width: 280 }}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="Country"
            style={{ width: 180 }}
            value={country}
            onChange={(v) => {
              setCountry(v);
              setPage(1);
            }}
            options={(stats.data?.byCountry ?? [])
              .filter((c) => c.country)
              .slice(0, 100)
              .map((c) => ({ value: c.country, label: `${c.country} (${c.count})` }))}
          />
          <Input
            allowClear
            placeholder="City"
            style={{ width: 180 }}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPage(1);
            }}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="Types"
            style={{ width: 280 }}
            value={types}
            onChange={(v) => {
              setTypes(v);
              setPage(1);
            }}
            options={(stats.data?.byType ?? []).map((t) => ({
              value: t.type,
              label: `${t.type} (${t.count})`,
            }))}
          />
          <Select
            allowClear
            placeholder="Website"
            style={{ width: 160 }}
            value={hasWebsite}
            onChange={(v) => {
              setHasWebsite(v);
              setPage(1);
            }}
            options={[
              { value: 'yes', label: 'Has website' },
              { value: 'no', label: 'No website' },
            ]}
          />
        </Space>
      </Card>

      <Table<Place>
        loading={placesQ.isLoading}
        dataSource={placesQ.data?.rows ?? []}
        rowKey="id"
        size="small"
        pagination={{
          current: page,
          pageSize,
          total: placesQ.data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 200],
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            render: (v, row) => (
              <div>
                <div style={{ fontWeight: 500 }}>{v ?? '—'}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{row.formattedAddress ?? ''}</div>
              </div>
            ),
          },
          {
            title: 'Country',
            dataIndex: 'country',
            width: 90,
            render: (v) => (v ? <Tag>{v}</Tag> : null),
          },
          { title: 'City', dataIndex: 'city', width: 160 },
          {
            title: 'Type',
            dataIndex: 'primaryType',
            width: 160,
            render: (v: string | null, row) => (
              <Space wrap size={2}>
                {v ? <Tag color="blue">{v}</Tag> : null}
                {row.types
                  .filter((t) => t !== v)
                  .slice(0, 3)
                  .map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
              </Space>
            ),
          },
          { title: 'Phone', dataIndex: 'phone', width: 140 },
          {
            title: 'Website',
            dataIndex: 'websiteUri',
            width: 220,
            render: (v: string | null) =>
              v ? (
                <a
                  href={v}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-block',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'middle',
                  }}
                  title={v}
                >
                  {v.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              ) : (
                <span style={{ color: '#bbb' }}>—</span>
              ),
          },
          {
            title: '',
            width: 70,
            render: (_, row) =>
              row.googleMapsUri ? (
                <a href={row.googleMapsUri} target="_blank" rel="noreferrer">
                  Maps ↗
                </a>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
