/**
 * @fileoverview Tools panel frontend JavaScript
 */
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  let endpoints = [];
  let bookmarkedRecaps = [];
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  document.addEventListener("DOMContentLoaded", () => { setupEventListeners(); vscode.postMessage({ command: "ready" }); });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.command) {
      case "updateState": renderState(msg.state); break;
      case "updateEndpoints": endpoints = msg.endpoints; renderEndpoints(); break;
      case "endpointsError": renderEndpointsError(msg.error); break;
      case "showRecap": showRecapModal(msg.recap); break;
      case "updateBookmark": updateRecapBookmark(msg.recapId, msg.isBookmarked); break;
    }
  });

  /** Set up DOM event listeners */
  function setupEventListeners() {
    $$(".tool-tab").forEach((tab) => tab.addEventListener("click", () => switchToolTab(tab.dataset.tab)));
    $("#btn-refresh")?.addEventListener("click", () => vscode.postMessage({ command: "refreshEndpoints" }));
    $("#btn-generate")?.addEventListener("click", () => vscode.postMessage({ command: "generateTypes" }));
    $("#edit-server")?.addEventListener("click", () => vscode.postMessage({ command: "configureServer" }));
    $("#search-docs")?.addEventListener("click", () => vscode.postMessage({ command: "openDocs" }));
    $("#endpoint-search")?.addEventListener("input", (e) => filterEndpoints(e.target.value));
    $$(".modal-close").forEach((btn) => btn.addEventListener("click", closeAllModals));
    $("#modal-backdrop")?.addEventListener("click", closeAllModals);
  }

  /**
   * Render state from provider
   * @param {Object} state - Current state
   */
  function renderState(state) {
    if (!state) return;
    const { recentRecaps, bookmarkedRecaps: bookmarked } = state;
    bookmarkedRecaps = bookmarked || [];
    renderRecapList("recent-recaps", recentRecaps, bookmarkedRecaps);
    renderRecapList("bookmarked-recaps", (recentRecaps || []).filter((r) => bookmarkedRecaps.includes(r.id)), bookmarkedRecaps);
    vscode.postMessage({ command: "refreshEndpoints" });
  }

  /**
   * Switch tool tab
   * @param {string} tabName - Tab name
   */
  function switchToolTab(tabName) {
    $$(".tool-tab").forEach((t) => t.classList.remove("active"));
    $$(`.tool-tab[data-tab="${tabName}"]`).forEach((t) => t.classList.add("active"));
    $$(".tool-panel").forEach((p) => p.classList.remove("active"));
    $(`#${tabName}-tab`)?.classList.add("active");
  }

  /** Render endpoint tree */
  function renderEndpoints() {
    const container = $("#endpoints-tree");
    if (!container) return;
    if (!endpoints?.length) { container.innerHTML = '<div class="text-muted" style="font-size:11px;padding:8px;">No endpoints found</div>'; return; }
    const grouped = {};
    endpoints.forEach((ep) => { const ns = ep.path.split(".").slice(0, -1).join(".") || "root"; if (!grouped[ns]) grouped[ns] = []; grouped[ns].push(ep); });
    container.innerHTML = Object.entries(grouped).map(([ns, eps]) => `<div class="endpoint-group"><div class="endpoint-group-header" data-namespace="${ns}"><span class="icon">v</span><span>${ns} (${eps.length})</span></div><div class="endpoint-group-items">${eps.map((ep) => `<div class="endpoint-item" data-path="${ep.path}"><span class="endpoint-name">${ep.path.split(".").pop()}</span><span class="endpoint-type">->${ep.returnType || "void"}</span></div>`).join("")}</div></div>`).join("");
    container.querySelectorAll(".endpoint-group-header").forEach((h) => {
      h.addEventListener("click", () => { const items = h.nextElementSibling, icon = h.querySelector(".icon"); items.style.display = items.style.display === "none" ? "block" : "none"; icon.textContent = items.style.display === "none" ? ">" : "v"; });
    });
    container.querySelectorAll(".endpoint-item").forEach((item) => {
      item.addEventListener("click", () => vscode.postMessage({ command: "goToEndpoint", path: item.dataset.path }));
      item.addEventListener("dblclick", () => vscode.postMessage({ command: "insertApiCall", path: item.dataset.path }));
    });
  }

  /**
   * Render endpoint error
   * @param {string} error - Error message
   */
  function renderEndpointsError(error) {
    const container = $("#endpoints-tree");
    if (container) container.innerHTML = `<div class="text-muted" style="font-size:11px;padding:8px;color:var(--error-color);">${error}</div>`;
  }

  /**
   * Filter endpoints by query
   * @param {string} query - Search query
   */
  function filterEndpoints(query) {
    const lq = query.toLowerCase();
    $$("#endpoints-tree .endpoint-item").forEach((item) => { item.style.display = item.dataset.path.toLowerCase().includes(lq) ? "flex" : "none"; });
    $$("#endpoints-tree .endpoint-group").forEach((g) => { g.style.display = Array.from(g.querySelectorAll(".endpoint-item")).some((i) => i.style.display !== "none") ? "block" : "none"; });
  }

  /**
   * Render recap list
   * @param {string} containerId - Container element ID
   * @param {Array} recaps - Recap items
   * @param {Array} bookmarked - Bookmarked recap IDs
   */
  function renderRecapList(containerId, recaps, bookmarked) {
    const container = $(`#${containerId}`);
    if (!container) return;
    if (!recaps?.length) { container.innerHTML = '<div class="text-muted" style="font-size:11px;padding:8px;">No recaps yet</div>'; return; }
    container.innerHTML = recaps.map((r) => `<div class="recap-item" data-recap-id="${r.id}"><span>${r.title}</span><span class="recap-bookmark ${bookmarked.includes(r.id) ? "bookmarked" : ""}" data-recap-id="${r.id}">*</span></div>`).join("");
    container.querySelectorAll(".recap-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("recap-bookmark")) vscode.postMessage({ command: "bookmarkRecap", recapId: e.target.dataset.recapId });
        else vscode.postMessage({ command: "viewRecap", recapId: item.dataset.recapId });
      });
    });
  }

  /**
   * Show recap modal
   * @param {Object} recap - Recap data
   */
  function showRecapModal(recap) {
    if (!recap) return;
    $("#recap-modal-title").textContent = recap.title;
    const content = $("#recap-modal-content"); if (!content) return;
    content.innerHTML = `<div class="recap-summary">${recap.summary}</div>${recap.methods?.length ? `<div class="recap-methods">${recap.methods.map((m) => `<div class="recap-method"><span class="recap-method-name">${m.name}</span><span class="recap-method-desc">${m.description}</span></div>`).join("")}</div>` : ""}${recap.snippet ? `<div class="recap-snippet"><pre>${escapeHtml(recap.snippet)}</pre></div><div style="margin-bottom:16px;"><button class="btn secondary" onclick="copyCode(\`${escapeJs(recap.snippet)}\`)">Copy</button></div>` : ""}${recap.tips?.length ? `<div class="recap-tips"><div class="recap-tips-title">TIPS</div>${recap.tips.map((t) => `<div class="recap-tip">${t}</div>`).join("")}</div>` : ""}`;
    openModal("recap-modal");
  }

  /**
   * Open a modal
   * @param {string} modalId - Modal element ID
   */
  function openModal(modalId) { $("#modal-backdrop").classList.remove("hidden"); $(`#${modalId}`).classList.remove("hidden"); }

  /** Close all modals */
  function closeAllModals() { $("#modal-backdrop").classList.add("hidden"); $$(".modal").forEach((m) => m.classList.add("hidden")); }

  /**
   * Update recap bookmark state
   * @param {string} recapId - Recap ID
   * @param {boolean} isBookmarked - Bookmark state
   */
  function updateRecapBookmark(recapId, isBookmarked) {
    const b = $(`.recap-bookmark[data-recap-id="${recapId}"]`);
    if (b) b.classList.toggle("bookmarked", isBookmarked);
  }

  /**
   * Escape HTML
   * @param {string} str - String
   * @returns {string} Escaped
   */
  function escapeHtml(str) { return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  /**
   * Escape JS for template
   * @param {string} str - String
   * @returns {string} Escaped
   */
  function escapeJs(str) { return str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$"); }

  // Global functions for inline onclick
  window.copyCode = (code) => vscode.postMessage({ command: "copyCode", code });
})();
