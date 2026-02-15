import { defineConfig } from 'vite';

/**
 * Tactical Map Vite config
 *
 * Notes:
 * - `root: 'src'` keeps the Vite entrypoint at `src/index.html` per the spec.
 * - `base: '/map/'` allows the built bundle to be served from the dashboard route:
 *   http://192.168.225.149:7001/map
 */
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  return {
    root: 'src',
    base: '/map/',
    publicDir: '../assets',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      sourcemap: true
    },
    plugins: [
      {
        name: 'tactical-map-route-rewrite',
        configureServer(server) {
          // Serve the app from /map in dev as well.
          server.middlewares.use((req, _res, next) => {
            if (req.url === '/map' || req.url === '/map/') req.url = '/';
            next();
          });
        }
      }
    ],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        // Forward API calls to the dashboard server in dev.
        '/api': {
          target: 'http://192.168.225.149:7001',
          changeOrigin: true,
          secure: false
        }
      }
    },
    test: {
      // Vitest: look for tests in the project root (not src/)
      root: '.',
      include: ['tests/**/*.{test,spec}.{ts,tsx,js,jsx}'],
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
