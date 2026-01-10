# File Transfer Module

## Overview

The fileTransfer module handles binary data transfers between clients and the server. It enables api-ape to seamlessly transmit files, images, and other binary content alongside JSON messages through a tag-based system that automatically coordinates HTTP uploads and downloads.

**Key capabilities:**

- **Tagged binary fields** — Mark message fields with `<!B>` or `<!A>` to indicate pending binary uploads
- **Streaming transfers** — Client-to-client file streaming without storing complete files in memory
- **Download links** — Server can return `<!L>` tags that clients automatically fetch
- **Session verification** — All transfers are authenticated against the client's session
- **Timeout management** — Configurable timeouts for upload start and completion
- **Progress tracking** — Track streaming transfer progress with partial reads

The module works transparently—controllers receive and return regular Buffers while the framework handles the HTTP upload/download coordination behind the scenes.

> **Contributing?** See [`files.md`](./files.md) for directory structure and file descriptions.

## Tag System

Messages can include special tags to handle binary data:

| Tag | Direction | Description |
|-----|-----------|-------------|
| `<!B>` | Client → Server | Client will upload a Buffer via HTTP PUT |
| `<!A>` | Client → Server | Client will upload an ArrayBuffer via HTTP PUT |
| `<!F>` | Client → Server | Client-to-client streaming file transfer |
| `<!L>` | Server → Client | Server returns download link for client to fetch |

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                    Binary Upload Flow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Client sends: { "image<!B>": "hash123", name: "photo.jpg" }  │
│  2. Server holds message, waits for binary upload                │
│  3. Client uploads binary via PUT /api/ape/data/qid/hash123      │
│  4. Server injects Buffer into message: { image: <Buffer>, ... } │
│  5. Controller receives complete message with binary data        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   Binary Download Flow                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Controller returns: { image: <Buffer>, name: "photo.jpg" }   │
│  2. Server replaces Buffer with link: { "image<!L>": "hash456" } │
│  3. Client receives message, detects <!L> tag                    │
│  4. Client fetches binary via GET /api/ape/data/hash456          │
│  5. Client receives: { image: <ArrayBuffer>, name: "photo.jpg" } │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## See Also

- [`../fileTransfer.js`](../fileTransfer.js) — Main file transfer manager
- [`../../socket/tagUtils.js`](../../socket/tagUtils.js) — Tag parsing utilities
- [`../../socket/receive.js`](../../socket/receive.js) — Message handler with upload coordination