import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages sub-path (/escapa-escapa/).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
