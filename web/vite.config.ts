import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, le frontend (port 5173) et l'API (port 3000) sont séparés :
    // Vite transmet les appels /api à l'API, pour rester sur la même origine qu'en production.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
