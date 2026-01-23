# Webviews

Frontend components for the gamified learning hub sidebar.

## Directory Structure

```
webviews/
├── files.md                # This file
├── GamifiedHubProvider.js  # Webview provider managing hub state and communication
├── ToolsProvider.js        # Webview provider for the Tools panel
├── badgeSvgs.js            # Inline SVG content for badge icons with animation classes
├── hub.css                 # Styles for the learning hub interface
├── hub.js                  # Frontend JavaScript for UI interactions
├── hub.template.js         # HTML template for the webview
├── tools.css               # Styles for the Tools panel
├── tools.js                # Frontend JavaScript for Tools panel
└── tools.template.js       # HTML template for Tools panel
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

### `ToolsProvider.js`

VS Code WebviewViewProvider for the Tools panel in the Activity Bar. Provides quick access to common api-ape operations like refreshing schema, generating types, and checking server status.

### `tools.css`

Styles for the Tools panel interface including action buttons, status indicators, and settings displays.

### `tools.js`

Frontend JavaScript for the Tools panel webview. Handles button clicks, displays status, and communicates with the extension via postMessage.

### `tools.template.js`

HTML template generator for the Tools panel webview. Returns the full HTML document with CSP headers.
