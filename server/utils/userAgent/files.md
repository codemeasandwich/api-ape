# User-Agent Patterns Module Files

This module contains all the pattern definitions used by `parseUserAgent.js` to identify browsers, operating systems, devices, CPU architectures, and bots from User-Agent strings.

## Guidelines

- **Pattern priority** — Add more specific patterns **before** more general ones (e.g., AI bots before generic crawlers)
- **Non-capturing groups** — Use `(?:...)` for performance when you don't need to capture
- **Version capture** — Include version capture groups `([\d.]*)` where appropriate
- **Test thoroughly** — Test new patterns against real User-Agent strings before adding
- **Bot detection** — New AI bots and crawlers should be added to `BOT_PATTERNS` and relevant browser patterns
- **No external dependencies** — All patterns must be pure JavaScript RegExp

## Directory Structure

```
userAgent/
└── patterns.js   # Browser/OS/device detection patterns
```

## Files

### `patterns.js`

Contains regular expression patterns and lookup tables organized by category:

| Export | Description |
|--------|-------------|
| `BROWSERS` | Browser detection patterns (ordered by priority) |
| `OS_PATTERNS` | Operating system patterns with version mapping |
| `ENGINES` | Rendering engine patterns (Blink, Gecko, WebKit) |
| `DEVICE_PATTERNS` | Device type patterns (mobile, tablet, console, etc.) |
| `DEVICE_VENDORS` | Device manufacturer patterns (Apple, Samsung, etc.) |
| `CPU_PATTERNS` | CPU architecture patterns (arm64, amd64, etc.) |
| `BOT_PATTERNS` | Bot/crawler detection patterns |
| `MODEL_PATTERNS` | Device model extraction patterns |

**Pattern Priority Order:**

1. AI bots (ChatGPT, Claude, Perplexity)
2. Search crawlers (Googlebot, Bingbot)
3. CLI tools (curl, wget)
4. Headless browsers (HeadlessChrome, Puppeteer)
5. Social media in-app browsers (Facebook, Instagram)
6. Alternative browsers (Edge, Opera, Brave, Vivaldi)
7. Major browsers (Chrome, Firefox, Safari)