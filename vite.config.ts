import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRÍTICO: Permite que la app funcione en cualquier ruta (relative path)
  build: {
    outDir: 'dist',
  }
});