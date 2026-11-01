import { defineConfig } from 'vite';

export default defineConfig({
  // In development the API runs in `wrangler dev` (port 8788); in production the same Worker serves both.
  server: { proxy: { '/api': 'http://localhost:8788' } },
  build: {
    outDir: 'dist',
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep the engine in its own file so game updates do not re-download it.
        manualChunks(id: string): string | undefined {
          return id.includes('node_modules/three') ? 'three' : undefined;
        },
      },
    },
  },
});
