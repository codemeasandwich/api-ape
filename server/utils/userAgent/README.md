# User-Agent Patterns Module

## Overview

This module contains all the pattern definitions used by `parseUserAgent.js` to identify browsers, operating systems, devices, CPU architectures, and bots from User-Agent strings.

**Key capabilities:**

- **Browser detection** — Identify 40+ browsers with version extraction (ordered by priority)
- **OS detection** — Operating system patterns with version mapping
- **Engine detection** — Rendering engine patterns (Blink, Gecko, WebKit)
- **Device classification** — Device type patterns (mobile, tablet, console, smarttv, wearable)
- **Vendor identification** — Device manufacturer patterns (Apple, Samsung, etc.)
- **CPU architecture** — Architecture patterns (arm64, amd64, ia32)
- **Bot detection** — AI bots, crawlers, and headless browser patterns
- **Model extraction** — Device model patterns for specific identification

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Pattern Priority

Browser patterns are ordered from **most specific to least specific**:

1. AI bots (ChatGPT, Claude, Perplexity)
2. Search crawlers (Googlebot, Bingbot)
3. CLI tools (curl, wget)
4. Headless browsers (HeadlessChrome, Puppeteer)
5. Social media in-app browsers (Facebook, Instagram)
6. Alternative browsers (Edge, Opera, Brave, Vivaldi)
7. Major browsers (Chrome, Firefox, Safari)

This ensures specialized browsers are detected before falling back to generic patterns.

## Usage

```js
const { BROWSERS, BOT_PATTERNS } = require('./patterns')

// Check if UA is a bot
const ua = 'Googlebot/2.1 (+http://www.google.com/bot.html)'
const isBot = BOT_PATTERNS.some(pattern => pattern.test(ua))

// Find browser match
for (const { name, pattern } of BROWSERS) {
  const match = ua.match(pattern)
  if (match) {
    console.log(name, match[1])  // 'Googlebot', '2.1'
    break
  }
}
```

## Adding New Patterns

When adding new patterns:

1. Add more specific patterns **before** more general ones
2. Use non-capturing groups `(?:...)` for performance
3. Include version capture groups `([\d.]*)` where appropriate
4. Test against real User-Agent strings

## See Also

- [`../parseUserAgent.js`](../parseUserAgent.js) — Parser using these patterns
- [`../../lib/wiring.js`](../../lib/wiring.js) — Uses parsed User-Agent for client info