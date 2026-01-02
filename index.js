
let apiApe;

if ('undefined' === typeof window
  || 'undefined' === typeof window.document) {
  apiApe = require('./server');
} else {
  apiApe = require('./client');
}

module.exports = apiApe
