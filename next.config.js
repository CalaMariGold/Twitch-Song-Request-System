/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                net: false,
                dns: false,
                tls: false,
                fs: false,
                'supports-color': false
            }
        }
        return config
    },
    async rewrites() {
        return [
            {
                source: '/socket.io/:path*',
                destination: 'http://127.0.0.1:3002/socket.io/:path*',
                basePath: false
            }
        ]
    },
    experimental: {
        proxyTimeout: 120000 // 2 minutes timeout
    }
}

module.exports = nextConfig 