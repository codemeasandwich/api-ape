/**
 * @fileoverview Gamified Hub frontend JavaScript
 */
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  let currentState = null;
  let currentQuest = null;
  let currentQuestStep = 0;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  document.addEventListener("DOMContentLoaded", () => { setupEventListeners(); vscode.postMessage({ command: "ready" }); });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.command) {
      case "updateState": currentState = msg.state; renderState(); break;
      case "showBadgeModal": showBadgeModal(msg.badges); break;
      case "showQuestPanel": showQuestModal(msg.quest, msg.currentStep); break;
      case "showBadgeUnlock": showBadgeUnlockToast(msg.badge, msg.xpEarned, msg.leveledUp, msg.newLevel); break;
      case "validationFailed": showValidationResults(msg.results); break;
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
    $$(".modal-close").forEach((btn) => btn.addEventListener("click", closeAllModals));
    $("#modal-backdrop")?.addEventListener("click", closeAllModals);
    $("#level-card")?.addEventListener("click", () => vscode.postMessage({ command: "viewBadges" }));
  }

  /** Render the current state */
  function renderState() {
    if (!currentState) return;
    const { summary, activeQuest, questProgress, skillTrees } = currentState;
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
      return `<div class="badge-category"><div class="badge-category-title"><span>${c.name.toUpperCase()}</span><span>${c.badges.filter((b) => b.earned).length}/${c.badges.length}</span></div><div class="badge-grid">${c.badges.map((b) => `<div class="badge-item ${b.earned ? "earned" : b.inProgress ? "in-progress" : "locked"}" data-badge-id="${b.id}" data-icon="${getIconName(b.icon)}" title="${b.description}"><div class="badge-icon">${getBadgeEmoji(b.icon)}</div><div class="badge-name">${b.name}</div></div>`).join("")}</div></div>`;
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
   * Open a modal
   * @param {string} modalId - Modal element ID
   */
  function openModal(modalId) { $("#modal-backdrop").classList.remove("hidden"); $(`#${modalId}`).classList.remove("hidden"); }

  /** Close all modals */
  function closeAllModals() { $("#modal-backdrop").classList.add("hidden"); $$(".modal").forEach((m) => m.classList.add("hidden")); }

  /**
   * Show validation results in quest modal
   * @param {Array<{type: string, passed: boolean, message: string}>} results - Validation results
   */
  function showValidationResults(results) {
    const validators = $$(".quest-validator");
    results.forEach((result, i) => {
      if (validators[i]) {
        const icon = validators[i].querySelector(".quest-validator-icon");
        validators[i].classList.add(result.passed ? "passed" : "failed");
        icon.textContent = result.passed ? "\u2713" : "\u2717";
      }
    });

    // Show hint for failed validations
    const failedResults = results.filter((r) => !r.passed);
    if (failedResults.length > 0) {
      const existing = $(".validation-hint");
      if (existing) existing.remove();

      const hint = document.createElement("div");
      hint.className = "validation-hint";
      hint.innerHTML = failedResults.map((r) => `<div class="validation-error">${r.message}</div>`).join("");

      const content = $("#quest-modal-content");
      if (content) content.appendChild(hint);
    }
  }

  /**
   * Show badge unlock toast
   * @param {Object} badge - Badge data
   * @param {number} xpEarned - XP earned
   * @param {boolean} leveledUp - Whether leveled up
   * @param {number} newLevel - New level
   */
  function showBadgeUnlockToast(badge, xpEarned, leveledUp, newLevel) {
    const toast = $("#badge-unlock-toast"); if (!toast) return;
    toast.querySelector(".toast-icon").innerHTML = getBadgeEmoji(badge.icon);
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

  /** Suggest a quest based on progress */
  function suggestQuest() {
    const quests = ["first-controller", "error-handling", "broadcast-master", "first-subscription", "first-publish", "connection-handling", "connection-states", "file-upload", "lifecycle-hooks", "controller-context", "basic-auth", "mfa-setup", "tier-2-auth", "tier-3-auth", "custom-plugin", "forest-setup", "cluster-deployment"];
    for (const qid of quests) { if (!currentState?.summary?.completedQuests?.includes?.(qid)) { vscode.postMessage({ command: "startQuest", questId: qid }); return; } }
    alert("All quests complete! You've mastered api-ape!");
  }

  /** Icon name mapping from badge icon to SVG file */
  const iconMap = { wave: "hand-heart", call: "telephone", typescript: "typescript", shield: "shield-check", radio: "radio", ear: "volume-2", upload: "arrow-big-up", plug: "plug-connected", state: "stack", "file-code": "file-description", broadcast: "satellite-dish", megaphone: "party-popper", hook: "link", context: "layers", key: "lock", "shield-check": "shield-check", "shield-star": "rosette-discount-check", castle: "hotel", puzzle: "sparkles", tree: "rocket", server: "router" };

  /**
   * Get icon file name from badge icon
   * @param {string} icon - Icon name
   * @returns {string} Icon file name (without extension)
   */
  function getIconName(icon) {
    return iconMap[icon] || "star";
  }

  /**
   * Get badge icon HTML (inline SVG for multi-element hover animations)
   * @param {string} icon - Icon name
   * @returns {string} Inline SVG element
   */
  function getBadgeEmoji(icon) {
    const iconFile = getIconName(icon);
    return badgeSvgs[iconFile] || badgeSvgs.star || "";
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

  // Global functions for inline onclick
  window.copyCode = (code) => vscode.postMessage({ command: "copyCode", code });
  window.openInEditor = (code) => vscode.postMessage({ command: "openInEditor", code, filename: "example.js" });
  window.prevQuestStep = () => { if (currentQuestStep > 0) showQuestModal(currentQuest, currentQuestStep - 1); };
  window.nextQuestStep = () => vscode.postMessage({ command: "completeQuestStep", questId: currentQuest.id, stepIndex: currentQuestStep });
  window.checkQuestStep = () => vscode.postMessage({ command: "completeQuestStep", questId: currentQuest.id, stepIndex: currentQuestStep });
})();
