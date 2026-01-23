/**
 * @fileoverview HTML template for the gamified learning hub webview
 */

/**
 * Generate the HTML content for the hub webview
 * @param {object} params - Template parameters
 * @param {string} params.cssUri - URI for the CSS file
 * @param {string} params.jsUri - URI for the JavaScript file
 * @param {string} params.cspSource - Content Security Policy source
 * @param {string} params.nonce - Nonce for script security
 * @returns {string} HTML content
 */
function getHubTemplate({ cssUri, jsUri, cspSource, nonce }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${cssUri}">
  <title>api-ape Hub</title>
</head>
<body>
  <div id="app">
    <!-- Header Section -->
    <div id="header-section" class="section">
      <div id="level-card">
        <div id="level-title">Loading...</div>
        <div id="xp-bar"><div id="xp-fill"></div></div>
        <div id="xp-text">0 / 0 XP</div>
        <div id="track-badges">
          <div class="track-badge" id="client-track" data-track="client">
            <span class="track-icon">CL</span><span class="track-pct">0%</span>
          </div>
          <div class="track-badge" id="server-track" data-track="server">
            <span class="track-icon">SV</span><span class="track-pct">0%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Current Quest Section -->
    <div id="quest-section" class="section">
      <div class="section-header">CURRENT QUEST</div>
      <div id="quest-card" class="card">
        <div id="quest-title">No active quest</div>
        <div id="quest-description"></div>
        <div id="quest-progress">
          <div id="quest-progress-bar"><div id="quest-progress-fill"></div></div>
          <span id="quest-progress-text"></span>
        </div>
        <div id="quest-actions">
          <button id="quest-continue" class="btn primary">Continue</button>
          <button id="quest-skip" class="btn secondary">Skip</button>
        </div>
      </div>
      <div id="no-quest-card" class="card hidden">
        <div id="no-quest-text">Select a quest to begin</div>
        <button id="suggest-quest" class="btn primary">Suggest Quest</button>
      </div>
    </div>

    <!-- Skill Trees Section -->
    <div id="skills-section" class="section">
      <div class="section-header">SKILL TREES <span id="skills-toggle" class="toggle-icon">&gt;</span></div>
      <div id="skills-content" class="collapsible">
        <div class="skill-tree">
          <div class="skill-tree-label">CLIENT PATH:</div>
          <div class="skill-tree-nodes" id="client-skill-nodes"></div>
        </div>
        <div class="skill-tree">
          <div class="skill-tree-label">SERVER PATH:</div>
          <div class="skill-tree-nodes" id="server-skill-nodes"></div>
        </div>
      </div>
    </div>

    <!-- Tools Section -->
    <div id="tools-section" class="section">
      <div class="section-header">TOOLS <span id="tools-toggle" class="toggle-icon">v</span></div>
      <div id="tools-content" class="collapsible expanded">
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
    </div>
  </div>

  <!-- Modals -->
  <div id="modal-backdrop" class="hidden"></div>
  <div id="badge-modal" class="modal hidden">
    <div class="modal-header"><span>BADGE COLLECTION</span><button class="modal-close">&times;</button></div>
    <div class="modal-content" id="badge-modal-content"></div>
  </div>
  <div id="quest-modal" class="modal hidden">
    <div class="modal-header"><span id="quest-modal-title">Quest</span><button class="modal-close">&times;</button></div>
    <div class="modal-content" id="quest-modal-content"></div>
  </div>
  <div id="recap-modal" class="modal hidden">
    <div class="modal-header"><span id="recap-modal-title">Recap</span><button class="modal-close">&times;</button></div>
    <div class="modal-content" id="recap-modal-content"></div>
  </div>
  <div id="badge-unlock-toast" class="toast hidden">
    <div class="toast-icon">T</div>
    <div class="toast-content"><div class="toast-title">Badge Unlocked!</div><div class="toast-badge-name"></div><div class="toast-xp">+0 XP</div></div>
  </div>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

module.exports = { getHubTemplate };
