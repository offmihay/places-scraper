/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@places/shared'],
  output: 'standalone',
};

export default nextConfig;
