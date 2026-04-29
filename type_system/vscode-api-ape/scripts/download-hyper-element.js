#!/usr/bin/env node
/**
 * Download hyper-element bundle from jsDelivr CDN
 * This bundle includes both hyperHTML and hyper-element
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CDN_URL = 'https://cdn.jsdelivr.net/npm/hyper-element@latest/build/hyperElement.min.js';
const OUTPUT_PATH = path.join(__dirname, '../src/webviews/lib/hyperElement.min.js');

function download() {
  return new Promise((resolve, reject) => {
    console.log('Downloading hyper-element bundle...');

    const request = (url) => {
      https.get(url, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          return request(res.headers.location);
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: Failed to download`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          fs.writeFileSync(OUTPUT_PATH, data);
          console.log(`  Saved hyperElement.min.js (${data.length} bytes)`);
          resolve();
        });
      }).on('error', reject);
    };

    request(CDN_URL);
  });
}

download().catch(err => {
  console.error(`  Failed: ${err.message}`);
  process.exit(1);
});
