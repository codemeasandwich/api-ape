/**
 * @fileoverview HTML template for the gamified learning hub webview
 * Uses hyper-element custom components for reactive rendering
 */

/**
 * Generate the HTML content for the hub webview
 * @param {object} params - Template parameters
 * @param {string} params.cssUri - URI for the CSS file
 * @param {string} params.badgeSvgsUri - URI for the badge SVGs JavaScript file
 * @param {string} params.cspSource - Content Security Policy source
 * @param {string} params.nonce - Nonce for script security
 * @param {string} params.hyperElementUri - URI for hyper-element bundle (includes hyperhtml)
 * @param {object} params.componentUris - URIs for component scripts
 * @returns {string} HTML content
 */
function getHubTemplate({
  cssUri,
  badgeSvgsUri,
  cspSource,
  nonce,
  hyperElementUri,
  componentUris
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource};">
  <link rel="stylesheet" href="${cssUri}">
  <title>api-ape Hub</title>
</head>
<body>
  <!-- Root hyper-element component -->
  <ape-hub></ape-hub>

  <!-- Load hyper-element bundle (includes hyperhtml) -->
  <script nonce="${nonce}" src="${hyperElementUri}"></script>

  <!-- Load badge SVGs (global for components) -->
  <script nonce="${nonce}" src="${badgeSvgsUri}"></script>

  <!-- Load components in dependency order -->
  <script nonce="${nonce}" src="${componentUris.levelCard}"></script>
  <script nonce="${nonce}" src="${componentUris.questSection}"></script>
  <script nonce="${nonce}" src="${componentUris.skillsSection}"></script>
  <script nonce="${nonce}" src="${componentUris.modalBackdrop}"></script>
  <script nonce="${nonce}" src="${componentUris.badgeModal}"></script>
  <script nonce="${nonce}" src="${componentUris.questModal}"></script>
  <script nonce="${nonce}" src="${componentUris.toast}"></script>
  <script nonce="${nonce}" src="${componentUris.hub}"></script>
</body>
</html>`;
}

module.exports = { getHubTemplate };
