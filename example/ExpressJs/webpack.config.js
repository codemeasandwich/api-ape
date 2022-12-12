const path = require('path');

module.exports = {
  entry: './frontend.js',
  devtool: 'source-map',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'public')
  }
};
