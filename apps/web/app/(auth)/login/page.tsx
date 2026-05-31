'use client';

import { App, Button, Card, Form, Input, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import { saveTokens, isAuthed } from '../../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthed()) router.replace('/dashboard');
  }, [router]);

  async function onFinish(values: { email: string; password: string }) {
    setLoading(true);
    try {
      const tokens = await api.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>('/api/auth/login', values, { anonymous: true });
      saveTokens(tokens);
      router.replace('/dashboard');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      message.error(status === 401 ? 'Invalid email or password' : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: 420 }}>
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 24 }}>
          Places Scraper
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input autoFocus placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password placeholder="••••••••" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
