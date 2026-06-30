import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// Two build targets, switched by env (see package.json build scripts):
//   BUILD=dist  -> bundled UMD for browsers, all deps inlined  -> dist/
//   BUILD=lib   -> per-file CommonJS, deps left external        -> lib/
// MINIFY=true selects the minified dist output (.min.js).
const BUILD = process.env.BUILD || 'dist'
const MINIFY = process.env.MINIFY === 'true'

const ENTRY = 'src/index.js'

// Keep every bare import (superagent, mqtt, date-fns/format, ...) external for
// the non-bundled lib build, while relative/absolute ids are emitted per-file.
const isAbsolute = (id) => id.startsWith('/') || /^[A-Za-z]:[\\/]/.test(id)
const externalForLib = (id) => {
  // The entry and any relative/absolute (in-project) module is internal;
  // every bare package specifier (superagent, mqtt, date-fns/format, ...)
  // stays external so lib/ keeps require() calls instead of bundling deps.
  if (id === ENTRY) return false
  // Keep `require("../package.json")` external (matches old babel output)
  // instead of emitting an extra lib/package.json.js module.
  if (/(^|[\\/])package\.json$/.test(id)) return true
  if (id.startsWith('.') || isAbsolute(id)) return false
  return true
}

const libConfig = {
  build: {
    target: 'es2015',
    outDir: 'lib',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: ENTRY,
      external: externalForLib,
      // Required alongside preserveModules (Vite defaults this to false for apps).
      preserveEntrySignatures: 'strict',
      output: {
        format: 'cjs',
        dir: 'lib',
        exports: 'auto', // entry (default-only) -> module.exports = class
        preserveModules: true,
        preserveModulesRoot: 'src', // src/index.js -> lib/index.js, src/lib/** -> lib/lib/**
        entryFileNames: '[name].js',
      },
    },
  },
}

const distConfig = {
  // Parity with the old webpack DefinePlugin: stop superagent's formidable dep
  // from trying to require the optional `gently` package in the browser bundle.
  define: { 'global.GENTLY': 'false' },
  // Prefer browser builds of mqtt / superagent (matches webpack target: web).
  resolve: { mainFields: ['browser', 'module', 'jsnext:main', 'main'] },
  plugins: [
    nodePolyfills({
      // mqtt/superagent expect Node globals + builtins in the browser; webpack 4
      // injected these automatically, so we replicate that here.
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  build: {
    target: 'es2015',
    outDir: 'dist',
    emptyOutDir: false,
    minify: MINIFY ? 'esbuild' : false,
    sourcemap: true,
    lib: {
      entry: ENTRY,
      formats: ['umd'],
      name: 'QiscusSDKCore',
      fileName: () => (MINIFY ? 'qiscus-sdk-core.min.js' : 'qiscus-sdk-core.js'),
    },
    rollupOptions: {
      output: {
        // Global `QiscusSDKCore` is the class itself (old libraryExport: 'default'),
        // and the named AMD module id matches the old umdNamedDefine.
        exports: 'default',
        amd: { id: 'QiscusSDKCore' },
      },
    },
  },
}

export default defineConfig(BUILD === 'lib' ? libConfig : distConfig)
