var webpack        = require('webpack');
var path           = require('path');
var libraryName    = 'QiscusSDKCore';
// var UglifyJsPlugin = webpack.optimize.UglifyJsPlugin;
var env            = process.env.WEBPACK_ENV;
var plugins        = [], outputFile;
const MinifyPlugin = require("babel-minify-webpack-plugin");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

if (env === 'build') {
  // plugins.push(new UglifyJsPlugin({ minimize: true }));
  plugins.push(new MinifyPlugin({}, {comments: false}));
  plugins.push(new BundleAnalyzerPlugin());
  outputFile = libraryName + '.min.js';
} else {
  plugins.push(new BundleAnalyzerPlugin());
  outputFile = libraryName + '.js';
};

var config = {
  entry: ['babel-polyfill', __dirname + '/index.js'],
  devtool: 'source-map',
  output: {
    path: __dirname + '/dist',
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    loaders: [
      {
        test: /(\.jsx|\.js)$/,
        loader: 'babel-loader',
        query: {
          presets: ["env"]
        },
        exclude: /(node_modules|bower_components)/
      },
      {
        test: /(\.jsx|\.js)$/,
        loader: "eslint-loader",
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  plugins: plugins
};

module.exports = config;