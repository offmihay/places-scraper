'use client';

import { ArrowLeftOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Descriptions,
  Progress,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, openStream } from '../../../../lib/api';

interface ScrapeJob {
  id: string;
  areaId: string;
  types: string[];
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  progressDone: number;
  progressTotal: number;
  actualCostUsd: number;
  maxCostUsd: number;
  estimatedCostUsd: number | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
}

interface LiveCell {
  lat: number;
  lng: number;
  radiusM: number;
  status: string;
  resultsCount: number;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [live, setLive] = useState<{ done: number; total: number; costUsd: number } | null>(null);
  const [recentCells, setRecentCells] = useState<LiveCell[]>([]);

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.get<ScrapeJob>(`/api/jobs/${id}`),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status && ['running', 'pending', 'paused'].includes(status) ? 5000 : false;
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/jobs/${id}/cancel`),
    onSuccess: () => {
      message.success('Cancelled');
      void qc.invalidateQueries({ queryKey: ['job', id] });
    },
  });

  const retry = useMutation({
    mutationFn: () => api.post(`/api/jobs/${id}/retry-failed`),
    onSuccess: (r: unknown) => {
      message.success(`Retried ${(r as { retried: number }).retried} cells`);
      void qc.invalidateQueries({ queryKey: ['job', id] });
    },
  });

  const esRef = useRef<EventSource | null>(null);
  useEffect(() => {
    if (!id) return;
    const es = openStream(`/api/jobs/${id}/stream`);
    esRef.current = es;
    es.addEventListener('progress', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as {
        done: number;
        total: number;
        costUsd: number;
      };
      setLive({ done: data.done, total: data.total, costUsd: data.costUsd });
    });
    es.addEventListener('cell', (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as LiveCell & { kind: 'cell' };
      setRecentCells((prev) => [data, ...prev].slice(0, 20));
    });
    es.addEventListener('status', () => {
      void qc.invalidateQueries({ queryKey: ['job', id] });
    });
    es.onerror = () => {
      // The connection will silently retry; nothing to do.
    };
    return () => {
      es.close();
    };
  }, [id, qc]);

  const done = live?.done ?? job.data?.progressDone ?? 0;
  const total = live?.total ?? job.data?.progressTotal ?? 0;
  const cost = live?.costUsd ?? job.data?.actualCostUsd ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ maxWidth: 980 }}>
      <Space style={{ marginBottom: 16 }}>
        <Link href="/jobs">
          <Button icon={<ArrowLeftOutlined />}>Back</Button>
        </Link>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Job <code>{id?.slice(0, 8)}</code>
        </Typography.Title>
        {job.data ? <Tag>{job.data.status}</Tag> : null}
      </Space>

      <Space style={{ marginBottom: 16 }}>
        {job.data && ['running', 'paused', 'pending'].includes(job.data.status) ? (
          <Button danger icon={<StopOutlined />} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        ) : null}
        {job.data && job.data.status !== 'completed' ? (
          <Button icon={<ReloadOutlined />} onClick={() => retry.mutate()}>
            Retry failed cells
          </Button>
        ) : null}
      </Space>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Progress">
          <Progress percent={pct} status={pct === 100 ? 'success' : 'active'} />
          <Statistic
            title="Cells done"
            value={`${done} / ${total}`}
            style={{ marginTop: 16 }}
          />
        </Card>
        <Card title="Cost">
          <Statistic
            title="USD spent"
            value={cost}
            precision={4}
            valueStyle={{ color: '#1677ff' }}
          />
          <div style={{ marginTop: 8, color: '#888' }}>
            of ${job.data?.maxCostUsd.toFixed(2)} budget
          </div>
        </Card>
      </div>

      <Card title="Details" style={{ marginTop: 16 }}>
        <Descriptions
          column={2}
          size="small"
          items={[
            { key: 'area', label: 'Area', children: job.data?.areaId },
            {
              key: 'types',
              label: 'Types',
              children: (
                <Space wrap>
                  {job.data?.types.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </Space>
              ),
            },
            {
              key: 'start',
              label: 'Started',
              children: job.data?.startedAt ? new Date(job.data.startedAt).toLocaleString() : '—',
            },
            {
              key: 'completed',
              label: 'Completed',
              children: job.data?.completedAt
                ? new Date(job.data.completedAt).toLocaleString()
                : '—',
            },
            { key: 'error', label: 'Error', children: job.data?.error ?? '—' },
          ]}
        />
      </Card>

      <Card title={`Live feed (${recentCells.length})`} style={{ marginTop: 16 }}>
        {recentCells.length === 0 ? (
          <Typography.Text type="secondary">
            Waiting for events… (paired with REST polling for initial state)
          </Typography.Text>
        ) : (
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {recentCells.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  borderBottom: '1px dashed #eee',
                  fontSize: 12,
                }}
              >
                <span>
                  <Tag color={c.status === 'ok' ? 'green' : 'red'}>{c.status}</Tag>
                  {c.lat.toFixed(4)}, {c.lng.toFixed(4)} ({c.radiusM} m)
                </span>
                <span>{c.resultsCount} places</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
