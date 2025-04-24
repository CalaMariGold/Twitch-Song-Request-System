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
    // Disable buffer optimization (can interfere with WebSockets)
    output: {
        webassemblyModuleFilename: 'static/wasm/[modulehash].wasm',
        buffer: false
    }
}

module.exports = nextConfig 