import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',          // top-level await in main.js
    assetsInlineLimit: 0,      // keep every asset a hashed file (cacheable, easy to audit in size-check)
    reportCompressedSize: true,
    sourcemap: false,
  },
});
