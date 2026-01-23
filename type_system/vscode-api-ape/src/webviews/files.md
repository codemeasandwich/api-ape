# Webviews

Frontend components for the gamified learning hub sidebar.

## Directory Structure

```
webviews/
├── GamifiedHubProvider.js  # Webview provider managing hub state and communication
├── hub.template.js         # HTML template for the webview
├── hub.js                  # Frontend JavaScript for UI interactions
├── hub.css                 # Styles for the learning hub interface
└── badgeSvgs.js            # Inline SVG content for badge icons with animation classes
```

## Files

### `GamifiedHubProvider.js`

VS Code WebviewViewProvider that manages the learning hub sidebar. Handles message passing between frontend and extension, loads data files.

### `hub.template.js`

HTML template generator for the webview. Returns the full HTML document with CSP headers and script loading.

### `hub.js`

Frontend JavaScript running inside the webview. Handles UI events, renders state updates, and communicates with the extension via postMessage.

### `hub.css`

Styles for the learning hub interface including level cards, quest panels, skill trees, endpoint browser, and modals.

### `badgeSvgs.js`

Inline SVG content for badge icons with CSS animation classes for itshover.com style hover effects. Loaded as a separate script before hub.js to provide the `badgeSvgs` global object.
