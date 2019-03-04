const path = require('path')

module.exports = (env) => {
  const config = {
    entry: ['@babel/polyfill', path.join(__dirname, 'src', 'index.js')],
    devtool: env.production ? 'source-map' : 'eval',
    mode: env.production ? 'production' : 'development',
    output: {
      path: path.join(__dirname, 'dist'),
      filename: env.production ? 'qiscus-sdk-core.min.js' : 'qiscus-sdk-core.js',
      library: 'QiscusSDKCore',
      libraryTarget: 'umd',
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
    }
  }
  return config
}
