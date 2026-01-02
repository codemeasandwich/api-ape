/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,  // Disabled to test duplicate message issue
  swcMinify: true,
  output: 'standalone',
}

module.exports = nextConfig
