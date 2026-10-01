import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Photos are resized in the browser before upload; uploads are capped at 4 MB (see lib/storage.ts).
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  serverExternalPackages: ['pg'],
};

export default nextConfig;
