'use client';

import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';

interface AreaRow {
  id: string;
  name: string;
  type: 'country' | 'custom' | 'derived';
  isoCode: string | null;
  areaKm2: number | null;
  isPreset: boolean;
  createdAt: string;
}

export default function AreasPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [type, setType] = useState<'country' | 'custom' | 'derived' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form] = Form.useForm();

  const areas = useQuery({
    queryKey: ['areas', type, search],
    queryFn: () =>
      api.get<AreaRow[]>('/api/areas', {
        query: {
          type: type === 'all' ? undefined : type,
          search: search || undefined,
          limit: 500,
        },
      }),
  });

  const create = useMutation({
    mutationFn: (body: { name: string; polygon: unknown }) => api.post('/api/areas', body),
    onSuccess: () => {
      message.success('Area created');
      setAddOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['areas'] });
    },
    onError: (e: Error) => message.error(`Failed: ${e.message}`),
  });

  const clone = useMutation({
    mutationFn: (countryAreaId: string) =>
      api.post('/api/areas/from-country', { countryAreaId }),
    onSuccess: () => {
      message.success('Cloned');
      void qc.invalidateQueries({ queryKey: ['areas'] });
    },
    onError: () => message.error('Clone failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/areas/${id}`),
    onSuccess: () => {
      message.success('Area removed');
      void qc.invalidateQueries({ queryKey: ['areas'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Areas
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          New custom area
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Countries', value: 'country' },
              { label: 'Custom', value: 'custom' },
              { label: 'Derived', value: 'derived' },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="Search by name"
            style={{ width: 260 }}
            onSearch={setSearch}
          />
        </Space>
      </Card>

      <Table<AreaRow>
        loading={areas.isLoading}
        dataSource={areas.data ?? []}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 50 }}
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            render: (v, row) => (
              <Space>
                <span>{v}</span>
                {row.isoCode ? <Tag>{row.isoCode}</Tag> : null}
                {row.isPreset ? <Tag color="default">preset</Tag> : null}
              </Space>
            ),
          },
          { title: 'Type', dataIndex: 'type', width: 110 },
          {
            title: 'Area',
            dataIndex: 'areaKm2',
            width: 140,
            render: (v: number | null) => (v ? `${Math.round(v).toLocaleString()} km²` : '—'),
          },
          {
            title: '',
            width: 100,
            render: (_, row) => (
              <Space>
                {row.type === 'country' ? (
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => clone.mutate(row.id)}
                  >
                    Clone
                  </Button>
                ) : null}
                {!row.isPreset ? (
                  <Popconfirm title="Remove area?" onConfirm={() => remove.mutate(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New custom area"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values: { name: string; polygon: string }) => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(values.polygon);
            } catch {
              message.error('Polygon must be valid JSON');
              return;
            }
            create.mutate({ name: values.name, polygon: parsed as never });
          }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Warsaw custom" />
          </Form.Item>
          <Form.Item
            name="polygon"
            label="GeoJSON polygon"
            rules={[{ required: true }]}
            extra={
              <span>
                Paste a Polygon or MultiPolygon GeoJSON. Inline map drawing arrives in a follow-up
                iteration.
              </span>
            }
          >
            <Input.TextArea
              rows={10}
              placeholder='{"type":"Polygon","coordinates":[[[2.3,48.83],[2.4,48.83],[2.4,48.88],[2.3,48.88],[2.3,48.83]]]}'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
