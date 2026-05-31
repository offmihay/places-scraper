'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
} from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../../lib/api';

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

const COMMON_TYPES = [
  'restaurant',
  'cafe',
  'bar',
  'bakery',
  'hotel',
  'lodging',
  'tourist_attraction',
  'museum',
  'shopping_mall',
  'store',
  'pharmacy',
  'hospital',
  'gym',
  'spa',
  'gas_station',
  'parking',
];

export default function NewJobPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

  const areas = useQuery({
    queryKey: ['areas', 'job-picker'],
    queryFn: () => api.get<AreaRow[]>('/api/areas', { query: { limit: 500 } }),
  });

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
    <div style={{ maxWidth: 720 }}>
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
          initialValues={{ mode: 'default', radiusM: 1500, maxCostUsd: 10 }}
          onValuesChange={() => setEstimate(null)}
          onFinish={async (values) => {
            // Two-step: estimate, then show modal, then commit.
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
                    <b>{est.baseCells.toLocaleString()}</b> base cells.
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
          <Form.Item name="types" label="Place types" rules={[{ required: true }]}>
            <Select
              mode="tags"
              placeholder="Pick types (e.g. restaurant, cafe)"
              options={COMMON_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>
          <Form.Item name="mode" label="Cell radius mode">
            <Select
              options={[
                { value: 'default', label: 'Default (1500 m)' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="radiusM"
            label="Initial radius (m)"
            dependencies={['mode']}
          >
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
                  Effective calls (with quadtree): <b>{estimate.effectiveCalls.toLocaleString()}</b>
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
