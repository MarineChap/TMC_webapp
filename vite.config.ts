import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.', // Serve from current directory where index.html is
    build: {
        outDir: 'dist/client',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            }
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8001', // Proxy API calls to Express backend
            '/assets': 'http://localhost:8001', // Proxy assets to backend if needed
            '/data': 'http://localhost:8001',   // Proxy db.json to backend
        }
    }
});
