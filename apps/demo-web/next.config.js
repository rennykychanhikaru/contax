/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverActions: false },
  transpilePackages: ['@kit/ui']
}

module.exports = nextConfig
