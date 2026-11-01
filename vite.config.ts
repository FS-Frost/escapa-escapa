import { defineConfig } from 'vite';
import { pwa } from './scripts/pwa-plugin';

// Relative base so the build works under the GitHub Pages sub-path (/escapa-escapa/).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [pwa()],
});
