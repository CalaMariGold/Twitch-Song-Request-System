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
    // Increase serverComponentsExternalPackages
    experimental: {
        proxyTimeout: 120000, // 2 minutes timeout
        serverComponentsExternalPackages: ['socket.io', 'socket.io-client'],
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
    // Add a custom route handler for socket.io
    async headers() {
        return [
            {
                source: '/socket.io/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    },
                    {
                        key: 'Connection',
                        value: 'keep-alive',
                    }
                ],
            }
        ]
    }
}

module.exports = nextConfig 