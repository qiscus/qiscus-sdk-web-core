const path = require('path')
const builtinsMod = require('builtin-modules')
const builtins = require('rollup-plugin-node-builtins')
const babel = require('rollup-plugin-babel')
const typescript = require('rollup-plugin-typescript')
const json = require('rollup-plugin-json')
const replace = require('rollup-plugin-replace')
const commonjs = require('rollup-plugin-commonjs')
const nodeResolve = require('rollup-plugin-node-resolve')
const uglify = require('rollup-plugin-babel-minify')

const pkg = require('./package.json')

const namedExports = {
  'node_modules/pietile-eventemitter/dist/index.js': ['EventEmitter'],
  'node_modules/process/index.js': ['process', 'nextTick'],
  'node_modules/buffer/index.js': ['isBuffer'],
  // 'node_modules/@babel/runtime/helpers/classCallCheck.js': ['default']
}
const babelOptions = {
  exclude: /node_modules/,
  sourceMaps: true,
  extensions: ['.ts', '.js'],
  runtimeHelpers: true,
}

function isBareModuleId (id) {
  return (
    !id.startsWith('.') && !id.includes(path.join(process.cwd(), 'src'))
  )
}

const cjs = [
  {
    input: 'src/main.ts',
    output: {
      file: pkg.main,
      sourcemap: true,
      format: 'cjs',
      esModule: false,
    },
    external: isBareModuleId,
    plugins: [
      typescript(),
      babel(babelOptions),
      replace({
        'process.env.NODE_ENV': JSON.stringify('development'),
        'process.env.VERSION': JSON.stringify('cjs'),
      }),
    ],
  },
  {
    input: 'src/main.ts',
    output: { file: `cjs/${pkg.name}.min.js`, sourcemap: true, format: 'cjs' },
    external: isBareModuleId,
    plugins: [
      typescript(),
      babel(babelOptions),
      replace({
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.VERSION': JSON.stringify('cjs'),
      }),
      uglify(),
    ],
  },
]

const esm = [
  {
    input: 'src/main.ts',
    output: { file: pkg.module, sourcemap: true, format: 'esm' },
    external: isBareModuleId,
    plugins: [
      typescript(),
      babel({
        ...babelOptions,
        plugins: [['@babel/transform-runtime', { useESModules: true }]],
      }),
      replace({
        'process.env.VERSION': JSON.stringify(pkg.version),
      }),
    ],
  },
]

const umd = [
  {
    input: 'src/main.ts',
    output: {
      file: pkg.browser,
      sourcemap: true,
      sourcemapPathTransform: relativePath =>
        relativePath.replace(/^.*?\/node_modules/, '../../node_modules'),
      format: 'umd',
      name: 'QiscusSDK',
    },
    // external: isBareModuleId,
    // external: builtinsMod,
    external: ['websocket', 'ws', 'bufferutil', 'utf-8-validate'],
    plugins: [
      // globals(),
      typescript(),
      json(),
      babel({
        ...babelOptions,
        plugins: [['@babel/transform-runtime', { useESModules: true }]],
      }),
      nodeResolve({
        preferBuiltins: true,
        // browser: true,
        mainFields: ['module', 'main', 'browser'],
      }),
      commonjs({
        include: /node_modules/,
        namedExports,
      }),
      builtins(),
      replace({
        'process.env.NODE_ENV': JSON.stringify('development'),
        'process.env.VERSION': JSON.stringify(pkg.version),
      }),
    ],
  },
  {
    input: 'src/main.ts',
    output: {
      file: pkg.browser
        .split('.')
        // add `min` to it's name
        .slice(0, -1).concat('min', 'js')
        .join('.'),
      sourcemap: true,
      sourcemapPathTransform: relativePath =>
        relativePath.replace(/^.*?\/node_modules/, '../../node_modules'),
      format: 'umd',
      name: 'QiscusSDK',
    },
    // external: isBareModuleId,
    // external: builtinsMod,
    external: ['websocket', 'ws', 'bufferutil', 'utf-8-validate'],
    plugins: [
      // globals(),
      typescript(),
      json(),
      babel({
        ...babelOptions,
        plugins: [['@babel/transform-runtime', { useESModules: true }]],
      }),
      nodeResolve({
        preferBuiltins: true,
        // browser: true,
        mainFields: ['module', 'main', 'browser'],
      }),
      commonjs({
        include: /node_modules/,
        namedExports,
      }),
      builtins(),
      replace({
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.VERSION': JSON.stringify(pkg.version),
      }),
      uglify(),
    ],
  },
]

let config
switch (process.env.BUILD_ENV) {
  case 'cjs':
    config = cjs
    break
  case 'esm':
    config = esm
    break
  case 'umd':
    config = umd
    break
  default:
    config = cjs.concat(esm).concat(umd)
}

module.exports = config
