const path = require('path')
const webpack = require('webpack')

module.exports = (env) => {
  const filename = env.production
    ? 'qiscus-sdk-core.min.js'
    : 'qiscus-sdk-core.js'
  return {
    // entry: ['@babel/polyfill', path.join(__dirname, 'src', 'index.js')],
    entry: [path.join(__dirname, 'src', 'index.js')],
    devtool: env.production ? 'source-map' : 'cheap-module-eval-source-map',
    mode: env.production ? 'production' : 'development',
    target: env.target || 'web',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: filename,
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
      }]
    },
    resolve: {
      extensions: ['.js']
    },
    plugins: [
      new webpack.DefinePlugin({ 'global.GENTLY': false })
    ],
    performance: {
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    }
  }
}
