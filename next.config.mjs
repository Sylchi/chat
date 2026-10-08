/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
  output: 'export',
  basePath: isProd ? '/chat' : '',
  assetPrefix: isProd ? '/chat/' : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}

export default nextConfig