# File Transfer Module Files

This module handles binary data transfers between clients and the server. It enables api-ape to seamlessly transmit files, images, and other binary content alongside JSON messages through a tag-based system that automatically coordinates HTTP uploads and downloads.

## Guidelines

- **Tag system consistency** — Use the established tags (`<!B>`, `<!A>`, `<!L>`, `<!F>`); don't invent new ones without updating all consumers
- **Session verification** — All transfers must authenticate against the client's session; never allow unauthenticated binary access
- **Timeout handling** — Always set timeouts for pending uploads; clean up resources when timeouts expire
- **Memory management** — Streaming transfers should not load entire files into memory; use chunked processing
- **Coordinate with socket module** — Binary tag detection happens in `socket/tagUtils.js`; upload injection in `socket/receive.js`

## Directory Structure

```
fileTransfer/
└── streaming.js   # Client-to-client file streaming manager
```

## Files

### `streaming.js`

The `StreamingFileManager` class handles streaming file transfers between clients:

- **Chunked uploads** — Data arrives in pieces and is accumulated in memory
- **Partial reads** — Downloaders can read data as it arrives (progressive download)
- **Completion tracking** — Know when the full file has been received
- **Automatic cleanup** — Files are removed after configurable timeouts
- **Transfer coordination** — Manages the handoff between uploader and downloader clients