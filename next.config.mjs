/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only service - disable React features we don't need
  reactStrictMode: true,
  poweredByHeader: false,
  
  // Increase body size limit for bundle uploads (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
