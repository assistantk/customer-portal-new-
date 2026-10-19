import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const tessAssets = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ...[
    'tesseract-core.wasm.js',
    'tesseract-core.wasm',
    'tesseract-core-simd.wasm.js',
    'tesseract-core-simd.wasm',
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-lstm.wasm',
    'tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm',
  ].map((name) => [`tesseract.js-core/${name}`, name]),
].map(([source, name]) => ({
  name,
  path: path.resolve(frontendRoot, 'node_modules', source),
}));

const localTesseractAssets = {
  name: 'local-tesseract-assets',
  configureServer(server) {
    server.middlewares.use('/tesseract-assets', (req, res, next) => {
      const asset = tessAssets.find(({ name }) => name === req.url?.slice(1));
      if (!asset) return next();
      res.setHeader('Content-Type', asset.name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      createReadStream(asset.path).on('error', next).pipe(res);
    });
  },
  generateBundle() {
    for (const asset of tessAssets) {
      this.emitFile({
        type: 'asset',
        fileName: `tesseract-assets/${asset.name}`,
        source: readFileSync(asset.path),
      });
    }
  },
};

export default defineConfig({
  plugins: [react(), localTesseractAssets],
  server: {
    proxy: {
      '/api/customers/old-lookup': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/gstin-lookup': {
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
      '/api/customers/ownership-lookup': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/ownership-save': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/ownership-submit': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/ownership-party-lookup': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/customers/ownership-party-save': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api/auth': {
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
