import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function copyPublicAssetsSafely(): Plugin {
  return {
    name: 'copy-public-assets-safely',
    apply: 'build',
    closeBundle() {
      const publicDir = path.resolve(process.cwd(), 'public');
      const outDir = path.resolve(process.cwd(), 'dist');
      if (!fs.existsSync(publicDir)) return;
      fs.mkdirSync(outDir, { recursive: true });
      fs.cpSync(publicDir, outDir, {
        recursive: true,
        force: true,
        filter: (src) => {
          const rel = path.relative(publicDir, src).replace(/\\/g, '/');
          if (!rel) return true;
          const lower = rel.toLowerCase();
          if (lower.endsWith('.mov') || lower.endsWith('.zip') || lower.endsWith('.patch')) {
            return false;
          }
          if (lower.startsWith('assets/aistudio/screenshot_') || lower.startsWith('assets/aistudio/screen_recording_') || lower.startsWith('assets/aistudio/inspect_')) {
            return false;
          }
          return true;
        },
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), copyPublicAssetsSafely()],
  build: {
    copyPublicDir: false,
    chunkSizeWarningLimit: 7000,
  },
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
