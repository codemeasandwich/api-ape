#!/usr/bin/env node
/**
 * Download itshover icons and extract static SVGs for the VS Code extension
 * Properly handles all SVG elements and initial states
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '../media/badges');

// Map of badge icon names to itshover icon names
const iconMap = {
  'hand-heart': 'hand-heart-icon',
  'telephone': 'telephone-icon',
  'typescript': 'typescript-icon',
  'shield-check': 'shield-check-icon',
  'radio': 'radio-icon',
  'volume-2': 'volume-2-icon',
  'arrow-big-up': 'arrow-big-up-icon',
  'plug-connected': 'plug-connected-icon',
  'stack': 'stack-icon',
  'file-description': 'file-description-icon',
  'satellite-dish': 'satellite-dish-icon',
  'party-popper': 'party-popper-icon',
  'link': 'link-icon',
  'layers': 'layers-icon',
  'lock': 'lock-icon',
  'rosette-discount-check': 'rosette-discount-check-icon',
  'hotel': 'hotel-icon',
  'sparkles': 'sparkles-icon',
  'rocket': 'rocket-icon',
  'router': 'router-icon',
  'star': 'star-icon'
};

function fetchJson(iconName) {
  return new Promise((resolve, reject) => {
    const url = `https://itshover.com/r/${iconName}.json`;

    const request = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          return request(res.headers.location);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON for ${iconName} (status ${res.statusCode}): ${e.message}\nResponse: ${data.substring(0, 200)}`));
          }
        });
      }).on('error', reject);
    };

    request(url);
  });
}

function extractSvgFromTsx(tsxContent) {
  const elements = [];

  // Match all motion.* SVG elements (path, line, circle, rect, polyline, polygon, ellipse, g)
  // Handle both self-closing /> and elements with children
  const elementTypes = ['path', 'line', 'circle', 'rect', 'polyline', 'polygon', 'ellipse'];

  for (const type of elementTypes) {
    // Match self-closing elements: <motion.path ... />
    const selfClosingRegex = new RegExp(`<motion\\.${type}\\s+([^>]*?)\\s*/>`, 'gs');
    let match;

    while ((match = selfClosingRegex.exec(tsxContent)) !== null) {
      const attrs = match[1];
      const element = parseElement(type, attrs);
      if (element) elements.push(element);
    }

    // Match elements with closing tags: <motion.path ...>...</motion.path>
    const closingRegex = new RegExp(`<motion\\.${type}\\s+([^>]*?)>([\\s\\S]*?)</motion\\.${type}>`, 'gs');
    while ((match = closingRegex.exec(tsxContent)) !== null) {
      const attrs = match[1];
      const element = parseElement(type, attrs);
      if (element) elements.push(element);
    }
  }

  // Also check for motion.g groups with nested elements
  const groupRegex = /<motion\.g\s+([^>]*?)>([\s\S]*?)<\/motion\.g>/gs;
  let groupMatch;
  while ((groupMatch = groupRegex.exec(tsxContent)) !== null) {
    const groupAttrs = groupMatch[1];
    const groupContent = groupMatch[2];

    // Check if group has initial opacity 0 - skip it
    if (groupAttrs.includes('opacity: 0') || groupAttrs.includes('opacity:0')) continue;

    // Extract nested paths from the group
    for (const type of elementTypes) {
      const nestedRegex = new RegExp(`<motion\\.${type}\\s+([^>]*?)\\s*/>`, 'gs');
      let nestedMatch;
      while ((nestedMatch = nestedRegex.exec(groupContent)) !== null) {
        const element = parseElement(type, nestedMatch[1]);
        if (element) elements.push(element);
      }
    }
  }

  if (elements.length === 0) {
    return null;
  }

  // Build clean SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${elements.join('\n')}
</svg>`;

  return svg;
}

function parseElement(type, attrs) {
  // Skip elements with stroke="none" (invisible masks)
  if (attrs.includes('stroke="none"')) return null;

  // Skip elements with initial opacity 0 (hidden until animated)
  if (attrs.includes('opacity: 0') || attrs.includes('opacity:0')) return null;
  if (attrs.includes('pathLength: 0') || attrs.includes('pathLength:0')) return null;

  // Extract relevant SVG attributes
  const svgAttrs = [];

  // Common attributes to extract
  const attrPatterns = [
    { name: 'd', regex: /d="([^"]+)"/ },
    { name: 'x1', regex: /x1="([^"]+)"/ },
    { name: 'y1', regex: /y1="([^"]+)"/ },
    { name: 'x2', regex: /x2="([^"]+)"/ },
    { name: 'y2', regex: /y2="([^"]+)"/ },
    { name: 'cx', regex: /cx="([^"]+)"/ },
    { name: 'cy', regex: /cy="([^"]+)"/ },
    { name: 'r', regex: /r="([^"]+)"/ },
    { name: 'rx', regex: /rx="([^"]+)"/ },
    { name: 'ry', regex: /ry="([^"]+)"/ },
    { name: 'x', regex: /x="([^"]+)"/ },
    { name: 'y', regex: /y="([^"]+)"/ },
    { name: 'width', regex: /width="([^"]+)"/ },
    { name: 'height', regex: /height="([^"]+)"/ },
    { name: 'points', regex: /points="([^"]+)"/ },
    { name: 'fill', regex: /fill="([^"]+)"/ },
    { name: 'stroke', regex: /stroke="([^"]+)"/ },
    { name: 'stroke-width', regex: /strokeWidth="([^"]+)"/ },
  ];

  for (const { name, regex } of attrPatterns) {
    const match = attrs.match(regex);
    if (match) {
      // Skip fill="none" as it's inherited
      if (name === 'fill' && match[1] === 'none') continue;
      // Skip stroke="currentColor" as it's inherited
      if (name === 'stroke' && match[1] === 'currentColor') continue;
      svgAttrs.push(`${name}="${match[1]}"`);
    }
  }

  // For path elements, d is required
  if (type === 'path' && !attrs.match(/d="([^"]+)"/)) return null;

  // For line elements, coordinates are required
  if (type === 'line' && (!attrs.match(/x1="/) || !attrs.match(/y1="/))) return null;

  // For circle elements, cx, cy, r are required
  if (type === 'circle' && (!attrs.match(/cx="/) || !attrs.match(/cy="/) || !attrs.match(/r="/))) return null;

  if (svgAttrs.length === 0) return null;

  return `  <${type} ${svgAttrs.join(' ')}/>`;
}

async function downloadIcon(localName, itshoverName) {
  try {
    console.log(`Downloading ${itshoverName}...`);
    const json = await fetchJson(itshoverName);

    const iconFile = json.files.find(f => f.path.endsWith('.tsx') && !f.path.includes('types'));
    if (!iconFile) {
      throw new Error(`No TSX file found for ${itshoverName}`);
    }

    const svg = extractSvgFromTsx(iconFile.content);
    if (!svg) {
      throw new Error(`Failed to extract SVG elements from ${itshoverName}`);
    }

    const outputPath = path.join(ICONS_DIR, `${localName}.svg`);
    fs.writeFileSync(outputPath, svg);
    console.log(`  ✓ Saved ${localName}.svg`);
  } catch (error) {
    console.error(`  ✗ Failed to download ${itshoverName}: ${error.message}`);
  }
}

async function main() {
  console.log('Downloading itshover icons...\n');

  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  for (const [localName, itshoverName] of Object.entries(iconMap)) {
    await downloadIcon(localName, itshoverName);
  }

  console.log('\nDone!');
}

main().catch(console.error);
