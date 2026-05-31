'use client';

import { Card, Col, Row, Statistic, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

interface Stats {
  byCountry: { country: string | null; count: number }[];
  byType: { type: string; count: number }[];
  total: number;
}

export default function DashboardPage() {
  const stats = useQuery({
    queryKey: ['places-stats'],
    queryFn: () => api.get<Stats>('/api/places/stats'),
  });

  return (
    <div>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Dashboard
      </Typography.Title>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total places"
              value={stats.data?.total ?? 0}
              loading={stats.isLoading}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Distinct countries"
              value={stats.data?.byCountry.filter((c) => c.country).length ?? 0}
              loading={stats.isLoading}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Top types" size="small">
            {stats.data?.byType.slice(0, 8).map((t) => (
              <div
                key={t.type}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
              >
                <span>{t.type}</span>
                <span style={{ color: '#888' }}>{t.count}</span>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
