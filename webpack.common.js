const path = require('path');
const webpack = require('webpack');
require('dotenv').config();
require('dotenv').config();

module.exports = {
  entry: {
    app: './js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: './js/app.js',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.SQLITE_CONNECTION_STRING': JSON.stringify(process.env.SQLITE_CONNECTION_STRING || null),
    }),
  ],
};
