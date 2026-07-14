import { defineConfig } from 'vite';

// Relative base so the built assets resolve correctly when served from a
// subpath (https://brigsd.github.io/nos/) as well as from the filesystem
// root used by `vite preview` during local QA.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
