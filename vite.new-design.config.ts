import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'new-design'),
  base: './',
  plugins: [react(), { name: 'new-design-entry', configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.split('?')[0] === '/') req.url = '/index.source.html' + req.url.slice(1);
      next();
    });
  } }],
  build: {
    outDir: resolve(import.meta.dirname, 'dist-new-design'), emptyOutDir: true,
    rolldownOptions: { input: resolve(import.meta.dirname, 'new-design/index.source.html') },
  },
});
