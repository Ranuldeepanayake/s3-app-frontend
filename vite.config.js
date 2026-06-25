import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const uiPort = Number(env.VITE_UI_PORT || process.env.VITE_UI_PORT || 3300);
  const apiTarget = env.VITE_API_TARGET || process.env.VITE_API_TARGET || 'http://localhost:3100';

  console.info('[VITE-STARTUP]', 'Loaded Vite config', {
    mode,
    uiPort,
    apiTarget
  });

  return {
    plugins: [react()],
    server: {
      port: uiPort,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  };
});
