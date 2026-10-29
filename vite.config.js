import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ base: process.env.BASE_PATH || '/', plugins: [react(), tailwindcss()], server: {
  host: '127.0.0.1', port: Number(process.env.WEB_PORT || 3001), strictPort: true,
  // Emulator memory belongs to the page. Apply edits only on an explicit refresh.
  hmr: false,
  watch: { ignored: ['**/vendor/**', '**/data/**', '**/test-results/**', '**/.cache/**'] },
  headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
} });
