/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Menu/logo images come from the platform CDN in production; allow any https
  // host in dev so seeded/placeholder images render.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
