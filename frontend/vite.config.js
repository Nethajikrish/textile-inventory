import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production build is served by Apache from htdocs/textile-inventory/; dev server stays at /.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/textile-inventory/' : '/',
  server: { port: 5173 },
}));
