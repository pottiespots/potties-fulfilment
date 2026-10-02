import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Photos are resized in the browser before upload; uploads are capped at 4 MB (see lib/storage.ts).
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  serverExternalPackages: ['pg'],
  // Shown at the bottom of every page so you can tell which update is live (Netlify sets COMMIT_REF).
  env: {
    APP_VERSION: (process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    APP_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
