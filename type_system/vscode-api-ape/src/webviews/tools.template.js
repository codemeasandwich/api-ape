/**
 * @fileoverview HTML template for the Tools webview
 */

/**
 * Generate the HTML content for the tools webview
 * @param {object} params - Template parameters
 * @param {string} params.cssUri - URI for the CSS file
 * @param {string} params.jsUri - URI for the JavaScript file
 * @param {string} params.cspSource - Content Security Policy source
 * @param {string} params.nonce - Nonce for script security
 * @returns {string} HTML content
 */
function getToolsTemplate({ cssUri, jsUri, cspSource, nonce }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>api-ape Tools</title>
</head>
<body>
  <div id="app">
    <div id="tools-tabs">
      <button class="tool-tab active" data-tab="endpoints">Endpoints</button>
      <button class="tool-tab" data-tab="config">Config</button>
      <button class="tool-tab" data-tab="docs">Docs</button>
    </div>

    <!-- Endpoints Tab -->
    <div id="endpoints-tab" class="tool-panel active">
      <div class="tool-search"><input type="text" id="endpoint-search" placeholder="Search endpoints..."></div>
      <div id="endpoints-tree"></div>
    </div>

    <!-- Config Tab -->
    <div id="config-tab" class="tool-panel">
      <div class="config-row"><label>Server:</label><span id="config-server">localhost:3000</span><button class="btn-icon" id="edit-server">E</button></div>
      <div class="config-row"><label>Controllers:</label><span id="config-controllers">api/</span></div>
      <div class="config-row"><label>Status:</label><span id="config-status" class="status-dot connected"></span><span id="config-status-text">Connected</span></div>
      <div class="config-checkbox"><input type="checkbox" id="config-autogen" checked><label for="config-autogen">Auto-generate types</label></div>
      <div class="config-actions"><button id="btn-refresh" class="btn secondary">Refresh</button><button id="btn-generate" class="btn secondary">Generate Types</button></div>
    </div>

    <!-- Docs Tab -->
    <div id="docs-tab" class="tool-panel">
      <div class="docs-section"><div class="docs-label">RECENT RECAPS</div><div id="recent-recaps"></div></div>
      <div class="docs-section"><div class="docs-label">BOOKMARKED</div><div id="bookmarked-recaps"></div></div>
      <button id="search-docs" class="btn secondary full-width">Search Docs...</button>
    </div>
  </div>

  <!-- Recap Modal -->
  <div id="modal-backdrop" class="hidden"></div>
  <div id="recap-modal" class="modal hidden">
    <div class="modal-header"><span id="recap-modal-title">Recap</span><button class="modal-close">&times;</button></div>
    <div class="modal-content" id="recap-modal-content"></div>
  </div>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

module.exports = { getToolsTemplate };
