const path = require('path')
const webpack = require('webpack')

module.exports = (env) => {
  const config = {
    // entry: ['@babel/polyfill', path.join(__dirname, 'src', 'index.js')],
    entry: [path.join(__dirname, 'src', 'index.js')],
    // devtool: env.production ? 'source-map' : 'cheap-eval-source-map',
    devtool: env.production ? 'source-map' : false,
    mode: env.production ? 'production' : 'development',
    target: env.target || 'web',
    output: ((target) => {
      if (target === 'web') {
        return {
          path: path.join(__dirname, 'dist'),
          filename: 'qiscus-sdk-core.min.js',
          library: 'QiscusSDKCore',
          libraryTarget: 'umd',
          libraryExport: 'default',
          umdNamedDefine: true
        }
      }
      if (target === 'node') {
        return {
          path: path.join(__dirname, 'dist'),
          filename: 'qiscus-sdk-core.node.js',
          library: 'QiscusSDKCore',
          libraryTarget: 'umd',
          libraryExport: 'default',
          umdNamedDefine: true
        }
      }
    })(env.target),
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
    ]
  }
  return config
}
