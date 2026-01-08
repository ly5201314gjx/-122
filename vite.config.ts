import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Vercel deployment will allow access to API_KEY via process.env during build
      // This replaces process.env.API_KEY in your code with the actual string value
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    }
  };
});