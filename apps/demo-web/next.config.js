/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kit/ui'],
  experimental: {
    // Enable CSS @import from node_modules
    optimizePackageImports: ['@kit/ui'],
  },
  // Fix for deploymentId error in development
  generateBuildId: async () => {
    return 'development-build'
  },
}

module.exports = nextConfig
