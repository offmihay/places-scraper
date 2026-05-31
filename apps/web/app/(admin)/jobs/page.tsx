'use client';

import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import { App, Button, Progress, Select, Space, Table, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../lib/api';

interface ScrapeJob {
  id: string;
  areaId: string;
  types: string[];
  mode: 'default' | 'auto' | 'manual';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  progressDone: number;
  progressTotal: number;
  estimatedCostUsd: number | null;
  actualCostUsd: number;
  maxCostUsd: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const statusColor: Record<ScrapeJob['status'], string> = {
  pending: 'default',
  running: 'processing',
  paused: 'warning',
  completed: 'success',
  cancelled: 'default',
  failed: 'error',
};

export default function JobsPage() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [status, setStatus] = useState<ScrapeJob['status'] | undefined>();

  const jobs = useQuery({
    queryKey: ['jobs', status],
    queryFn: () =>
      api.get<ScrapeJob[]>('/api/jobs', { query: { status, limit: 100 } }),
    refetchInterval: 5000,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/jobs/${id}/cancel`),
    onSuccess: () => {
      message.success('Cancelled');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Jobs
        </Typography.Title>
        <Link href="/jobs/new">
          <Button type="primary" icon={<PlusOutlined />}>
            New job
          </Button>
        </Link>
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Status"
          style={{ width: 180 }}
          value={status}
          onChange={(v) => setStatus(v)}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'running', label: 'Running' },
            { value: 'paused', label: 'Paused' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
      </Space>

      <Table<ScrapeJob>
        loading={jobs.isLoading}
        dataSource={jobs.data ?? []}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 25 }}
        columns={[
          {
            title: 'ID',
            dataIndex: 'id',
            render: (v: string) => (
              <Link href={`/jobs/${v}`}>
                <code style={{ fontSize: 12 }}>{v.slice(0, 8)}</code>
              </Link>
            ),
            width: 100,
          },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 110,
            render: (v: ScrapeJob['status']) => <Tag color={statusColor[v]}>{v}</Tag>,
          },
          {
            title: 'Progress',
            width: 220,
            render: (_, row) => {
              const pct =
                row.progressTotal > 0
                  ? Math.round((row.progressDone / row.progressTotal) * 100)
                  : 0;
              return (
                <div>
                  <Progress percent={pct} size="small" />
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {row.progressDone} / {row.progressTotal}
                  </span>
                </div>
              );
            },
          },
          {
            title: 'Types',
            dataIndex: 'types',
            render: (v: string[]) => (
              <Space wrap size={2}>
                {v.slice(0, 3).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
                {v.length > 3 ? <Tag>+{v.length - 3}</Tag> : null}
              </Space>
            ),
          },
          {
            title: 'Cost',
            width: 160,
            render: (_, row) => (
              <span>
                ${row.actualCostUsd.toFixed(2)} / ${row.maxCostUsd.toFixed(2)}
              </span>
            ),
          },
          {
            title: 'Started',
            dataIndex: 'startedAt',
            width: 160,
            render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—'),
          },
          {
            title: '',
            width: 100,
            render: (_, row) =>
              ['running', 'paused', 'pending'].includes(row.status) ? (
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => cancel.mutate(row.id)}
                >
                  Cancel
                </Button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
