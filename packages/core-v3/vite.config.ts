import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    deps: {
      inline: [
        'tinyspy',
        'tinypool',
        'tinybench',
        'local-pkg',
        'acorn',
        'acorn-walk',
        'strip-literal',
        'source-map',
      ],
    },
  },
})
