import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['leaflet', 'react-leaflet', '@vis.gl/react-google-maps', 'maplibre-gl'],
  },
  server: {
    watch: {
      ignored: ['**/android/**', '**/ios/**', '**/node_modules/**'],
    },
  },
});
