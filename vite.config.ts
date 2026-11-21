import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    entries: ['index.html'],
    exclude: ['lucide-react'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: false,
    ws: false,
    watch: {
      ignored: [
        '**/.browsers/**',
        '**/jdk-21/**',
        '**/_GOLDEN_*/**',
        '**/_checkpoint_*/**',
        '**/_backup_*/**',
        '**/_phase2_*/**',
        '**/result_workspace/**',
        '**/tests/**',
        '**/live_index.*',
      ],
    },
  },
});
