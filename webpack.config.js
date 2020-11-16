const path = require('path')
const webpack = require('webpack')
const forkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')
const pkg = require('./package')

module.exports = (env) => {
  const filename = env.production
    ? 'qiscus-sdk-javascript.{module}.min.js'
    : 'qiscus-sdk-javascript.{module}.js'
  const baseConfig = {
    entry: [path.join(__dirname, 'src', 'index.ts')],
    // devtool: env.production ? 'source-map' : 'cheap-module-eval-source-map',
    devtool: 'source-map',
    mode: env.production ? 'production' : 'development',
    stats: 'errors-only',
    target: env.target || 'web',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: filename.replace('{module}', 'umd'),
      library: 'QiscusSDK',
      libraryTarget: 'umd',
      libraryExport: 'default',
      umdNamedDefine: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          use: 'babel-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.ts$/,
          use: [
            { loader: 'babel-loader' },
            // {
            //   loader: 'ts-loader', options: {
            //     transpileOnly: true,
            //   },
            // },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      modules: ['node_modules', 'src'],
      extensions: ['.ts', '.js'],
    },
    plugins: [
      new webpack.DefinePlugin({
        'global.GENTLY': false,
        'process.env.VERSION': JSON.stringify(pkg.version),
      }),
      new forkTsCheckerWebpackPlugin(),
    ],
    performance: {
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },
  }

  const cjsConfig = {
    ...baseConfig,
    output: {
      ...baseConfig.output,
      libraryTarget: 'commonjs2',
      filename: filename.replace('{module}', 'cjs'),
    },
  }

  // return [baseConfig, cjsConfig]
  return baseConfig
}
