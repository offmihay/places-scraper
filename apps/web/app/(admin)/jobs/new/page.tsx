'use client';

import { ArrowLeftOutlined, ClearOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../../../lib/api';
import {
  ALL_PLACE_TYPES,
  PLACE_TYPE_GROUPS,
  TYPE_TO_GROUP,
} from '../../../../lib/place-types';

interface AreaRow {
  id: string;
  name: string;
  type: 'country' | 'custom' | 'derived';
  isoCode: string | null;
  isPreset: boolean;
  areaKm2: number | null;
}

interface EstimateResult {
  areaId: string;
  radiusM: number;
  baseCells: number;
  effectiveCalls: number;
  estimatedCostUsd: number;
  estimatedDurationMin: number;
}

// Single-Select option list with optgroups (Ant Design's nested options form).
const TYPE_OPTIONS = PLACE_TYPE_GROUPS.map((g) => ({
  label: (
    <span style={{ fontWeight: 600 }}>
      {g.emoji} {g.label}{' '}
      <span style={{ color: '#999', fontWeight: 400 }}>({g.types.length})</span>
    </span>
  ),
  // Ant Design Select accepts nested 'options' to render <optgroup>.
  options: g.types.map((t) => ({ value: t, label: t })),
}));

export default function NewJobPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  const areas = useQuery({
    queryKey: ['areas', 'job-picker'],
    queryFn: () => api.get<AreaRow[]>('/api/areas', { query: { limit: 500 } }),
  });

  // Group breakdown of what's currently chosen, so the user sees what they have.
  const selectedByGroup = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of selectedTypes) {
      const g = TYPE_TO_GROUP[t] ?? 'Other';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(t);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [selectedTypes]);

  // Quick-pick: filter group lists by the search box so big sections stay scannable.
  const filteredGroups = useMemo(() => {
    if (!filter.trim()) return PLACE_TYPE_GROUPS;
    const q = filter.toLowerCase();
    return PLACE_TYPE_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) => t.includes(q)),
    })).filter((g) => g.types.length > 0);
  }, [filter]);

  function setTypes(next: string[]) {
    const unique = Array.from(new Set(next));
    setSelectedTypes(unique);
    form.setFieldValue('types', unique);
    setEstimate(null);
  }

  function addAll(types: string[]) {
    setTypes([...selectedTypes, ...types]);
  }

  function removeAll(types: string[]) {
    const drop = new Set(types);
    setTypes(selectedTypes.filter((t) => !drop.has(t)));
  }

  const estimateMutation = useMutation({
    mutationFn: (body: { areaId: string; types: string[]; mode: string; radiusM?: number }) =>
      api.post<EstimateResult>('/api/jobs/estimate', body),
    onSuccess: (data) => {
      setEstimate(data);
    },
    onError: () => message.error('Could not estimate'),
  });

  const create = useMutation({
    mutationFn: (body: {
      areaId: string;
      types: string[];
      mode: string;
      radiusM?: number;
      maxCostUsd: number;
    }) => api.post<{ id: string }>('/api/jobs', body),
    onSuccess: (data) => {
      message.success('Job started');
      router.push(`/jobs/${data.id}`);
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div style={{ maxWidth: 880 }}>
      <Space style={{ marginBottom: 16 }}>
        <Link href="/jobs">
          <Button icon={<ArrowLeftOutlined />}>Back</Button>
        </Link>
        <Typography.Title level={3} style={{ margin: 0 }}>
          New scrape job
        </Typography.Title>
      </Space>

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ mode: 'default', radiusM: 1500, maxCostUsd: 10, types: [] }}
          onValuesChange={() => setEstimate(null)}
          onFinish={async (values) => {
            if (!values.types || values.types.length === 0) {
              message.error('Pick at least one type');
              return;
            }
            const est = await estimateMutation.mutateAsync({
              areaId: values.areaId,
              types: values.types,
              mode: values.mode,
              radiusM: values.mode !== 'default' ? values.radiusM : undefined,
            });
            Modal.confirm({
              title: 'Confirm and start',
              content: (
                <div>
                  <p>
                    Estimated <b>{est.effectiveCalls.toLocaleString()}</b> API calls covering{' '}
                    <b>{est.baseCells.toLocaleString()}</b> base cells across{' '}
                    <b>{values.types.length}</b> place types.
                  </p>
                  <p>
                    Estimated cost: <b>${est.estimatedCostUsd.toFixed(2)}</b>, duration ~
                    <b>{est.estimatedDurationMin}</b> min.
                  </p>
                  <p>
                    Max budget: <b>${values.maxCostUsd.toFixed(2)}</b>.
                  </p>
                </div>
              ),
              okText: 'Start scraping',
              onOk: () =>
                create.mutateAsync({
                  areaId: values.areaId,
                  types: values.types,
                  mode: values.mode,
                  radiusM: values.mode !== 'default' ? values.radiusM : undefined,
                  maxCostUsd: values.maxCostUsd,
                }),
            });
          }}
        >
          <Form.Item name="areaId" label="Area" rules={[{ required: true }]}>
            <Select
              loading={areas.isLoading}
              showSearch
              optionFilterProp="label"
              placeholder="Pick an area"
              options={(areas.data ?? []).map((a) => ({
                value: a.id,
                label: `${a.name} ${a.isoCode ? `(${a.isoCode})` : ''} — ${
                  a.areaKm2 ? Math.round(a.areaKm2).toLocaleString() : '?'
                } km²`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="types"
            label={`Place types (${selectedTypes.length} of ${ALL_PLACE_TYPES.length} selected)`}
            rules={[{ required: true, message: 'Pick at least one type' }]}
          >
            <Select
              mode="multiple"
              showSearch
              allowClear
              placeholder="Pick types — use the category panel below for bulk selection"
              options={TYPE_OPTIONS}
              value={selectedTypes}
              onChange={(v) => setTypes(v as string[])}
              maxTagCount="responsive"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Card
            size="small"
            title={
              <Space>
                <span>Browse categories</span>
                {selectedTypes.length > 0 ? (
                  <Button
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={() => setTypes([])}
                  >
                    Clear all
                  </Button>
                ) : null}
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Input.Search
              allowClear
              placeholder="Filter types — e.g. 'restaurant', 'shop', 'medical'"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onSearch={setFilter}
              style={{ marginBottom: 12 }}
            />
            <Collapse
              size="small"
              ghost
              items={filteredGroups.map((g) => {
                const selectedInGroup = g.types.filter((t) => selectedTypes.includes(t));
                const allSelected =
                  selectedInGroup.length === g.types.length && g.types.length > 0;
                return {
                  key: g.label,
                  label: (
                    <Space>
                      <span>
                        {g.emoji} <b>{g.label}</b>
                      </span>
                      <Tag>
                        {selectedInGroup.length} / {g.types.length}
                      </Tag>
                    </Space>
                  ),
                  extra: (
                    <Space onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="small"
                        type={allSelected ? 'default' : 'primary'}
                        onClick={() => (allSelected ? removeAll(g.types) : addAll(g.types))}
                      >
                        {allSelected ? 'Deselect group' : 'Select all'}
                      </Button>
                    </Space>
                  ),
                  children: (
                    <Space wrap size={[6, 6]}>
                      {g.types.map((t) => {
                        const on = selectedTypes.includes(t);
                        return (
                          <Tag.CheckableTag
                            key={t}
                            checked={on}
                            onChange={(checked) =>
                              checked ? addAll([t]) : removeAll([t])
                            }
                          >
                            {t}
                          </Tag.CheckableTag>
                        );
                      })}
                    </Space>
                  ),
                };
              })}
            />
          </Card>

          {selectedByGroup.length > 0 ? (
            <Card size="small" type="inner" style={{ marginBottom: 16 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Selected so far:
              </Typography.Text>
              <div style={{ marginTop: 6 }}>
                {selectedByGroup.map(([group, types]) => (
                  <div key={group} style={{ marginBottom: 4 }}>
                    <Typography.Text strong style={{ fontSize: 12 }}>
                      {group}
                    </Typography.Text>
                    <span style={{ color: '#888', fontSize: 12 }}> · </span>
                    <span style={{ fontSize: 12 }}>{types.join(', ')}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Form.Item name="mode" label="Cell radius mode">
            <Select
              options={[
                { value: 'default', label: 'Default (1500 m)' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </Form.Item>
          <Form.Item name="radiusM" label="Initial radius (m)" dependencies={['mode']}>
            <InputNumber min={50} max={50000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxCostUsd"
            label="Max cost (USD)"
            rules={[{ required: true }]}
            extra="Hard limit — job pauses when actual cost approaches this number."
          >
            <InputNumber min={0.01} step={1} style={{ width: '100%' }} />
          </Form.Item>
          {estimate ? (
            <Card type="inner" size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical">
                <span>
                  Base cells: <b>{estimate.baseCells.toLocaleString()}</b>
                </span>
                <span>
                  Effective calls (with quadtree):{' '}
                  <b>{estimate.effectiveCalls.toLocaleString()}</b>
                </span>
                <span>
                  Cost: <b>${estimate.estimatedCostUsd.toFixed(2)}</b>
                </span>
                <span>
                  Duration: ~<b>{estimate.estimatedDurationMin}</b> min
                </span>
              </Space>
            </Card>
          ) : null}
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={estimateMutation.isPending || create.isPending}
          >
            Estimate &amp; start
          </Button>
        </Form>
      </Card>
    </div>
  );
}
