import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Photos are resized in the browser before upload; PDFs (invoices, waybills) can be a few MB.
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
