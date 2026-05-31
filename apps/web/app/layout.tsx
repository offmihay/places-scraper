import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { Providers } from '../lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Places Scraper',
  description: 'Admin console for Google Places scraping',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
