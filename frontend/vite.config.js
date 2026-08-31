import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/customers/old-lookup': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/global-lookup': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/agent-lookup': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/new-generate-code': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/new-register': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/old-update': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});

// trigger restart
// trigger restart 2
