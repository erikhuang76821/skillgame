import { defineConfig } from 'vite';

// Two builds:
//   npm run build        -> dist/, hashed asset files (what size-check measures)
//   npm run build:zip    -> dist-zip/index.html, ONE self-contained file (script, styles and every image inlined) that
//                           runs when opened straight from a zip / file:// — the store's upload format (gdd/10).
export default defineConfig(({ mode }) => {
  const zip = mode === 'zip';
  return {
    base: './',
    build: {
      target: 'es2022',          // top-level await in main.js
      outDir: zip ? 'dist-zip' : 'dist',
      assetsInlineLimit: zip ? 100 * 1024 * 1024 : 0,   // zip: inline everything; web: every asset stays a hashed file
      cssCodeSplit: !zip,
      modulePreload: zip ? false : undefined,
      rollupOptions: zip ? { output: { inlineDynamicImports: true } } : undefined,
      reportCompressedSize: true,
      sourcemap: false,
    },
  };
});
