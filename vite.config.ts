import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mediaProxy = {
  target: 'http://127.0.0.1:8765',
  changeOrigin: false,
};

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
    proxy: {
      '/api': mediaProxy,
      '/play': mediaProxy,
      '/stream': mediaProxy,
      '/subtitle': mediaProxy,
      '/art': mediaProxy,
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
