import { defineConfig } from "vite"


export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'QiscusSDK',
      fileName: 'qiscus-sdk-javascript',
      formats: ['cjs', 'es', 'umd'],
    },
    outDir: './dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      mqtt: 'mqtt/dist/mqtt.js',
    }
  }
})
