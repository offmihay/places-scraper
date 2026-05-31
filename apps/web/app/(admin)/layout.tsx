'use client';

import {
  ApiOutlined,
  AppstoreOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  KeyOutlined,
  LogoutOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Spin } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { clearTokens, isAuthed } from '../../lib/auth';

const SIDEBAR_W = 220;

const items = [
  { key: '/dashboard', label: 'Dashboard', icon: <AppstoreOutlined /> },
  { key: '/keys', label: 'API Keys', icon: <KeyOutlined /> },
  { key: '/areas', label: 'Areas', icon: <GlobalOutlined /> },
  { key: '/jobs', label: 'Jobs', icon: <PlayCircleOutlined /> },
  { key: '/places', label: 'Places', icon: <EnvironmentOutlined /> },
  { key: '/coverage', label: 'Coverage', icon: <ApiOutlined /> },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isAuthed()) {
      router.replace('/login');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  if (!authChecked) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const activeKey = items.find((i) => pathname?.startsWith(i.key))?.key ?? '/dashboard';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={SIDEBAR_W} style={{ background: '#0f172a' }}>
        <div
          style={{
            color: '#fff',
            padding: '18px 20px',
            fontWeight: 600,
            fontSize: 16,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          Places Scraper
        </div>
        <Menu
          theme="dark"
          mode="inline"
          style={{ background: 'transparent' }}
          selectedKeys={[activeKey]}
          items={items.map((i) => ({
            key: i.key,
            icon: i.icon,
            label: <Link href={i.key}>{i.label}</Link>,
          }))}
        />
        <div style={{ position: 'absolute', bottom: 16, left: 12, right: 12 }}>
          <Menu
            theme="dark"
            mode="inline"
            style={{ background: 'transparent' }}
            items={[
              {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: 'Sign out',
                onClick: () => {
                  clearTokens();
                  router.replace('/login');
                },
              },
            ]}
          />
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Content style={{ padding: 24 }}>{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}
