import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';
import fs from 'fs';

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, './src/manifest.json'), 'utf-8')
);

const targetBrowser = process.env.TARGET_BROWSER;
const outDir = targetBrowser === 'chrome' ? 'dist/chrome' : targetBrowser === 'firefox' ? 'dist/firefox' : 'dist';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    outDir,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envPrefix: ['VITE_', 'GEMINI_', 'GROQ_', 'GROK_'],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
