/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Auth routes rely on runtime request context and session cookies.
  // app/login/page.tsx is explicitly set to `dynamic = 'force-dynamic'`.
};

export default nextConfig;
