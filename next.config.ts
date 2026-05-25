import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'node-cron', 'nodemailer'],
  output: 'standalone',
}

export default nextConfig
