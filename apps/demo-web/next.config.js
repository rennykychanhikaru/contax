/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kit/ui'],
  experimental: {
    // Enable CSS @import from node_modules
    optimizePackageImports: ['@kit/ui'],
  },
  // Webpack configuration for monorepo compatibility
  webpack: (config) => {
    // Fix module resolution for monorepo
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.join(__dirname, '.'),
      // Force React to resolve from workspace root
      'react': path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
      'styled-jsx': path.resolve(__dirname, '../../node_modules/styled-jsx'),
    }
    
    return config
  },
}

module.exports = nextConfig