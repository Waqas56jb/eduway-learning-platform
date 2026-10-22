import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 4174 },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          charts: ['recharts'],
          table: ['@tanstack/react-table'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
          i18n: ['i18next', 'react-i18next'],
          katex: ['katex'],
          phone: ['libphonenumber-js/max', 'libphonenumber-js/mobile/examples'],
        },
      },
    },
  },
});
