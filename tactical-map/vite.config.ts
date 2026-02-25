import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Tactical Map Vite config
 *
 * Notes:
 * - `root: 'src'` keeps the Vite entrypoint at `src/index.html` per the spec.
 * - `base: '/map/'` allows the built bundle to be served from the dashboard route:
 *   http://127.0.0.1:8001/map
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    root: 'src',
    base: '/map/',
    publicDir: '../assets',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      sourcemap: true
    },
    plugins: [],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        // Forward API calls to the dashboard server in dev.
        '/api': {
          target: process.env.TACTICAL_MAP_API_PROXY_TARGET ?? 'http://127.0.0.1:8001',
          changeOrigin: true,
          secure: false
        }
      }
    },
    test: {
      // Vitest: look for tests in the project root (not src/)
      root: '.',
      include: ['tests/{unit,integration}/**/*.{test,spec}.{ts,tsx,js,jsx}'],
      globals: true,
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.ts'],
        exclude: ['src/main.ts']
      }
    },
    define: {
      __DEV__: JSON.stringify(isDev)
    }
  };
});
