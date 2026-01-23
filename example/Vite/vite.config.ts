import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import apiApe from 'api-ape/vite'

export default defineConfig({
    plugins: [
        vue(),
        apiApe({
            where: 'api',
            onConnect: './ape/onConnect'  // Loaded at runtime, not bundled
        })
    ],
    server: {
        port: 5173
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true
    },
    // Keep api-ape as external for SSR (server-side code)
    // This allows onConnect.ts to use require('api-ape')
    ssr: {
        external: ['api-ape']
    }
})
