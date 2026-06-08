import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api → backend en desarrollo, para no lidiar con CORS localmente.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,            // escucha en 0.0.0.0 (accesible desde la LAN / Tailscale)
    allowedHosts: true,    // acepta cualquier Host (IP LAN, *.ts.net, etc.)
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
