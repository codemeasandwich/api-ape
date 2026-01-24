/**
 * @fileoverview HTML template for the Tools webview
 * Uses hyper-element custom components for reactive rendering
 */

/**
 * Generate the HTML content for the tools webview
 * @param {object} params - Template parameters
 * @param {string} params.cssUri - URI for the CSS file
 * @param {string} params.cspSource - Content Security Policy source
 * @param {string} params.nonce - Nonce for script security
 * @param {string} params.hyperHtmlUri - URI for hyperhtml library
 * @param {string} params.hyperElementUri - URI for hyper-element library
 * @param {object} params.componentUris - URIs for component scripts
 * @returns {string} HTML content
 */
function getToolsTemplate({
  cssUri,
  cspSource,
  nonce,
  hyperHtmlUri,
  hyperElementUri,
  componentUris
}) {
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
  <!-- Root hyper-element component -->
  <ape-tools></ape-tools>

  <!-- Load hyper-element libraries -->
  <script nonce="${nonce}" src="${hyperHtmlUri}"></script>
  <script nonce="${nonce}" src="${hyperElementUri}"></script>

  <!-- Load components in dependency order -->
  <script nonce="${nonce}" src="${componentUris.tabBar}"></script>
  <script nonce="${nonce}" src="${componentUris.endpointsPanel}"></script>
  <script nonce="${nonce}" src="${componentUris.configPanel}"></script>
  <script nonce="${nonce}" src="${componentUris.docsPanel}"></script>
  <script nonce="${nonce}" src="${componentUris.modal}"></script>
  <script nonce="${nonce}" src="${componentUris.tools}"></script>
</body>
</html>`;
}

module.exports = { getToolsTemplate };
