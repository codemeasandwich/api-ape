/**
 * @fileoverview Gamified Hub frontend JavaScript
 */
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  let currentState = null;
  let currentQuest = null;
  let currentQuestStep = 0;
  let endpoints = [];
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  document.addEventListener("DOMContentLoaded", () => { setupEventListeners(); vscode.postMessage({ command: "ready" }); });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.command) {
      case "updateState": currentState = msg.state; renderState(); break;
      case "updateEndpoints": endpoints = msg.endpoints; renderEndpoints(); break;
      case "endpointsError": renderEndpointsError(msg.error); break;
      case "showBadgeModal": showBadgeModal(msg.badges); break;
      case "showQuestPanel": showQuestModal(msg.quest, msg.currentStep); break;
      case "showRecap": showRecapModal(msg.recap); break;
      case "updateBookmark": updateRecapBookmark(msg.recapId, msg.isBookmarked); break;
      case "showBadgeUnlock": showBadgeUnlockToast(msg.badge, msg.xpEarned, msg.leveledUp, msg.newLevel); break;
      case "toggleToolsPanel": toggleSection("tools"); break;
    }
  });

  /** Set up DOM event listeners */
  function setupEventListeners() {
    $$("#track-badges .track-badge").forEach((el) => {
      el.addEventListener("click", () => vscode.postMessage({ command: "selectTrack", track: el.dataset.track }));
    });
    $("#quest-continue")?.addEventListener("click", () => {
      if (currentState?.activeQuest) vscode.postMessage({ command: "continueQuest", questId: currentState.activeQuest.id });
    });
    $("#quest-skip")?.addEventListener("click", () => vscode.postMessage({ command: "skipQuest" }));
    $("#suggest-quest")?.addEventListener("click", () => suggestQuest());
    $("#skills-toggle")?.parentElement?.addEventListener("click", () => toggleSection("skills"));
    $("#tools-toggle")?.parentElement?.addEventListener("click", () => toggleSection("tools"));
    $$(".tool-tab").forEach((tab) => tab.addEventListener("click", () => switchToolTab(tab.dataset.tab)));
    $("#btn-refresh")?.addEventListener("click", () => vscode.postMessage({ command: "refreshEndpoints" }));
    $("#btn-generate")?.addEventListener("click", () => vscode.postMessage({ command: "generateTypes" }));
    $("#edit-server")?.addEventListener("click", () => vscode.postMessage({ command: "configureServer" }));
    $("#search-docs")?.addEventListener("click", () => vscode.postMessage({ command: "openDocs" }));
    $("#endpoint-search")?.addEventListener("input", (e) => filterEndpoints(e.target.value));
    $$(".modal-close").forEach((btn) => btn.addEventListener("click", closeAllModals));
    $("#modal-backdrop")?.addEventListener("click", closeAllModals);
    $("#level-card")?.addEventListener("click", () => vscode.postMessage({ command: "viewBadges" }));
  }

  /** Render the current state */
  function renderState() {
    if (!currentState) return;
    const { summary, activeQuest, questProgress, skillTrees, recentRecaps, bookmarkedRecaps } = currentState;
    $("#level-title").textContent = `LEVEL ${summary.level}: ${summary.levelTitle}`;
    $("#xp-fill").style.width = `${summary.levelProgress.percentage}%`;
    $("#xp-text").textContent = `${summary.xp} / ${summary.xp + (summary.levelProgress.required - summary.levelProgress.current)} XP`;
    $("#client-track .track-pct").textContent = `${summary.clientProgress}%`;
    $("#server-track .track-pct").textContent = `${summary.serverProgress}%`;
    if (summary.track) { $$(".track-badge").forEach((el) => el.classList.remove("selected")); $(`#${summary.track}-track`)?.classList.add("selected"); }
    if (activeQuest) {
      $("#quest-card").classList.remove("hidden"); $("#no-quest-card").classList.add("hidden");
      $("#quest-title").innerHTML = `<span>!</span> ${activeQuest.title}`;
      $("#quest-description").textContent = activeQuest.description;
      const pct = Math.round(((questProgress?.currentStep || 0) / (activeQuest.steps?.length || 1)) * 100);
      $("#quest-progress-fill").style.width = `${pct}%`;
      $("#quest-progress-text").textContent = `${questProgress?.currentStep || 0}/${activeQuest.steps?.length || 1}`;
    } else { $("#quest-card").classList.add("hidden"); $("#no-quest-card").classList.remove("hidden"); }
    renderSkillTree("client-skill-nodes", skillTrees.client);
    renderSkillTree("server-skill-nodes", skillTrees.server);
    renderRecapList("recent-recaps", recentRecaps, bookmarkedRecaps);
    renderRecapList("bookmarked-recaps", recentRecaps.filter((r) => bookmarkedRecaps.includes(r.id)), bookmarkedRecaps);
    vscode.postMessage({ command: "refreshEndpoints" });
  }

  /**
   * Render skill tree nodes
   * @param {string} containerId - Container element ID
   * @param {Array} nodes - Skill tree nodes
   */
  function renderSkillTree(containerId, nodes) {
    const container = $(`#${containerId}`);
    if (!container) return;
    container.innerHTML = "";
    nodes.forEach((node, index) => {
      if (index > 0) { const conn = document.createElement("div"); conn.className = `skill-connector${nodes[index - 1].earned ? " earned" : ""}`; container.appendChild(conn); }
      const nodeEl = document.createElement("div");
      nodeEl.className = `skill-node ${node.earned ? "earned" : node.inProgress ? "in-progress" : "locked"}`;
      nodeEl.textContent = node.label; nodeEl.title = node.id;
      nodeEl.addEventListener("click", () => {
        if (!node.earned) {
          const badge = Object.values(currentState?.badges || {}).flatMap((cat) => cat.badges || []).find((b) => b.id === node.id);
          if (badge?.requirements?.questId) vscode.postMessage({ command: "startQuest", questId: badge.requirements.questId });
        }
      });
      container.appendChild(nodeEl);
    });
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
   * Show badge modal
   * @param {Object} badges - Badge categories
   * @returns {void}
   */
  function showBadgeModal(badges) {
    const content = $("#badge-modal-content");
    if (!content) return;
    const cats = ["fundamentals", "realtime", "security", "advanced"];
    content.innerHTML = cats.map((cat) => {
      const c = badges[cat]; if (!c?.badges?.length) return "";
      return `<div class="badge-category"><div class="badge-category-title"><span>${c.name.toUpperCase()}</span><span>${c.badges.filter((b) => b.earned).length}/${c.badges.length}</span></div><div class="badge-grid">${c.badges.map((b) => `<div class="badge-item ${b.earned ? "earned" : b.inProgress ? "in-progress" : "locked"}" data-badge-id="${b.id}" title="${b.description}"><div class="badge-icon">${getBadgeEmoji(b.icon)}</div><div class="badge-name">${b.name}</div></div>`).join("")}</div></div>`;
    }).join("");
    content.querySelectorAll(".badge-item").forEach((item) => {
      item.addEventListener("click", () => {
        const badge = Object.values(badges).flatMap((c) => c.badges || []).find((b) => b.id === item.dataset.badgeId);
        if (badge && !badge.earned && badge.requirements?.questId) { closeAllModals(); vscode.postMessage({ command: "startQuest", questId: badge.requirements.questId }); }
      });
    });
    openModal("badge-modal");
  }

  /**
   * Show quest modal
   * @param {Object} quest - Quest data
   * @param {number} step - Current step
   */
  function showQuestModal(quest, step) {
    currentQuest = quest; currentQuestStep = step;
    $("#quest-modal-title").textContent = quest.title;
    const content = $("#quest-modal-content"); if (!content) return;
    const s = quest.steps[step], total = quest.steps.length;
    content.innerHTML = `<div class="quest-step"><div class="quest-step-header">STEP ${step + 1} OF ${total}</div><div class="quest-step-title">${s.title}</div>${s.type === "concept" || s.type === "complete" ? `<div class="quest-concept">${s.content}</div>${s.codeExample ? `<div class="quest-code"><pre>${escapeHtml(s.codeExample)}</pre></div><div class="quest-code-actions"><button class="btn secondary" onclick="copyCode(\`${escapeJs(s.codeExample)}\`)">Copy</button><button class="btn secondary" onclick="openInEditor(\`${escapeJs(s.codeExample)}\`)">Open</button></div>` : ""}` : ""}${s.type === "challenge" ? `<div class="quest-challenge"><div class="quest-challenge-title">CHALLENGE</div><div>${s.description}</div>${s.hint ? `<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">Hint: ${s.hint}</div>` : ""}${s.validators ? `<div class="quest-validators">${s.validators.map((v) => `<div class="quest-validator"><div class="quest-validator-icon"></div><span>${getValidatorLabel(v)}</span></div>`).join("")}</div>` : ""}</div>` : ""}<div class="quest-nav"><button class="btn secondary" ${step === 0 ? "disabled" : ""} onclick="prevQuestStep()">< Prev</button>${s.type === "challenge" ? `<button class="btn primary" onclick="checkQuestStep()">Check</button>` : `<button class="btn primary" onclick="nextQuestStep()">${step === total - 1 ? "Complete" : "Next >"}</button>`}</div></div>`;
    openModal("quest-modal");
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
   * Show badge unlock toast
   * @param {Object} badge - Badge data
   * @param {number} xpEarned - XP earned
   * @param {boolean} leveledUp - Whether leveled up
   * @param {number} newLevel - New level
   */
  function showBadgeUnlockToast(badge, xpEarned, leveledUp, newLevel) {
    const toast = $("#badge-unlock-toast"); if (!toast) return;
    toast.querySelector(".toast-badge-name").textContent = badge.name;
    toast.querySelector(".toast-xp").textContent = `+${xpEarned} XP${leveledUp ? ` - Level ${newLevel}!` : ""}`;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 4000);
  }

  /**
   * Toggle collapsible section
   * @param {string} section - Section name
   */
  function toggleSection(section) {
    const content = $(`#${section}-content`), toggle = $(`#${section}-toggle`);
    if (content.classList.contains("expanded")) { content.classList.remove("expanded"); toggle.textContent = ">"; }
    else { content.classList.add("expanded"); toggle.textContent = "v"; }
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

  /** Suggest a quest based on progress */
  function suggestQuest() {
    const quests = ["first-controller", "broadcast-master", "first-subscription", "basic-auth"];
    for (const qid of quests) { if (!currentState?.summary?.completedQuests?.includes?.(qid)) { vscode.postMessage({ command: "startQuest", questId: qid }); return; } }
    alert("All quests complete!");
  }

  /**
   * Get badge emoji
   * @param {string} icon - Icon name
   * @returns {string} Emoji
   */
  function getBadgeEmoji(icon) {
    const m = { wave: "W", call: "C", typescript: "TS", shield: "S", radio: "R", ear: "E", upload: "U", plug: "P", state: "St", "file-code": "F", broadcast: "B", megaphone: "M", hook: "H", context: "Cx", key: "K", "shield-check": "SC", "shield-star": "SS", castle: "Ca", puzzle: "Pz", tree: "T", server: "Sv" };
    return m[icon] || "B";
  }

  /**
   * Get validator label
   * @param {Object} v - Validator
   * @returns {string} Label
   */
  function getValidatorLabel(v) {
    switch (v.type) { case "file-exists": return "File created"; case "code-contains": return `Contains ${v.pattern}`; case "endpoint-called": return "Endpoint tested"; case "manual": return "Manual verify"; default: return v.type; }
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

  /**
   * Update recap bookmark state
   * @param {string} recapId - Recap ID
   * @param {boolean} isBookmarked - Bookmark state
   */
  function updateRecapBookmark(recapId, isBookmarked) {
    const b = $(`.recap-bookmark[data-recap-id="${recapId}"]`);
    if (b) b.classList.toggle("bookmarked", isBookmarked);
  }

  // Global functions for inline onclick
  window.copyCode = (code) => vscode.postMessage({ command: "copyCode", code });
  window.openInEditor = (code) => vscode.postMessage({ command: "openInEditor", code, filename: "example.js" });
  window.prevQuestStep = () => { if (currentQuestStep > 0) showQuestModal(currentQuest, currentQuestStep - 1); };
  window.nextQuestStep = () => vscode.postMessage({ command: "completeQuestStep", questId: currentQuest.id, stepIndex: currentQuestStep });
  window.checkQuestStep = () => vscode.postMessage({ command: "completeQuestStep", questId: currentQuest.id, stepIndex: currentQuestStep });
})();
