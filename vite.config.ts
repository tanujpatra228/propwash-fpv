import { defineConfig } from 'vite';

export default defineConfig({
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
