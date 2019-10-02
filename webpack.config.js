const path = require('path')
const webpack = require('webpack')
const pkg = require('./package')

module.exports = env => {
  const filename = env.production
    ? 'qiscus-sdk-javascript.{module}.min.js'
    : 'qiscus-sdk-javascript.{module}.js'
  const baseConfig = {
    entry: [path.join(__dirname, 'src', 'main.ts')],
    // devtool: env.production ? 'source-map' : 'cheap-module-eval-source-map',
    devtool: 'source-map',
    mode: env.production ? 'production' : 'development',
    stats: 'errors-only',
    target: env.target || 'web',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: filename.replace('{module}', 'umd'),
      library: 'QiscusSDKCore',
      libraryTarget: 'umd',
      libraryExport: 'default',
      umdNamedDefine: true
    },
    module: {
      rules: [{
        test: /\.js$/,
        use: 'babel-loader',
        exclude: /(node_modules|bower_components)/
      }, {
        test: /\.tsx?$/,
        use: 'babel-loader',
        exclude: /(node_modules|bower_components)/
      }]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js']
    },
    plugins: [
      new webpack.DefinePlugin({
        'global.GENTLY': false,
        'process.env.VERSION': JSON.stringify(pkg.version)
      })
    ],
    performance: {
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    }
  }

  const cjsConfig = {
    ...baseConfig,
    output: {
      ...baseConfig.output,
      libraryTarget: 'commonjs2',
      filename: filename.replace('{module}', 'cjs')
    }
  }

  return [baseConfig, cjsConfig]
}
