(function () {
  "use strict";

  const LAYOUT_CACHE_VERSION = 3;
  const LAYOUT_MAX_PROFILES = 8;
  const ELK_VERSION = "0.10.2";
  const LAYOUT_ROUTE_SPACE = "single-svg-v2";
  // Explicit layout engines, alongside the default topology-aware deterministic
  // placement. "force" is the pre-v3 identifier for the stress engine and is
  // still accepted so persisted profiles keep their positions.
  const LAYOUT_ENGINES = ["elk", "stress"];
  const normaliseLayoutEngine = (engine) => (engine === "force" ? "stress" : LAYOUT_ENGINES.includes(engine) ? engine : "deterministic");
  const SIDEBAR_WIDTH_KEY = "bmopf-sidebar-width-v1";
  const TABLE_WIDTHS_KEY = "bmopf-table-widths-v1";
  const SIDEBAR_WIDTH_DEFAULT = 360;
  const SIDEBAR_WIDTH_MIN = 280;
  const SIDEBAR_WIDTH_MAX = 640;
  const state = { index: null, selected: null, terminalTrace: null, tracePage: 0, traceLimit: 2000, result: null, resultLabel: "", resultError: "", resultCompare: null, resultCompareLabel: "", resultCompareError: "", resultScenario: null, diagnosticsQuery: "", diagnosticsSeverity: "all", view: "single", query: "", activeKind: null, multiHops: 1, searchFocus: -1, searchPage: 0, navigation: { entries: [], cursor: -1, nextId: 0 }, largeCaseDecision: "full", largeCaseBypass: false, sidebarWidth: SIDEBAR_WIDTH_DEFAULT, multiDetailWidth: 380, multiDetailCollapsed: false, singleDisplay: { showBusBars: false, showBusLabels: true, showDeviceLabels: false, showArrows: false, labelsSelectedOnly: false }, layout: { version: LAYOUT_CACHE_VERSION, key: null, locked: {}, positions: {}, routes: {}, direction: "source-to-load", engine: "deterministic", profiles: {} }, cameras: { geo: { scale: 1, x: 0, y: 0 }, single: { scale: 1, x: 0, y: 0 }, multi: { scale: 1, x: 0, y: 0 } } };
  const SEARCH_PAGE_SIZE = 100;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleOf = (item) => `${item.ref.kind.replaceAll("_", " ")} ${item.ref.id}`;
  const kindName = (kind) => String(kind || "").replaceAll("_", " ");
  const entityLabelHtml = (kind, id) => `<span class="entity-label" aria-label="${escapeHtml(`${kindName(kind)} ${id}`)}"><span class="entity-kind">${escapeHtml(kindName(kind))}</span> <span class="entity-id">${escapeHtml(id)}</span></span>`;
  const entityLabelSvg = (kind, id) => `<tspan class="entity-kind" fill="#70695f" font-size=".82em" font-style="italic" font-variant="small-caps" font-weight="600" letter-spacing=".04em">${escapeHtml(kindName(kind))}</tspan><tspan class="entity-id" fill="#25231f" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700"> ${escapeHtml(id)}</tspan>`;
  const colourOf = (kind) => ({ line: "#8a8378", switch: "#c26a27", transformer: "#4f789f", load: "#a75a1b", generator: "#4a8f5f", ibr: "#789e46", shunt: "#8a6ca8", capacitor: "#8a6ca8", voltage_source: "#3f6fb9" }[kind] || "#9a9388");
  const copyIcon = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="5" y="2" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="5" width="8" height="9" rx="1.5" fill="var(--panel)" stroke="currentColor" stroke-width="1.3"/></svg>`;

  async function copyToClipboard(text) {
    const value = String(text ?? "");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* fall back for file:// and non-secure origins */ }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
    textarea.remove();
    return copied;
  }

  function copyButton(text, label = "Copy") {
    return `<button type="button" class="copy-button" data-copy-text="${escapeHtml(text)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${copyIcon}</button>`;
  }

  function copyTargetButton(label = "Copy") {
    return `<button type="button" class="copy-button" data-copy-target="pre.raw" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${copyIcon}</button>`;
  }

  function copySvgButton(x, y, text, label = "Copy") {
    return `<g class="copy-button-svg" data-copy-text="${escapeHtml(text)}" role="button" tabindex="0" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><rect class="copy-button-svg-bg" x="${x}" y="${y}" width="16" height="16" rx="3" fill="#fffdf9" stroke="#c9c1b4"/><g transform="translate(${x} ${y})">${copyIcon}</g></g>`;
  }

  function bindCopyButtons(root = document) {
    root.querySelectorAll?.("[data-copy-text], [data-copy-target]").forEach((button) => {
      if (button.dataset.copyBound === "true") return;
      button.dataset.copyBound = "true";
      const originalLabel = button.getAttribute("aria-label") || "Copy";
      const feedback = (message, success) => {
        button.classList.toggle("copied", success);
        button.setAttribute("aria-label", message);
        button.setAttribute("title", message);
        window.clearTimeout(button._copyFeedbackTimer);
        button._copyFeedbackTimer = window.setTimeout(() => {
          button.classList.remove("copied");
          button.setAttribute("aria-label", originalLabel);
          button.setAttribute("title", originalLabel);
        }, 1400);
      };
      const activate = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = button.dataset.copyTarget ? button.closest("details")?.querySelector(button.dataset.copyTarget) : null;
        const text = button.dataset.copyText ?? target?.textContent ?? "";
        const copied = await copyToClipboard(text);
        feedback(copied ? "Copied" : "Copy unavailable", copied);
      };
      button.addEventListener("click", activate);
      button.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) activate(event);
      });
    });
  }
  const symbolRenderer = globalThis.BMOPFRenderers?.createSymbolRenderer({ escapeHtml, colourOf, sameRef, resultStatus, resultTooltip, titleOf, entityLabelSvg });

  function setStatus(text) { $("view-status").textContent = text || ""; }

  function tableWidths() {
    try {
      const stored = JSON.parse(localStorage.getItem(TABLE_WIDTHS_KEY) || "{}");
      return stored && typeof stored === "object" ? stored : {};
    } catch (_) { return {}; }
  }

  function saveTableWidths(widths) {
    try { localStorage.setItem(TABLE_WIDTHS_KEY, JSON.stringify(widths)); } catch (_) { /* localStorage is optional */ }
  }

  function bindResizableTable(table) {
    if (!table) return;
    const headers = [...table.querySelectorAll("thead th")];
    if (headers.length < 2) return;
    const key = table.dataset.resizableTable || "table";
    const stored = tableWidths()[key];
    if (Array.isArray(stored)) headers.forEach((header, index) => { if (Number.isFinite(stored[index])) header.style.width = `${stored[index]}px`; });
    headers.slice(0, -1).forEach((header) => {
      const handle = document.createElement("span");
      handle.className = "column-resizer";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-label", `Resize ${header.textContent.trim()} column`);
      handle.setAttribute("tabindex", "0");
      handle.title = "Drag to resize this column; use Arrow keys for precise sizing";
      const setWidth = (width) => {
        const minimum = 48;
        const maximum = Math.max(minimum, table.clientWidth - headers.length * minimum + header.getBoundingClientRect().width);
        const next = Math.max(minimum, Math.min(maximum, width));
        header.style.width = `${Math.round(next)}px`;
        handle.setAttribute("aria-valuemin", String(minimum));
        handle.setAttribute("aria-valuemax", String(Math.round(maximum)));
        handle.setAttribute("aria-valuenow", String(Math.round(next)));
        const widths = tableWidths();
        widths[key] = headers.map((column) => Math.round(column.getBoundingClientRect().width));
        saveTableWidths(widths);
      };
      handle.setAttribute("aria-valuenow", String(Math.round(header.getBoundingClientRect().width)));
      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const startX = event.clientX;
        const startWidth = header.getBoundingClientRect().width;
        const move = (moveEvent) => { setWidth(startWidth + moveEvent.clientX - startX); moveEvent.preventDefault(); };
        const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); document.body.classList.remove("resizing-column"); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish, { once: true });
        window.addEventListener("pointercancel", finish, { once: true });
        document.body.classList.add("resizing-column");
        event.preventDefault();
        event.stopPropagation();
      });
      handle.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        setWidth(header.getBoundingClientRect().width + (event.key === "ArrowRight" ? 8 : -8));
      });
      header.append(handle);
    });
  }

  function bindResizableInventory() {
    const panel = $("inventory");
    const handle = panel?.querySelector(".inventory-column-resizer");
    const header = panel?.querySelector(".inventory-header");
    if (!panel || !handle || !header) return;
    let stored = NaN;
    try { stored = Number(localStorage.getItem("bmopf-inventory-column-width-v1")); } catch (_) { /* localStorage is optional */ }
    const current = Number.isFinite(stored) && stored > 0 ? stored : header.querySelector("span")?.getBoundingClientRect().width;
    const setWidth = (width) => {
      const minimum = 100;
      const maximum = Math.max(minimum, panel.clientWidth - 14 * 2 - 8 - 44 - 8);
      const next = Math.max(minimum, Math.min(maximum, width));
      panel.style.setProperty("--inventory-label-width", `${Math.round(next)}px`);
      handle.setAttribute("aria-valuemin", String(minimum));
      handle.setAttribute("aria-valuemax", String(Math.round(maximum)));
      handle.setAttribute("aria-valuenow", String(Math.round(next)));
      try { localStorage.setItem("bmopf-inventory-column-width-v1", String(Math.round(next))); } catch (_) { /* localStorage is optional */ }
    };
    if (Number.isFinite(current)) setWidth(current);
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startWidth = panel.querySelector(".inventory-header > span")?.getBoundingClientRect().width || 0;
      const move = (moveEvent) => { setWidth(startWidth + moveEvent.clientX - startX); moveEvent.preventDefault(); };
      const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); document.body.classList.remove("resizing-column"); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
      document.body.classList.add("resizing-column");
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const width = panel.querySelector(".inventory-header > span")?.getBoundingClientRect().width || 0;
      setWidth(width + (event.key === "ArrowRight" ? 8 : -8));
    });
  }

  function sidebarWidthBounds() {
    const available = Math.max(SIDEBAR_WIDTH_MIN, window.innerWidth - 368);
    return { min: SIDEBAR_WIDTH_MIN, max: Math.min(SIDEBAR_WIDTH_MAX, available) };
  }

  function clampSidebarWidth(value) {
    const bounds = sidebarWidthBounds();
    return Math.round(Math.max(bounds.min, Math.min(bounds.max, Number(value) || SIDEBAR_WIDTH_DEFAULT)));
  }

  function setSidebarWidth(value, { persist = true } = {}) {
    const width = clampSidebarWidth(value);
    state.sidebarWidth = width;
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
    const handle = $("sidebar-resizer");
    if (handle) {
      const bounds = sidebarWidthBounds();
      handle.setAttribute("aria-valuemin", String(bounds.min));
      handle.setAttribute("aria-valuemax", String(bounds.max));
      handle.setAttribute("aria-valuenow", String(width));
      handle.setAttribute("aria-valuetext", `${width}px details panel`);
    }
    if (persist) {
      try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width)); } catch (_) { /* localStorage is optional in static reports */ }
    }
  }

  function loadSidebarWidth() {
    try {
      const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      return Number.isFinite(stored) ? stored : SIDEBAR_WIDTH_DEFAULT;
    } catch (_) { return SIDEBAR_WIDTH_DEFAULT; }
  }

  function initialiseSidebarResize() {
    const handle = $("sidebar-resizer");
    if (!handle) return;
    setSidebarWidth(loadSidebarWidth(), { persist: false });
    let dragging = false;
    const stopDragging = () => { dragging = false; document.body.classList.remove("resizing-sidebar"); };
    handle.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 880px)").matches) return;
      dragging = true;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("resizing-sidebar");
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (dragging) setSidebarWidth(window.innerWidth - event.clientX);
    });
    handle.addEventListener("pointerup", stopDragging);
    handle.addEventListener("pointercancel", stopDragging);
    handle.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { setSidebarWidth(state.sidebarWidth + 24); event.preventDefault(); }
      else if (event.key === "ArrowRight") { setSidebarWidth(state.sidebarWidth - 24); event.preventDefault(); }
      else if (event.key === "Home") { setSidebarWidth(SIDEBAR_WIDTH_DEFAULT); event.preventDefault(); }
      else if (event.key === "End") { setSidebarWidth(SIDEBAR_WIDTH_MAX); event.preventDefault(); }
    });
    window.addEventListener("resize", () => setSidebarWidth(state.sidebarWidth, { persist: false }));
  }

  function setMultiDetailWidth(value) {
    const stage = $("single-view-layout");
    const handle = $("multi-detail-resizer");
    if (!stage || !handle) return;
    const available = Math.max(280, stage.getBoundingClientRect().width - 320);
    const width = Math.round(Math.max(280, Math.min(560, Math.min(available, Number(value) || 380))));
    state.multiDetailWidth = width;
    stage.style.setProperty("--multi-detail-width", `${width}px`);
    handle.setAttribute("aria-valuenow", String(width));
    handle.setAttribute("aria-valuemax", String(Math.round(Math.min(560, available))));
  }

  function initialiseMultiDetailResize() {
    const handle = $("multi-detail-resizer");
    const stage = $("single-view-layout");
    if (!handle || !stage) return;
    setMultiDetailWidth(state.multiDetailWidth);
    let dragging = false;
    const stopDragging = () => { dragging = false; document.body.classList.remove("resizing-multi-detail"); };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || window.matchMedia("(max-width: 880px)").matches) return;
      dragging = true;
      handle.setPointerCapture?.(event.pointerId);
      document.body.classList.add("resizing-multi-detail");
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      setMultiDetailWidth(stage.getBoundingClientRect().right - event.clientX);
      event.preventDefault();
    });
    handle.addEventListener("pointerup", stopDragging);
    handle.addEventListener("pointercancel", stopDragging);
    handle.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { setMultiDetailWidth(state.multiDetailWidth + 24); event.preventDefault(); }
      else if (event.key === "ArrowRight") { setMultiDetailWidth(state.multiDetailWidth - 24); event.preventDefault(); }
      else if (event.key === "Home") { setMultiDetailWidth(380); event.preventDefault(); }
      else if (event.key === "End") { setMultiDetailWidth(560); event.preventDefault(); }
    });
    window.addEventListener("resize", () => setMultiDetailWidth(state.multiDetailWidth));
  }

  function showLoadError(message, label) {
    state.index = null;
    state.selected = null;
    state.activeKind = null;
    $("case-summary").className = "panel empty-panel";
    $("case-summary").innerHTML = `<strong>Could not open case</strong><p class="muted">${escapeHtml(message)}</p>`;
    $("inventory").innerHTML = "";
    $("inspector").innerHTML = `<p class="muted">Open a valid BMOPF JSON case to begin exploring it.</p>`;
    $("selection-label").textContent = "Nothing selected";
    $("canvas").innerHTML = `<div class="message">${escapeHtml(message)}</div>`;
    setStatus(label ? `${label} was not loaded.` : "Case was not loaded.");
  }

  function select(ref) {
    navigateTo({ view: state.view, selected: ref });
  }

  function navigationEntryFromHash() {
    const parts = window.location.hash.slice(2).split("/");
    const view = parts[0] && ["geo", "single", "multi", "diagnostics"].includes(parts[0]) ? parts[0] : "single";
    const selected = parts[1] && parts[2] ? { kind: parts[1], id: decodeURIComponent(parts.slice(2).join("/")) } : null;
    return { view, selected };
  }

  function navigationHash(entry) {
    const selected = entry.selected;
    return selected ? `#/${entry.view}/${selected.kind}/${encodeURIComponent(selected.id)}` : `#/${entry.view}`;
  }

  function applyNavigationEntry(entry) {
    state.view = entry.view;
    state.selected = entry.selected;
    state.activeKind = null;
    render();
    if (entry.selected) focusSelection();
  }

  function syncNavigationEntry(entry) {
    const current = state.navigation.entries[state.navigation.cursor];
    if (current && current.view === entry.view && JSON.stringify(current.selected) === JSON.stringify(entry.selected)) return;
    const stateEntry = history.state?.bmopfNavigationId;
    const known = state.navigation.entries.findIndex((candidate) => candidate.id === stateEntry);
    if (known >= 0) state.navigation.cursor = known;
    else {
      const id = state.navigation.nextId++;
      state.navigation.entries = [{ ...entry, id }];
      state.navigation.cursor = 0;
      history.replaceState({ ...(history.state || {}), bmopfNavigationId: id, bmopfEntry: entry }, "", navigationHash(entry));
    }
  }

  function initialiseNavigation(entry) {
    const id = state.navigation.nextId++;
    state.navigation.entries = [{ ...entry, id }];
    state.navigation.cursor = 0;
    history.replaceState({ ...(history.state || {}), bmopfNavigationId: id, bmopfEntry: entry }, "", navigationHash(entry));
  }

  function navigateTo(entry) {
    const current = state.navigation.entries[state.navigation.cursor];
    if (["single", "geo"].includes(entry.view) && (!current || current.view !== "single" || JSON.stringify(current.selected) !== JSON.stringify(entry.selected))) state.multiDetailCollapsed = false;
    if (current && current.view === entry.view && JSON.stringify(current.selected) === JSON.stringify(entry.selected)) {
      applyNavigationEntry(entry);
      return;
    }
    const id = state.navigation.nextId++;
    state.navigation.entries = state.navigation.entries.slice(0, state.navigation.cursor + 1);
    state.navigation.entries.push({ ...entry, id });
    state.navigation.cursor = state.navigation.entries.length - 1;
    history.pushState({ ...(history.state || {}), bmopfNavigationId: id, bmopfEntry: entry }, "", navigationHash(entry));
    applyNavigationEntry(entry);
  }

  function navigationReset(entry) {
    const id = state.navigation.nextId++;
    state.navigation.entries = [{ ...entry, id }];
    state.navigation.cursor = 0;
    history.replaceState({ ...(history.state || {}), bmopfNavigationId: id, bmopfEntry: entry }, "", navigationHash(entry));
  }

  function navigationDisabled(direction) {
    return direction === "back" ? state.navigation.cursor <= 0 : state.navigation.cursor < 0 || state.navigation.cursor >= state.navigation.entries.length - 1;
  }

  function itemFor(ref) {
    if (!state.index || !ref) return null;
    return state.index.byKind.get(ref.kind)?.get(ref.id) || null;
  }

  function loadDocument(caseDocument, label, preparedIndex = null) {
    cancelImport();
    networkPage = 0; networkQuery = "";
    state.terminalTrace = null; state.tracePage = 0; state.traceLimit = 2000;
    const requestedSelection = state.selected;
    try {
      state.index = preparedIndex || globalThis.BMOPFModel.buildCaseIndex(caseDocument);
      modelSheets.reset();
      state.cameras.geo = { scale: 1, x: 0, y: 0 };
      state.layout = loadLayout();
      state.selected = requestedSelection && itemFor(requestedSelection) ? requestedSelection : null;
      state.activeKind = null;
      const budget = overviewBudget();
      state.largeCaseDecision = budget.over ? (state.largeCaseBypass ? "full" : "pending") : "full";
      navigationReset({ view: state.view, selected: state.selected });
      render();
      if (label) globalThis.document.title = `${label} · BMOPF Explorer`;
    } catch (error) {
      showLoadError(error.message, label);
    }
  }

  function layoutKey() {
    const meta = state.index?.raw?.meta || {};
    return String(meta.case_fingerprint || meta.case_id || state.index?.name || "unnamed-case");
  }

  function layoutProfileKey(direction, root) {
    const safeDirection = direction === "load-to-source" ? "load-to-source" : "source-to-load";
    const safeRoot = typeof root === "string" && root ? root : "auto";
    return `direction=${safeDirection};root=${safeRoot}`;
  }

  function layoutGraphSignature() {
    if (!state.index) return "sld-elk-graph-v1:none";
    return state.index.graphSignature ||= globalThis.BMOPFModel.layoutGraphSignature(state.index);
  }

  function normaliseLayoutProfile(profile) {
    if (!profile || typeof profile !== "object") return { locked: {}, positions: {}, routes: {}, engine: "deterministic" };
    const locked = profile.locked && typeof profile.locked === "object" ? profile.locked : {};
    const positions = profile.positions && typeof profile.positions === "object" ? profile.positions : {};
    const routes = profile.routes && typeof profile.routes === "object" ? profile.routes : {};
    const lastUsed = Number.isFinite(Number(profile.lastUsed)) ? Number(profile.lastUsed) : 0;
    return { locked, positions, routes, engine: normaliseLayoutEngine(profile.engine), lastUsed };
  }

  function pruneLayoutProfiles(profiles, activeKey) {
    const entries = Object.entries(profiles || {});
    entries.sort(([keyA, profileA], [keyB, profileB]) => {
      if (keyA === activeKey) return -1;
      if (keyB === activeKey) return 1;
      const usedA = Number.isFinite(Number(profileA?.lastUsed)) ? Number(profileA.lastUsed) : 0;
      const usedB = Number.isFinite(Number(profileB?.lastUsed)) ? Number(profileB.lastUsed) : 0;
      return usedB - usedA || keyA.localeCompare(keyB);
    });
    return Object.fromEntries(entries.slice(0, LAYOUT_MAX_PROFILES));
  }

  function loadLayout() {
    const key = layoutKey();
    const graphSignature = layoutGraphSignature();
    const defaults = (cacheState = "none") => ({ version: LAYOUT_CACHE_VERSION, key, locked: {}, positions: {}, routes: {}, direction: "source-to-load", root: "auto", engine: "deterministic", profiles: {}, cacheState });
    try {
      const current = JSON.parse(localStorage.getItem(`bmopf-layout-v3:${key}`) || "null");
      if (current && current.version === LAYOUT_CACHE_VERSION && current.key === key && current.graphSignature === graphSignature && current.routeSpace === LAYOUT_ROUTE_SPACE && current.elkVersion === ELK_VERSION && current.profiles && typeof current.profiles === "object") {
        const direction = current.direction === "load-to-source" ? current.direction : "source-to-load";
        const root = typeof current.root === "string" ? current.root : "auto";
        const activeProfileKey = layoutProfileKey(direction, root);
        const profiles = pruneLayoutProfiles(current.profiles, activeProfileKey);
        const profile = normaliseLayoutProfile(profiles[activeProfileKey]);
        return { version: LAYOUT_CACHE_VERSION, key, locked: profile.locked, positions: profile.positions, routes: profile.routes, direction, root, engine: profile.engine, profiles, graphSignature, cacheState: "valid" };
      }
      if (current && current.version === LAYOUT_CACHE_VERSION && current.key === key) return defaults("stale");
      const stored = JSON.parse(localStorage.getItem(`bmopf-layout-v2:${key}`) || "null");
      if (stored && stored.version === 2 && stored.key === key && stored.profiles && typeof stored.profiles === "object") {
        const direction = stored.direction === "load-to-source" ? stored.direction : "source-to-load";
        const root = typeof stored.root === "string" ? stored.root : "auto";
        const profile = normaliseLayoutProfile(stored.profiles[layoutProfileKey(direction, root)]);
        return { version: LAYOUT_CACHE_VERSION, key, locked: profile.locked, positions: profile.positions, routes: profile.routes, direction, root, engine: profile.engine, profiles: stored.profiles, graphSignature, cacheState: "migrated" };
      }
      const legacy = JSON.parse(localStorage.getItem(`bmopf-layout-v1:${key}`) || "null");
      if (legacy && legacy.version === 1 && legacy.key === key && legacy.locked && typeof legacy.locked === "object") {
        const direction = legacy.direction === "load-to-source" ? legacy.direction : "source-to-load";
        const root = typeof legacy.root === "string" ? legacy.root : "auto";
        const profileKey = layoutProfileKey(direction, root);
        const engine = normaliseLayoutEngine(legacy.engine);
        return { version: LAYOUT_CACHE_VERSION, key, locked: legacy.locked, positions: {}, routes: {}, direction, root, engine, profiles: { [profileKey]: { locked: legacy.locked, positions: {}, routes: {}, engine } }, graphSignature, cacheState: "migrated" };
      }
    } catch (_) { /* localStorage is optional in static reports */ }
    return defaults();
  }

  function saveLayout() {
    if (!state.layout?.key) return;
    try {
      const profileKey = layoutProfileKey(state.layout.direction, state.layout.root);
      const graphSignature = layoutGraphSignature();
      const engine = normaliseLayoutEngine(state.layout.engine);
      const profiles = pruneLayoutProfiles({ ...(state.layout.profiles || {}), [profileKey]: { graphSignature, optionsSignature: profileKey, routeSpace: LAYOUT_ROUTE_SPACE, elkVersion: ELK_VERSION, locked: state.layout.locked || {}, positions: state.layout.positions || {}, routes: state.layout.routes || {}, engine, lastUsed: Date.now() } }, profileKey);
      state.layout.profiles = profiles;
      localStorage.setItem(`bmopf-layout-v3:${state.layout.key}`, JSON.stringify({ version: LAYOUT_CACHE_VERSION, key: state.layout.key, graphSignature, optionsSignature: profileKey, routeSpace: LAYOUT_ROUTE_SPACE, elkVersion: ELK_VERSION, direction: state.layout.direction, root: state.layout.root, profiles }));
    } catch (_) { /* ignore unavailable storage */ }
  }

  function switchLayoutProfile(direction, root) {
    const nextDirection = direction === "load-to-source" ? direction : "source-to-load";
    const nextRoot = typeof root === "string" && root ? root : "auto";
    const profile = normaliseLayoutProfile(state.layout.profiles?.[layoutProfileKey(nextDirection, nextRoot)]);
    state.layout.direction = nextDirection;
    state.layout.root = nextRoot;
    state.layout.locked = profile.locked;
    state.layout.positions = profile.positions;
    state.layout.routes = profile.routes;
    state.layout.engine = profile.engine;
    saveLayout();
  }

  let elkBusy = false;
  function elkErrorMessage(error) {
    return error && error.message ? String(error.message) : String(error || "unknown error");
  }
  // The vendored elk.bundled.js only supports main-thread use: loaded inside a
  // worker its internal shim fails with "_Worker is not a constructor", so every
  // context (source, dist/, generated report, file://) lays out on this thread.
  function layoutWithElk(graph) {
    return loadElkMainThread().then(() => new globalThis.ELK().layout(graph));
  }

  function loadElkMainThread() {
    if (typeof globalThis.ELK === "function") return Promise.resolve();
    const embeddedBundle = typeof globalThis.__BMOPF_ELK_BUNDLE_SOURCE__ === "string" ? globalThis.__BMOPF_ELK_BUNDLE_SOURCE__ : null;
    if (embeddedBundle) {
      // Generated reports inline the bundle so layout works without a network.
      const inline = document.createElement("script");
      inline.dataset.bmopfElk = "true";
      inline.textContent = embeddedBundle;
      document.head.appendChild(inline);
      return typeof globalThis.ELK === "function"
        ? Promise.resolve()
        : Promise.reject(new Error("The embedded ELK bundle did not define ELK."));
    }
    const existing = document.querySelector("script[data-bmopf-elk]");
    if (existing) return new Promise((resolve, reject) => { existing.addEventListener("load", resolve, { once: true }); existing.addEventListener("error", () => reject(new Error("The local ELK bundle could not be loaded.")), { once: true }); });
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.dataset.bmopfElk = "true";
      script.src = new URL("vendor/elk.bundled.js", document.baseURI).href;
      script.onload = resolve;
      script.onerror = () => reject(new Error("The local ELK bundle could not be loaded."));
      document.head.appendChild(script);
    });
  }

  async function applyElkLayout() {
    if (!state.index || state.view !== "single") return;
    if (elkBusy) return;
    elkBusy = true;
    const layoutIndex = state.index, activeLayout = state.layout, selection = state.selected;
    setStatus("Loading ELK layered layout…");
    try {
      const direction = state.layout.direction === "load-to-source" ? "LEFT" : "RIGHT";
      const graph = { id: "bmopf-root", layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction, "elk.edgeRouting": "ORTHOGONAL", "elk.spacing.nodeNode": "64", "elk.layered.spacing.nodeNodeBetweenLayers": "150" }, children: overviewBuses().map((bus) => ({ id: `bus:${bus.ref.id}`, width: 84, height: 24, ports: [{ id: `port:${bus.ref.id}`, width: 4, height: 4, layoutOptions: { "elk.port.side": state.layout.direction === "load-to-source" ? "EAST" : "WEST" } }] })), edges: [] };
      const busIds = new Set(overviewBuses().map((bus) => bus.ref.id));
      if (state.layout.root && state.layout.root !== "auto" && busIds.has(state.layout.root)) {
        graph.layoutOptions["org.eclipse.elk.processingOrder.rootSelection"] = "FIXED";
        graph.layoutOptions["org.eclipse.elk.processingOrder.preferredRoot"] = `bus:${state.layout.root}`;
      }
      overviewAssets().forEach((item) => {
        (item.connections || []).forEach((connection) => {
          const from = connection.from.busId; const to = connection.to.busId;
          if (busIds.has(from) && busIds.has(to)) graph.edges.push({ id: `edge:${item.ref.kind}:${item.ref.id}:${from}:${to}`, sources: [`port:${from}`], targets: [`port:${to}`] });
        });
      });
      const result = await layoutWithElk(graph);
      if (state.index !== layoutIndex || state.layout !== activeLayout || state.selected !== selection) return;
      const children = result.children || [];
      const xs = children.map((node) => Number(node.x) || 0); const ys = children.map((node) => Number(node.y) || 0);
      const minX = Math.min(...xs, 0); const maxX = Math.max(...xs, 1); const minY = Math.min(...ys, 0); const maxY = Math.max(...ys, 1);
      const scale = 1;
      const nextLocked = {};
      const projectPoint = (point) => [70 + ((Number(point.x) - minX + 42) * scale), 70 + ((Number(point.y) - minY + 12) * scale)];
      children.forEach((node) => {
        const id = String(node.id).replace(/^bus:/, "");
        nextLocked[id] = projectPoint(node);
      });
      const nextRoutes = {};
      (result.edges || []).forEach((edge) => {
        const points = [];
        (edge.sections || []).forEach((section) => {
          [section.startPoint, ...(section.bendPoints || []), section.endPoint].forEach((point) => {
            if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
            const projected = projectPoint(point);
            const previous = points[points.length - 1];
            if (!previous || previous[0] !== projected[0] || previous[1] !== projected[1]) points.push(projected);
          });
        });
        if (points.length >= 2) nextRoutes[String(edge.id)] = points;
      });
      state.layout.locked = nextLocked; state.layout.routes = nextRoutes; state.layout.engine = "elk"; saveLayout(); renderView(); renderCameraControls();
      setStatus(`ELK layered layout applied to ${children.length} buses; positions are now locally persisted.`);
    } catch (error) {
      setStatus(`ELK layout unavailable: ${elkErrorMessage(error)}`);
      state.layout.engine = "deterministic";
    } finally {
      elkBusy = false;
    }
  }

  function applyStressLayout() {
    if (!state.index || state.view !== "single") return;
    const positions = (overviewScope() ? focusedLayout : deterministicLayout).singleStressPositions();
    const nextLocked = overviewScope() ? { ...state.layout.locked } : {};
    positions.forEach((point, id) => { if (Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) nextLocked[id] = [...point]; });
    state.layout.locked = nextLocked;
    state.layout.routes = {};
    state.layout.engine = "stress";
    saveLayout();
    renderView();
    renderCameraControls();
    setStatus(`Stress layout applied to ${positions.size} buses; positions are now locally persisted.`);
  }

  function layoutLocked(id) { return Array.isArray(state.layout?.locked?.[id]); }

  function renderDisplayOptions() {
    const pane = $("display-options");
    if (!pane) return;
    const visible = Boolean(state.index && state.view === "single" && !$("canvas").querySelector(".network-directory"));
    pane.hidden = !visible;
    if (!visible) return;
    pane.querySelectorAll("[data-display-option]").forEach((input) => {
      const option = input.dataset.displayOption;
      const defaultValue = option === "showBusLabels";
      input.checked = state.singleDisplay?.[option] ?? defaultValue;
      input.onchange = () => {
        state.singleDisplay[option] = input.checked;
        renderView();
        renderDisplayOptions();
        renderFloatingLegend();
      };
    });
  }

  function layoutElementKey(ref) { return `${ref.kind}:${ref.id}`; }

  function singleElementPosition(item, fallback) {
    const point = state.layout?.positions?.[layoutElementKey(item?.ref || {})];
    return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) ? point : fallback;
  }

  function saveSingleElementPosition(item, point) {
    if (!item || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return;
    state.layout.locked ||= {};
    state.layout.positions ||= {};
    if (item.ref.kind === "bus") state.layout.locked[item.ref.id] = [...point];
    else state.layout.positions[layoutElementKey(item.ref)] = [...point];
    state.layout.engine = "deterministic";
    state.layout.routes = {};
    saveLayout();
  }

  function nudgeSelectedBus(dx, dy) {
    const item = itemFor(state.selected);
    if (!item || item.ref.kind !== "bus") return;
    const positions = singlePositions(); const current = positions.get(item.ref.id); if (!current) return;
    state.layout.locked[item.ref.id] = [current[0] + dx, current[1] + dy];
    state.layout.routes = {};
    state.layout.engine = "deterministic";
    saveLayout(); renderView(); renderCameraControls();
  }

  function resetLayout() {
    state.layout = { version: LAYOUT_CACHE_VERSION, key: layoutKey(), locked: {}, positions: {}, routes: {}, direction: "source-to-load", root: "auto", engine: "deterministic", profiles: {} };
    saveLayout();
    renderView(); renderCameraControls();
    setStatus("Single-line layout reset to the computed source-to-load arrangement.");
  }

  function bindLayoutControls() {
    document.querySelectorAll("[data-layout]").forEach((button) => button.addEventListener("click", () => {
      const item = itemFor(state.selected);
      if (button.dataset.layout === "reset") { resetLayout(); return; }
      if (button.dataset.layout === "elk") { applyElkLayout(); return; }
      if (button.dataset.layout === "stress") { applyStressLayout(); return; }
      if (!item || item.ref.kind !== "bus") return;
      if (button.dataset.layout === "lock") {
        const point = singlePositions().get(item.ref.id); if (point) state.layout.locked[item.ref.id] = [...point];
      } else if (button.dataset.layout === "unlock") delete state.layout.locked[item.ref.id];
      else if (button.dataset.layout === "left") nudgeSelectedBus(-12, 0);
      else if (button.dataset.layout === "right") nudgeSelectedBus(12, 0);
      else if (button.dataset.layout === "up") nudgeSelectedBus(0, -12);
      else if (button.dataset.layout === "down") nudgeSelectedBus(0, 12);
      saveLayout(); renderView(); renderCameraControls();
    }));
  }

  function availableExamples() {
    return Array.isArray(globalThis.BMOPFExamples) ? globalThis.BMOPFExamples : [];
  }

  function populateExamples() {
    const select = $("example-select");
    if (!select) return;
    select.innerHTML = '<option value="">Choose a case</option>' + availableExamples()
      .map((example) => `<option value="${escapeHtml(example.id)}" title="${escapeHtml(example.description || "")}">${escapeHtml(example.label || example.id)}</option>`).join("");
    select.addEventListener("change", (event) => { if (event.target.value) loadExample(event.target.value); });
  }

  function loadExample(id) {
    const example = availableExamples().find((candidate) => candidate.id === id);
    if (!example) return;
    state.selected = null;
    state.result = null;
    state.resultLabel = "";
    state.resultError = "";
    state.resultCompare = null;
    state.resultCompareLabel = "";
    state.resultCompareError = "";
    state.resultScenario = null;
    state.query = "";
    state.searchFocus = -1;
    state.activeKind = null;
    state.diagnosticsQuery = "";
    state.diagnosticsSeverity = "all";
    loadDocument(example.case, example.label || example.id);
    setStatus(`${example.label || example.id} loaded. ${example.description || ""}`);
  }

  function renderSummary() {
    const index = state.index;
    if (!index) {
      $("case-summary").className = "panel empty-panel";
      $("case-summary").textContent = "Open a case to begin exploring it.";
      return;
    }
    const stats = [
      [index.buses.length, "buses"],
      [index.assets.length - index.buses.length, "devices"],
      [index.coordinateCount, "mapped buses"],
      [index.componentCount, "connected networks"]
    ];
    const warningHtml = index.warnings.length
      ? `<ul class="warnings">${index.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : "";
    const report = globalThis.__BMOPF_REPORT_META__;
    const reportHtml = report ? `<p class="report-meta">Report ${escapeHtml(report.app_version || "unknown")} · layout ${escapeHtml(report.layout_engine || "unknown")} · fingerprint <code>${escapeHtml(String(report.case_fingerprint || "").slice(0, 12))}</code></p>` : "";
    const support = index.supportCounts || {};
    const supportHtml = `<p class="support-meta">Support: ${support.full || 0} full · ${support.focused || 0} focused · ${support["raw-only"] || 0} raw-only</p>`;
    const coordinateProvenance = index.raw?.meta?.coordinate_provenance;
    const coordinateHtml = coordinateProvenance ? `<p class="report-meta">Coordinate provenance: ${escapeHtml(coordinateProvenance)}</p>` : "";
    const budget = overviewBudget();
    const budgetHtml = state.view === "geo" ? `<p class="budget-meta">Regional map · bounded geographic groups; zoom to inspect connections.</p>` : budget.over && state.largeCaseDecision !== "full"
      ? `<p class="budget-warning"><strong>Focused overview mode</strong> · ${escapeHtml(budget.message)} Select an asset to render its one-hop context.</p>`
      : budget.over ? `<p class="budget-meta"><strong>Full overview enabled</strong> · ${escapeHtml(budget.message)}</p>`
      : `<p class="budget-meta">Overview budget: ${budget.elements.toLocaleString()} estimated SVG elements of ${budget.limit.toLocaleString()}.</p>`;
    const largeCasePrompt = state.view === "geo" ? "" : budget.over && state.largeCaseDecision === "pending"
      ? `<div id="large-case-dialog" class="large-case-dialog" role="dialog" aria-labelledby="large-case-title"><strong id="large-case-title">This is a large case</strong><p>${escapeHtml(budget.message)} Rendering the full geospatial or single-wire overview may be slow in this browser.</p><label><input id="large-case-bypass" type="checkbox"> Continue without asking again while this page remains open</label><div class="large-case-actions"><button id="large-case-continue">Render full overview</button><button id="large-case-focused">Keep focused view</button></div></div>`
      : budget.over && state.largeCaseDecision === "focused"
        ? `<div class="large-case-dialog"><strong>Focused overview enabled</strong><p>Full overview rendering is paused for this case.</p><button id="large-case-continue">Render full overview</button></div>` : "";
    $("case-summary").className = "panel";
    $("case-summary").innerHTML = `<div class="panel-heading"><h2>${escapeHtml(index.name)}</h2><span class="muted">${index.schema ? "schema" : "JSON"}</span></div><div class="stats">${stats.map(([n, label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join("")}</div>${supportHtml}${coordinateHtml}${budgetHtml}${largeCasePrompt}${reportHtml}${warningHtml}`;
    $("case-summary").querySelector("#large-case-bypass")?.addEventListener("change", (event) => { state.largeCaseBypass = event.target.checked; });
    $("case-summary").querySelector("#large-case-continue")?.addEventListener("click", () => {
      if ($("case-summary").querySelector("#large-case-bypass")?.checked) state.largeCaseBypass = true;
      state.largeCaseDecision = "full";
      render();
    });
    $("case-summary").querySelector("#large-case-focused")?.addEventListener("click", () => { state.largeCaseDecision = "focused"; render(); });
  }

  function overviewBudget() {
    const buses = state.index?.buses.length || 0;
    const assets = state.index?.assets.length || 0;
    const elements = buses * 3 + assets * 5;
    const limit = 5000;
    const over = buses > 500 || elements > limit;
    const message = buses > 500
      ? `${buses.toLocaleString()} buses exceed the 500-bus overview guidance.`
      : `${elements.toLocaleString()} estimated SVG elements exceed the ${limit.toLocaleString()}-element guidance.`;
    return { buses, assets, elements, limit, over, message };
  }

  function renderClassOverview() {
    const panel = $("class-overview");
    if (!state.index) { panel.innerHTML = ""; return; }
    const groups = new Map();
    state.index.assets.forEach((item) => {
      if (!groups.has(item.ref.kind)) groups.set(item.ref.kind, []);
      groups.get(item.ref.kind).push(item);
    });
    const range = (values) => {
      const numbers = values.filter(Number.isFinite);
      if (!numbers.length) return "—";
      const min = Math.min(...numbers); const max = Math.max(...numbers);
      return min === max ? formatValue(min) : `${formatValue(min)}–${formatValue(max)}`;
    };
    const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, items]) => {
      const support = { full: 0, focused: 0, "raw-only": 0 };
      items.forEach((item) => { support[item.support] = (support[item.support] || 0) + 1; });
      const loading = items.map((item) => resultScalar(item, "loading"));
      const voltage = items.map((item) => resultVoltageDeviation(item));
      const resultRange = state.result ? `load ${range(loading)} · ΔV ${range(voltage)}` : "—";
      return `<tr><th><button class="class-filter ${state.activeKind === kind ? "selected" : ""}" data-kind-filter="${escapeHtml(kind)}">${escapeHtml(kind.replaceAll("_", " "))}</button></th><td>${items.length}</td><td>${support.full || 0}/${support.focused || 0}/${support["raw-only"] || 0}</td><td>${escapeHtml(resultRange)}</td></tr>`;
    }).join("");
    panel.innerHTML = `<div class="panel-heading"><h2>Class overview</h2><span class="muted">full / focused / raw</span></div><p class="support-meta">Support counts renderer coverage in this view: <strong>full</strong> = overview and focused, <strong>focused</strong> = selected-detail view, <strong>partial</strong> = some semantics, <strong>raw-only</strong> = inspector only.</p><table class="property-table class-overview-table resizable-table" data-resizable-table="class-overview"><thead><tr><th>class</th><th>count</th><th title="Renderer coverage: full / focused / partial / raw-only">support</th><th>result ranges</th></tr></thead><tbody>${rows}</tbody></table>`;
    bindResizableTable(panel.querySelector(".resizable-table"));
    panel.querySelectorAll("[data-kind-filter]").forEach((button) => button.addEventListener("click", () => {
      state.activeKind = state.activeKind === button.dataset.kindFilter ? null : button.dataset.kindFilter;
      state.query = ""; renderInventory(); renderClassOverview(); renderView();
    }));
  }

  function resultRoot() { return state.result ? globalThis.BMOPFModel.resultRoot(state.result) : null; }

  function resultMetadata() {
    const root = resultRoot();
    if (!root) return {};
    const info = root.solution_info || root.solution || root.profile || {};
    return {
      objective: root.objective ?? root.objective_value ?? info.objective,
      status: root.termination_status ?? root.status ?? info.termination_status ?? info.status,
      solver: root.solver ?? info.solver,
      scenarios: globalThis.BMOPFModel.resultScenarios(state.result)
    };
  }

  function allDiagnosticsForView() {
    return state.result ? globalThis.BMOPFModel.resultDiagnostics(state.result, state.resultScenario) : [];
  }

  function diagnosticsForView() {
    const query = state.diagnosticsQuery.trim().toLowerCase();
    return allDiagnosticsForView().filter((diagnostic) => {
      const severity = ["error", "warning", "info"].includes(diagnostic.severity) ? diagnostic.severity : "warning";
      if (state.diagnosticsSeverity !== "all" && severity !== state.diagnosticsSeverity) return false;
      if (!query) return true;
      return [diagnostic.message, diagnostic.category, diagnostic.kind, diagnostic.id]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }

  function resultIdentity() {
    const root = resultRoot();
    const embeddedCase = state.result ? globalThis.BMOPFModel.resultCase(state.result) : null;
    return root?.case_fingerprint ?? root?.meta?.case_fingerprint ?? root?.case_id ?? root?.meta?.case_id ?? embeddedCase?.meta?.case_fingerprint ?? embeddedCase?.meta?.case_id ?? null;
  }

  function resultFingerprint() {
    const root = resultRoot();
    const embeddedCase = state.result ? globalThis.BMOPFModel.resultCase(state.result) : null;
    return root?.case_fingerprint ?? root?.meta?.case_fingerprint ?? embeddedCase?.meta?.case_fingerprint ?? null;
  }

  function openCaseFingerprint() {
    return globalThis.__BMOPF_REPORT_META__?.case_fingerprint ?? state.index?.raw?.meta?.case_fingerprint ?? null;
  }

  function resultRecordFor(item) {
    return state.result ? globalThis.BMOPFModel.resultRecord(state.result, item.ref.kind, item.ref.id, state.resultScenario) : null;
  }

  function comparisonRecordFor(item) {
    return state.resultCompare ? globalThis.BMOPFModel.resultRecord(state.resultCompare, item.ref.kind, item.ref.id, state.resultScenario) : null;
  }

  function scalarResultValue(value) {
    if (Array.isArray(value)) {
      const numbers = value.map(Number).filter(Number.isFinite);
      return numbers.length === 1 ? numbers[0] : null;
    }
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function comparisonDelta(current, comparison) {
    const a = scalarResultValue(current); const b = scalarResultValue(comparison);
    return a === null || b === null ? null : a - b;
  }

  function resultStatus(item) {
    const record = resultRecordFor(item);
    if (!record || typeof record !== "object" || Array.isArray(record)) return item.status;
    if (record.open_switch === true) return "open";
    if (record.in_service === false || record.status === 0) return "out_of_service";
    if (typeof record.status === "string") {
      const status = record.status.toLowerCase().replace(/[ -]+/g, "_");
      if (["open", "out_of_service", "outofservice", "offline"].includes(status)) return ["out_of_service", "outofservice", "offline"].includes(status) ? "out_of_service" : status;
    }
    return item.status;
  }

  function resultVoltageDeviation(item) {
    const record = resultRecordFor(item);
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    const explicit = ["voltage_deviation", "vm_deviation", "v_deviation", "voltage_error"]
      .map((key) => Number(record[key])).find(Number.isFinite);
    if (explicit !== undefined) return Math.abs(explicit);
    const values = [record.vm, record.v_magnitude, record.voltage_magnitude]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map(Number).filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length || values.some((value) => value > 2.5)) return null;
    return Math.max(...values.map((value) => Math.abs(value - 1)));
  }

  function resultVoltageVisual(item, selected, fallback) {
    const deviation = resultVoltageDeviation(item);
    if (deviation === null) return { colour: fallback, width: selected ? 4 : 2, dash: "", deviation: null, level: null };
    const level = deviation >= .05 ? "high" : deviation >= .02 ? "moderate" : "nominal";
    const colour = level === "high" ? "#b64035" : level === "moderate" ? "#c28a26" : "#4a8f5f";
    return { colour, width: selected ? 4 : 2, dash: level === "high" ? "6 3" : level === "moderate" ? "2 3" : "", deviation, level };
  }

  function resultPairingStatus() {
    const identity = resultIdentity();
    const fingerprint = resultFingerprint();
    const expectedFingerprint = openCaseFingerprint();
    if (fingerprint && expectedFingerprint) {
      if (String(fingerprint) === String(expectedFingerprint)) {
        return { kind: "matched", label: "matched", identity, message: "Cryptographic case fingerprints match." };
      }
      return { kind: "mismatch", label: "mismatch", identity, message: "Cryptographic case fingerprints differ. Metrics are shown, but pairing should be reviewed." };
    }
    if (fingerprint || expectedFingerprint) {
      return {
        kind: "unverified",
        label: "unverified",
        identity,
        message: fingerprint ? "The result provides a fingerprint, but the open case fingerprint is unavailable." : "The open report provides a fingerprint, but this result does not."
      };
    }
    const expectedIdentity = state.index?.raw?.meta?.case_fingerprint || state.index?.raw?.meta?.case_id || state.index?.name || null;
    if (!identity || !expectedIdentity) {
      return {
        kind: "unverified",
        label: "unverified",
        identity,
        message: "No comparable case fingerprint or case ID is available. Treat this sidecar as unverified."
      };
    }
    if (String(identity) === String(expectedIdentity)) {
      return { kind: "matched", label: "matched", identity, message: `Result identity matches open case ${expectedIdentity}.` };
    }
    return {
      kind: "mismatch",
      label: "mismatch",
      identity,
      message: `Result identity ${identity} does not match open case ${expectedIdentity}. Metrics are shown, but pairing should be reviewed.`
    };
  }

  function comparisonPairingStatus() {
    const root = state.resultCompare ? globalThis.BMOPFModel.resultRoot(state.resultCompare) : null;
    const fingerprint = root?.case_fingerprint ?? root?.meta?.case_fingerprint ?? null;
    const expectedFingerprint = openCaseFingerprint() || resultFingerprint();
    if (fingerprint && expectedFingerprint) return String(fingerprint) === String(expectedFingerprint)
      ? { kind: "matched", label: "matched", message: "Comparison uses the same case fingerprint." }
      : { kind: "mismatch", label: "mismatch", message: "Comparison case fingerprint differs from the primary result/open case." };
    const identity = root?.case_id ?? root?.meta?.case_id ?? null;
    const expectedIdentity = state.index?.raw?.meta?.case_id || state.index?.name || resultIdentity();
    if (identity && expectedIdentity) return String(identity) === String(expectedIdentity)
      ? { kind: "matched", label: "matched", message: "Comparison case identity matches the primary result/open case." }
      : { kind: "mismatch", label: "mismatch", message: "Comparison case identity differs from the primary result/open case." };
    return { kind: "unverified", label: "unverified", message: "Comparison does not provide a comparable case identity." };
  }

  function resultTooltip(item) {
    if (!state.result) return "";
    const record = resultRecordFor(item);
    if (!record || typeof record !== "object" || Array.isArray(record)) return "";
    const keys = ["vm", "va", "v_magnitude", "v_angle", "voltage_deviation", "vm_deviation", "v_deviation", "p", "q", "pg", "qg", "loading", "status", "in_service", "residual"];
    const values = Object.entries(record).filter(([key]) => keys.includes(key) || key.endsWith("_loading") || key.endsWith("_residual"));
    const extras = [];
    const deviation = resultVoltageDeviation(item);
    if (deviation !== null && !values.some(([key]) => ["voltage_deviation", "vm_deviation", "v_deviation"].includes(key))) extras.push(`voltage deviation=${formatValue(deviation)}`);
    const status = resultStatus(item);
    if (status !== item.status) extras.push(`state=${status}`);
    return values.length || extras.length ? ` · result ${values.slice(0, 3).concat(extras.map((value) => ["", value])).map(([key, value]) => key ? `${key}=${formatValue(value)}` : value).join(", ")}` : "";
  }

  function resultScalar(item, key) {
    if (!state.result) return null;
    const record = resultRecordFor(item);
    const value = record && typeof record === "object" ? record[key] : null;
    if (Array.isArray(value)) {
      const numbers = value.map(Number).filter(Number.isFinite);
      return numbers.length ? Math.max(...numbers) : null;
    }
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function resultVisual(item, selected, fallback) {
    const loading = ["line", "transformer"].includes(item.ref.kind) ? resultScalar(item, "loading") : null;
    if (loading === null || loading < 0 || loading > 1) return { colour: fallback, width: selected ? 6 : 3, loading: null };
    const colour = loading >= .9 ? "#b64035" : loading >= .7 ? "#c28a26" : "#4a8f5f";
    return { colour, width: selected ? 7 : 3 + loading * 3, loading };
  }

  function resultLegend() {
    const hasLoading = state.result && visibleAssets().some((item) => resultScalar(item, "loading") !== null);
    const hasVoltage = state.result && state.index.buses.some((item) => resultVoltageDeviation(item) !== null);
    const hasState = state.result && visibleAssets().some((item) => resultStatus(item) !== item.status || ["open", "out_of_service"].includes(item.status));
    if (!hasLoading && !hasVoltage && !hasState) return "";
    const rows = [];
    if (hasLoading) rows.push(`<text x="0" y="0" fill="#70695f" font-size="11">Result loading (normalised)</text><line x1="0" y1="13" x2="28" y2="13" stroke="#4a8f5f" stroke-width="3"/><text x="36" y="17" fill="#70695f" font-size="10">&lt; 0.70</text><line x1="92" y1="13" x2="120" y2="13" stroke="#c28a26" stroke-width="5"/><text x="128" y="17" fill="#70695f" font-size="10">0.70–0.90</text><line x1="205" y1="13" x2="233" y2="13" stroke="#b64035" stroke-width="6"/><text x="241" y="17" fill="#70695f" font-size="10">&gt; 0.90</text>`);
    if (hasVoltage) rows.push(`<text x="0" y="42" fill="#70695f" font-size="11">Bus voltage deviation</text><circle cx="9" cy="55" r="6" fill="#fffdf9" stroke="#4a8f5f" stroke-width="2"/><text x="21" y="59" fill="#70695f" font-size="10">nominal</text><circle cx="92" cy="55" r="6" fill="#fffdf9" stroke="#c28a26" stroke-width="2" stroke-dasharray="2 3"/><text x="104" y="59" fill="#70695f" font-size="10">moderate</text><circle cx="205" cy="55" r="6" fill="#fffdf9" stroke="#b64035" stroke-width="2" stroke-dasharray="6 3"/><text x="217" y="59" fill="#70695f" font-size="10">high</text>`);
    if (hasState) rows.push(`<text x="0" y="84" fill="#70695f" font-size="11">Operating state</text><line x1="0" y1="97" x2="28" y2="97" stroke="#70695f" stroke-width="3" stroke-dasharray="8 6"/><text x="36" y="101" fill="#70695f" font-size="10">open</text><line x1="92" y1="97" x2="120" y2="97" stroke="#70695f" stroke-width="3" opacity=".35"/><text x="128" y="101" fill="#70695f" font-size="10">out of service</text>`);
    return `<g transform="translate(20 18)" aria-label="Result visualisation legend">${rows.join("")}</g>`;
  }

  function floatingLegendHtml() {
    const busSymbol = state.singleDisplay?.showBusBars === true
      ? `<span class="legend-line busbar"></span><span>busbar</span>`
      : `<span class="legend-bus-dot"></span><span>bus</span>`;
    const symbols = `<div class="floating-legend-section"><strong>Symbols</strong><div class="floating-legend-row">${busSymbol}</div><div class="floating-legend-row"><span>○</span><span>source or generator</span></div><div class="floating-legend-row"><span>paired coils</span><span>transformer</span></div><div class="floating-legend-row"><span>□</span><span>load</span></div><div class="floating-legend-row"><span>║</span><span>capacitor</span></div><div class="floating-legend-row"><span>⏚</span><span>shunt / grounding</span></div><div class="floating-legend-row"><span class="legend-line open"></span><span>open switch or interrupted path</span></div><p class="legend-note">A dashed leader marks a manually moved symbol. Hover or select an asset for its full tooltip.</p></div>`;
    const hasLoading = state.result && visibleAssets().some((item) => resultScalar(item, "loading") !== null);
    const hasVoltage = state.result && state.index.buses.some((item) => resultVoltageDeviation(item) !== null);
    const hasState = state.result && visibleAssets().some((item) => resultStatus(item) !== item.status || ["open", "out_of_service"].includes(item.status));
    if (!hasLoading && !hasVoltage && !hasState) return symbols;
    const result = `<div class="floating-legend-section"><strong>Result overlays</strong>${hasLoading ? `<div class="floating-legend-row"><span class="legend-line result-nominal"></span><span>loading &lt; 0.70</span></div><div class="floating-legend-row"><span class="legend-line result-moderate"></span><span>loading 0.70–0.90</span></div><div class="floating-legend-row"><span class="legend-line result-high"></span><span>loading &gt; 0.90</span></div>` : ""}${hasVoltage ? `<div class="floating-legend-row"><span class="legend-dot"></span><span>nominal voltage</span></div><div class="floating-legend-row"><span class="legend-dot moderate"></span><span>moderate voltage deviation</span></div><div class="floating-legend-row"><span class="legend-dot high"></span><span>high voltage deviation</span></div>` : ""}${hasState ? `<div class="floating-legend-row"><span class="legend-line open"></span><span>open</span></div><div class="floating-legend-row"><span class="legend-line" style="opacity:.35"></span><span>out of service</span></div>` : ""}</div>`;
    return symbols + result;
  }

  function renderFloatingLegend() {
    const panel = $("floating-legend");
    if (!panel) return;
    const visible = Boolean(state.index && state.view === "single" && !$("canvas").querySelector(".network-directory"));
    panel.hidden = !visible;
    if (!visible) return;
    const content = panel.querySelector(".floating-legend-content");
    if (content) content.innerHTML = floatingLegendHtml();
  }

  function renderResultSummary() {
    const panel = $("result-summary");
    if (!state.result) {
      panel.className = "panel empty-panel";
      panel.textContent = "No simulation or optimisation results attached.";
      return;
    }
    const meta = resultMetadata();
    const root = resultRoot();
    const caseInResult = globalThis.BMOPFModel.resultCase(state.result);
    const fields = [];
    if (meta.status !== undefined) fields.push(["status", meta.status]);
    if (meta.objective !== undefined) fields.push(["objective", meta.objective]);
    if (meta.solver !== undefined) fields.push(["solver", meta.solver]);
    if (meta.scenarios.length) fields.push(["scenarios", meta.scenarios.length]);
    if (state.result) fields.push(["diagnostics", allDiagnosticsForView().length]);
    if (state.resultCompare) fields.push(["comparison", state.resultCompareLabel || "attached"]);
    if (caseInResult) fields.push(["embedded case", "yes"]);
    const warning = state.resultError ? `<p class="result-warning">${escapeHtml(state.resultError)}</p>` : "";
    const scenarioNote = meta.scenarios.length > 1 && !state.resultScenario ? `<p class="result-warning">Choose a scenario before inspecting result metrics. No slice is silently chosen.</p>` : "";
    const scenarioControl = meta.scenarios.length > 1 ? `<label class="scenario-control">Scenario<select id="result-scenario"><option value="">Select a scenario</option>${meta.scenarios.map((scenario) => `<option value="${escapeHtml(scenario)}" ${state.resultScenario === scenario ? "selected" : ""}>${escapeHtml(scenario)}</option>`).join("")}</select></label>` : "";
    const selectedScenario = state.resultScenario ? `<p class="report-meta">active scenario <code>${escapeHtml(state.resultScenario)}</code></p>` : "";
    const pairing = resultPairingStatus();
    const identityHtml = pairing.identity ? `<p class="report-meta">case identity <code>${escapeHtml(String(pairing.identity))}</code></p>` : "";
    const pairingHtml = `<p class="pairing-status ${pairing.kind}"><strong>Pairing ${escapeHtml(pairing.label)}</strong> · ${escapeHtml(pairing.message)}</p>`;
    const comparison = state.resultCompare ? comparisonPairingStatus() : null;
    const comparisonHtml = state.resultCompare
      ? `<p class="comparison-note">Comparing selected metrics against <strong>${escapeHtml(state.resultCompareLabel || "comparison result")}</strong>. Numeric scalar deltas are shown as current − comparison.<br><span class="comparison-pairing ${comparison.kind}">Pairing ${escapeHtml(comparison.label)} · ${escapeHtml(comparison.message)}</span></p>${state.resultCompareError ? `<p class="result-warning">${escapeHtml(state.resultCompareError)}</p>` : ""}`
      : "";
    panel.className = "panel";
    panel.innerHTML = `<div class="panel-heading"><h2>Results</h2><span class="muted">${escapeHtml(state.resultLabel || "JSON")}</span></div>${scenarioControl}${selectedScenario}${fields.length ? `<table class="property-table result-table">${fields.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(formatValue(value))}</td></tr>`).join("")}</table>` : `<p class="muted result-empty">Result records attached; no run summary fields were found.</p>`}${identityHtml}${pairingHtml}${comparisonHtml}${scenarioNote}${warning}`;
    const scenarioSelect = $("result-scenario");
    if (scenarioSelect) scenarioSelect.addEventListener("change", (event) => { state.resultScenario = event.target.value || null; render(); });
  }

  function renderInventory() {
    const index = state.index;
    if (!index) { $("inventory").innerHTML = ""; return; }
    const rows = Object.entries(index.counts).sort(([a], [b]) => a.localeCompare(b));
    const query = state.query.trim().toLowerCase();
    const ranked = query ? index.assets.map((item) => {
      const id = item.ref.id.toLowerCase(); const kind = item.ref.kind.replaceAll("_", " ").toLowerCase();
      const buses = (item.ports || []).map((port) => port.busId.toLowerCase()).join(" ");
      const result = resultRecordFor(item); const resultKeys = result && typeof result === "object" ? Object.keys(result).join(" ").toLowerCase() : "";
      const text = `${kind} ${id} ${buses} ${resultKeys}`;
      let score = 99;
      if (id === query) score = 0;
      else if (id.startsWith(query)) score = 1;
      else if (kind === query) score = 2;
      else if (buses.split(" ").some((bus) => bus.startsWith(query))) score = 3;
      else if (text.includes(query)) score = 4;
      return { item, score };
    }).filter((entry) => entry.score < 99).sort((a, b) => a.score - b.score || a.item.ref.id.localeCompare(b.item.ref.id)).map((entry) => entry.item) : null;
    const filtered = ranked;
    const pageCount = filtered ? Math.ceil(filtered.length / SEARCH_PAGE_SIZE) : 0;
    state.searchPage = Math.max(0, Math.min(state.searchPage, pageCount - 1));
    const pageStart = state.searchPage * SEARCH_PAGE_SIZE;
    const pageRows = filtered?.slice(pageStart, pageStart + SEARCH_PAGE_SIZE);
    const body = filtered
      ? pageRows.map((item, offset) => { const i = pageStart + offset; return `<button class="inventory-row ${sameRef(item.ref, state.selected) ? "selected" : ""} ${state.searchFocus === i ? "focused" : ""}" data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}" role="option" aria-selected="${sameRef(item.ref, state.selected)}" aria-posinset="${i + 1}" aria-setsize="${filtered.length}"><span>${entityLabelHtml(item.ref.kind, item.ref.id)}</span><span class="count">›</span></button>`; }).join("")
      : rows.map(([kind, count]) => `<button class="inventory-row ${state.activeKind === kind ? "selected" : ""}" data-kind-filter="${escapeHtml(kind)}"><span class="kind">${escapeHtml(kind.replaceAll("_", " "))}</span><span class="count">${count}</span></button>`).join("");
    const resultNote = filtered ? `<p class="search-meta" role="status">${filtered.length} ranked match${filtered.length === 1 ? "" : "es"} · Showing ${filtered.length ? pageStart + 1 : 0}–${Math.min(pageStart + SEARCH_PAGE_SIZE, filtered.length)} · Enter opens the focused result</p>${pageCount > 1 ? `<div class="search-pages"><button id="search-previous" ${state.searchPage === 0 ? "disabled" : ""}>Previous matches</button><span> Page ${state.searchPage + 1} / ${pageCount} </span><button id="search-next" ${state.searchPage + 1 >= pageCount ? "disabled" : ""}>Next matches</button></div>` : ""}` : "";
    $("inventory").innerHTML = `<div class="panel-heading"><h2>Inventory</h2><input id="search" type="search" placeholder="Search assets, buses, or result fields" value="${escapeHtml(state.query)}" aria-label="Search assets, buses, or result fields" aria-controls="inventory-list" aria-autocomplete="list"></div>${resultNote}<div class="inventory-header" role="row"><span>asset / class</span><span class="inventory-column-resizer" role="separator" aria-orientation="vertical" aria-label="Resize inventory name column" tabindex="0" title="Drag to resize this column; use Arrow keys for precise sizing"></span><span>count</span></div><div id="inventory-list" class="inventory-list" role="listbox">${body || `<p class="muted" style="padding:12px 14px">No matching assets.</p>`}</div>`;
    $("search-previous")?.addEventListener("click", () => { state.searchPage--; state.searchFocus = -1; renderInventory(); });
    $("search-next")?.addEventListener("click", () => { state.searchPage++; state.searchFocus = -1; renderInventory(); });
    bindResizableInventory();
    const search = $("search");
    search.addEventListener("input", (event) => { state.query = event.target.value; state.searchFocus = -1; state.searchPage = 0; renderInventory(); $("search")?.focus(); });
    search.addEventListener("keydown", (event) => {
      if (!filtered?.length) return;
      if (event.key === "ArrowDown") { event.preventDefault(); state.searchFocus = Math.min(filtered.length - 1, (state.searchFocus < 0 ? pageStart - 1 : state.searchFocus) + 1); state.searchPage = Math.floor(state.searchFocus / SEARCH_PAGE_SIZE); renderInventory(); $("search")?.focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); state.searchFocus = Math.max(0, (state.searchFocus < 0 ? pageStart + 1 : state.searchFocus) - 1); state.searchPage = Math.floor(state.searchFocus / SEARCH_PAGE_SIZE); renderInventory(); $("search")?.focus(); }
      else if (event.key === "Enter") { event.preventDefault(); select(filtered[state.searchFocus >= 0 ? state.searchFocus : pageStart].ref); }
    });
    $("inventory").querySelectorAll("[data-kind-filter]").forEach((button) => button.addEventListener("click", () => {
      state.activeKind = state.activeKind === button.dataset.kindFilter ? null : button.dataset.kindFilter;
      state.query = "";
      renderInventory();
      renderView();
    }));
    $("inventory").querySelectorAll("[data-kind][data-id]").forEach((button) => button.addEventListener("click", () => select({ kind: button.dataset.kind, id: button.dataset.id })));
  }

  function sameRef(a, b) { return Boolean(a && b && a.kind === b.kind && a.id === b.id); }
  function visibleAssets() { return state.index.assets.filter((item) => !state.activeKind || item.ref.kind === state.activeKind); }

  function overviewScope() {
    const budget = overviewBudget();
    if (!budget.over || !state.selected) return null;
    const selected = itemFor(state.selected);
    if (!selected) return null;
    const buses = new Set(selected.ref.kind === "bus" ? [selected.ref.id] : (selected.ports || []).map((port) => port.busId));
    for (const busId of [...buses]) {
      for (const asset of state.index.byBus.get(busId) || []) for (const port of asset.ports || []) buses.add(port.busId);
    }
    return buses;
  }

  function overviewAssets() {
    const scope = overviewScope();
    if (!scope) return visibleAssets();
    const items = new Set();
    for (const id of scope) {
      const bus = state.index.busById.get(id); if (bus) items.add(bus);
      for (const asset of state.index.byBus.get(id) || []) items.add(asset);
    }
    const selected = itemFor(state.selected); if (selected) items.add(selected);
    return [...items].filter((item) => !state.activeKind || item.ref.kind === state.activeKind);
  }

  function overviewBuses() {
    const scope = overviewScope();
    if (!scope) return state.index.buses;
    for (const item of overviewAssets()) for (const port of item.ports || []) scope.add(port.busId);
    return [...scope].map((id) => state.index.busById.get(id)).filter(Boolean);
  }

  function neighbourhoodForBus(busId, hops) {
    const assets = []; const seenAssets = new Set(); const seenBuses = new Set([busId]);
    let frontier = new Set([busId]);
    for (let depth = 0; depth < hops; depth += 1) {
      const next = new Set();
      for (const currentBus of frontier) {
        for (const asset of state.index.byBus.get(currentBus) || []) {
          const key = `${asset.ref.kind}:${asset.ref.id}`;
          if (!seenAssets.has(key)) { seenAssets.add(key); assets.push(asset); }
          for (const port of asset.ports || []) {
            if (!seenBuses.has(port.busId)) { seenBuses.add(port.busId); next.add(port.busId); }
          }
        }
      }
      frontier = next;
    }
    return { assets, buses: seenBuses };
  }

  const deterministicLayout = globalThis.BMOPFLayouts?.createDeterministicLayout({
    getIndex: () => state.index,
    getLayout: () => state.layout
  });
  const modelSheets = globalThis.BMOPFModelSheets.createModelSheets({
    getIndex: () => state.index,
    getResult: resultRecordFor,
    getComparison: comparisonRecordFor,
    getResultContext: () => ({ attached: Boolean(state.result), comparing: Boolean(state.resultCompare), label: state.resultLabel, comparisonLabel: state.resultCompareLabel, scenario: state.resultScenario }),
    select: (ref) => select(ref),
    copy: copyToClipboard
  });
  function renderMultiHopControls() {
    $("multi-hop-controls").hidden = true;
    $("multi-hop-controls").innerHTML = "";
  }

  function renderInspector() {
    const item = itemFor(state.selected);
    $("selection-label").innerHTML = item ? entityLabelHtml(item.ref.kind, item.ref.id) : "Nothing selected";
    if (!item) { $("inspector").innerHTML = `<p class="muted">Select a bus or asset in a view or in the inventory.</p>`; return; }
    const record = item.sourceRecord || {};
    const supportNote = item.support === "full" ? "Fully rendered in overview and focused views." : item.support === "focused" ? "Rendered in focused multi-wire view; overview topology stays explicit." : item.support === "partial" ? "Partially rendered; inspect raw properties for unsupported semantics." : "Preserved for inspection; no diagram renderer is currently available.";
    const keys = Object.keys(record).sort();
    const related = [];
    for (const p of item.ports || []) related.push({ kind: "bus", id: p.busId });
    if (item.ref.kind === "bus") {
      for (const incident of state.index.byBus.get(item.ref.id) || []) {
        related.push({ kind: incident.ref.kind, id: incident.ref.id });
      }
    }
    for (const key of ["linecode", "line_geometry", "control_profile", "time_series", "wire_data"]) {
      if (typeof record[key] === "string") related.push({ kind: key, id: record[key] });
    }
    const uniqueRelated = related.filter((ref, i, all) => all.findIndex((candidate) => candidate.kind === ref.kind && candidate.id === ref.id) === i && itemFor(ref));
    const relatedHtml = uniqueRelated.length ? `<h3>Related</h3><div class="related">${uniqueRelated.map((r) => `<button class="link-button" data-related-kind="${escapeHtml(r.kind)}" data-related-id="${escapeHtml(r.id)}">${entityLabelHtml(r.kind, r.id)}</button>`).join("")}</div>` : "";
    const portHtml = item.ports?.length ? `<h3>Ports</h3><table class="property-table">${item.ports.map((p) => { const role = p.role || p.id; const value = `${p.busId} · [${p.terminals.join(", ")}]`; return `<tr><th>${escapeHtml(role)}</th><td><span class="copyable-value-text">${escapeHtml(value)}</span>${copyButton(`${role}: ${value}`, `Copy ${role} port`)}</td></tr>`; }).join("")}</table>` : "";
    const result = state.result ? resultRecordFor(item) : null;
    const comparison = state.resultCompare ? comparisonRecordFor(item) : null;
    const resultKeys = ["vm", "va", "v_magnitude", "v_angle", "voltage_deviation", "vm_deviation", "v_deviation", "p", "q", "pg", "qg", "loading", "status", "in_service", "residual"];
    const resultEntries = result && typeof result === "object" ? Object.entries(result).filter(([key]) => resultKeys.includes(key) || key.endsWith("_loading") || key.endsWith("_residual")) : [];
    const comparisonEntries = comparison && typeof comparison === "object" ? Object.entries(comparison).filter(([key]) => resultKeys.includes(key) || key.endsWith("_loading") || key.endsWith("_residual")) : [];
    const metricKeys = [...new Set([...resultEntries.map(([key]) => key), ...comparisonEntries.map(([key]) => key)])];
    const comparisonHeader = state.resultCompare ? `<tr><th>metric</th><th>current</th><th>comparison</th><th>Δ</th></tr>` : "";
    const metricRows = metricKeys.map((key) => {
      const current = result?.[key]; const other = comparison?.[key]; const delta = comparisonDelta(current, other);
      const unitContext = { kind: item.ref.kind, source: "result" };
      const currentText = current === undefined ? "—" : formatInspectorValue(current, key, unitContext);
      const otherText = other === undefined ? "—" : formatInspectorValue(other, key, unitContext);
      const deltaText = delta === null ? "—" : formatInspectorValue(delta, key, unitContext);
      const rowText = state.resultCompare ? `${key}\tcurrent: ${currentText}\tcomparison: ${otherText}\tΔ: ${deltaText}` : `${key}: ${currentText}`;
      return `<tr><th>${escapeHtml(key)}${copyButton(rowText, `Copy ${key} result row`)}</th><td>${escapeHtml(currentText)}</td>${state.resultCompare ? `<td>${escapeHtml(otherText)}</td><td>${escapeHtml(deltaText)}</td>` : ""}</tr>`;
    }).join("");
    const resultColspan = state.resultCompare ? 4 : 2;
    const comparisonRaw = state.resultCompare ? `<details class="copyable-details"><summary>Raw comparison record ${copyTargetButton("Copy raw comparison record")}</summary><pre class="raw comparison-raw"></pre></details>` : "";
    const resultHtml = state.result ? (result ? `<h3 class="result-heading">Simulation / optimisation result${state.resultCompare ? " · comparison" : ""}</h3><table class="property-table result-table">${comparisonHeader}${metricRows || `<tr><td colspan="${resultColspan}" class="muted">No recognised metrics were found for this record.</td></tr>`}</table><details class="copyable-details"><summary>Raw result record ${copyTargetButton("Copy raw result record")}</summary><pre class="raw result-raw"></pre></details>${comparisonRaw}` : `<p class="muted result-missing">No result record found for this asset.</p>`) : "";
    const unitContext = { kind: item.ref.kind, source: "case" };
    const propertyRows = keys.map((key) => { const value = formatInspectorValue(record[key], key, unitContext); return `<tr><th>${escapeHtml(key)}</th><td><span class="copyable-value-text">${escapeHtml(value)}</span>${copyButton(`${key}: ${value}`, `Copy ${key} property`)}</td></tr>`; }).join("");
    $("inspector").innerHTML = `<h3>${entityLabelHtml(item.ref.kind, item.ref.id)}</h3><p class="muted">status: ${escapeHtml(item.status)} · support: ${escapeHtml(item.support || "raw-only")}</p><p class="support-note">${escapeHtml(supportNote)}</p><p class="support-note inspector-units-note">Physical quantities are displayed in SI base units (without automatic scaling); voltage-source angles use radians and geographic coordinates use degrees. Legacy result angle units require source evidence. Unknown fields remain in their source form.</p>${relatedHtml}${portHtml}${resultHtml}<h3 style="margin-top:14px">Properties</h3><table class="property-table">${propertyRows}</table><details class="copyable-details"><summary>Raw record ${copyTargetButton("Copy raw component record")}</summary><pre class="raw component-raw"></pre></details>`;
    $("inspector").querySelector(".component-raw").textContent = JSON.stringify(record, null, 2);
    const resultRaw = $("inspector").querySelector(".result-raw");
    if (resultRaw) resultRaw.textContent = JSON.stringify(result, null, 2);
    const comparisonRawNode = $("inspector").querySelector(".comparison-raw");
    if (comparisonRawNode) comparisonRawNode.textContent = JSON.stringify(comparison, null, 2);
    $("inspector").querySelectorAll("[data-related-kind]").forEach((button) => button.addEventListener("click", () => select({ kind: button.dataset.relatedKind, id: button.dataset.relatedId })));
    bindCopyButtons($("inspector"));
  }

  function formatValue(value) {
    if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  // Inspector values use the BMOPF convention of SI base units. The mapping is
  // deliberately conservative: fields whose semantics vary by model (for
  // example objective values or residuals) are left unlabelled rather than
  // receiving an invented unit. Arrays receive one suffix for the whole value.
  function unitForField(key, context = {}) {
    const field = String(key || "").toLowerCase();
    const kind = String(context.kind || "").toLowerCase();
    if (!field) return null;
    if (field === "base_frequency" || field === "frequency" || field.endsWith("_frequency")) return "Hz";
    if (field === "length" || field === "distance" || field.endsWith("_length")) return "m";
    if (field === "longitude" || field === "latitude") return "°";
    if (field === "voltage_deviation" || field === "vm_deviation" || field === "v_deviation" || field.endsWith("_voltage_deviation")) return "p.u.";
    if (field === "loading" || field.endsWith("_loading")) return "p.u.";
    if (field === "per_unit" || field.endsWith("_per_unit")) return "p.u.";
    if (field === "x_sc" && kind === "transformer") return "Ω";
    if (field === "v_angle" && kind === "voltage_source" && context.source === "case") return "rad";
    if (field === "va" || field === "v_angle") return null; // legacy result arrays do not declare angle units
    if (field === "angle" || field.endsWith("_angle")) return "°";
    if (field === "vm" || field === "v_magnitude" || field === "voltage" || field.startsWith("v_nom") || field.endsWith("_voltage")) return "V";
    if (field === "i_max" || field === "i_nom" || field === "current" || field === "ampacity" || field.endsWith("_current")) return "A";
    if (field === "s_max" || field === "s_rating" || field === "s_nom" || field === "apparent_power" || field.endsWith("_apparent_power")) return "VA";
    if (field === "p" || field === "p_nom" || field === "p_min" || field === "p_max" || field === "pg" || field === "p_from" || field === "p_to" || field === "active_power" || field.endsWith("_active_power")) return "W";
    if (field === "q" || field === "q_nom" || field === "q_min" || field === "q_max" || field === "qg" || field === "q_from" || field === "q_to" || field === "reactive_power" || field.endsWith("_reactive_power")) return "var";
    if (/^(r|x)_series(?:_|$)/.test(field) || field === "impedance" || field.endsWith("_impedance")) return kind === "linecode" ? "Ω/m" : "Ω";
    if (/^(g|b)(?:_|$)/.test(field) || field === "admittance" || field.endsWith("_admittance")) return "S";
    return null;
  }

  function formatInspectorValue(value, key, context = {}) {
    const unit = unitForField(key, context);
    if (Array.isArray(value)) {
      const content = value.map((entry) => entry && typeof entry === "object" ? formatInspectorValue(entry, "", context) : formatValue(entry)).join(", ");
      return `[${content}]${unit ? ` ${unit}` : ""}`;
    }
    if (value && typeof value === "object") {
      const content = Object.entries(value).map(([childKey, childValue]) => `${childKey}: ${formatInspectorValue(childValue, childKey, context)}`).join(", ");
      return `{${content}}${unit ? ` ${unit}` : ""}`;
    }
    return `${formatValue(value)}${unit ? ` ${unit}` : ""}`;
  }

  function svgShell(content, options = {}) { const rendererContract = globalThis.BMOPFRendererContract; const camera = options.camera || state.cameras[state.view]; const shellOptions = { camera, view: state.view, escapeHtml, ...options }; return rendererContract ? rendererContract.svgShell(content, shellOptions) : `<svg${options.className ? ` class="${escapeHtml(options.className)}"` : ""}${options.size ? ` width="${Math.ceil(options.size.width)}" height="${Math.ceil(options.size.height)}" style="width:${Math.ceil(options.size.width)}px;height:${Math.ceil(options.size.height)}px;max-width:none"` : ""} viewBox="0 0 ${Math.ceil(options.size?.width || 760)} ${Math.ceil(options.size?.height || 500)}" role="img" aria-label="${escapeHtml(state.view)} view"><g id="viewport" transform="translate(${camera.x} ${camera.y}) scale(${camera.scale})">${content}</g></svg>`; }

  function zoomCamera(factor, x = 380, y = 250) {
    const camera = state.cameras[state.view], previous = camera.scale;
    camera.scale = Math.max(.5, Math.min(state.view === "geo" ? 512 : 3, previous * factor));
    if (state.view === "geo") { const ratio = camera.scale / previous; camera.x = x - (x-camera.x)*ratio; camera.y = y - (y-camera.y)*ratio; }
  }
  function updateCamera() {
    if (state.view === "geo" && geospatialRenderer.isRegional()) { geospatialRenderer.scheduleRefresh(); return; }
    const viewport = $("canvas").querySelector("#viewport");
    if (!viewport) return;
    const camera = state.cameras[state.view];
    viewport.setAttribute("transform", `translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
  }

  function renderCameraControls() {
    const controls = $("camera-controls");
    if (!state.index || state.view === "diagnostics") { controls.hidden = true; controls.innerHTML = ""; return; }
    controls.hidden = false;
    const layoutControls = state.view === "single"
      ? `<span class="layout-label">Layout:</span><label class="layout-select">Direction<select id="sld-direction" aria-label="Single-line direction"><option value="source-to-load" ${state.layout.direction === "source-to-load" ? "selected" : ""}>Source → load</option><option value="load-to-source" ${state.layout.direction === "load-to-source" ? "selected" : ""}>Load → source</option></select></label><label class="layout-select">Root${state.index.buses.length > 500 ? `<input id="sld-root" aria-label="Single-line root bus" placeholder="Bus ID or auto" value="${escapeHtml(state.layout.root || "auto")}" title="Enter any bus ID, or auto for automatic roots">` : `<select id="sld-root" aria-label="Single-line root bus"><option value="auto" ${state.layout.root === "auto" ? "selected" : ""}>Automatic</option>${state.index.buses.map((bus) => `<option value="${escapeHtml(bus.ref.id)}" ${state.layout.root === bus.ref.id ? "selected" : ""}>${escapeHtml(bus.ref.id)}</option>`).join("")}</select>`}</label><button data-layout="left" aria-label="Move selected bus left" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>←</button><button data-layout="right" aria-label="Move selected bus right" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>→</button><button data-layout="up" aria-label="Move selected bus up" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>↑</button><button data-layout="down" aria-label="Move selected bus down" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>↓</button><button data-layout="lock" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>Lock bus</button><button data-layout="unlock" ${state.selected && layoutLocked(state.selected?.id) ? "" : "disabled"}>Unlock bus</button><button data-layout="reset">Reset layout</button>` : "";
    const overviewButton = state.view === "single" ? `<button data-navigation="overview" aria-label="Show full overview" ${state.selected ? "" : "disabled"}>Overview</button>` : "";
    const detailTarget = itemFor(state.selected);
    const detailButton = ["single", "geo"].includes(state.view) && state.multiDetailCollapsed && multiDetailAvailable(detailTarget) ? `<button data-navigation="multi-detail">Show component detail</button>` : "";
    controls.innerHTML = `<span>View:</span><button data-navigation="back" aria-label="Go back" ${navigationDisabled("back") ? "disabled" : ""}>Back</button><button data-navigation="forward" aria-label="Go forward" ${navigationDisabled("forward") ? "disabled" : ""}>Forward</button>${overviewButton}${detailButton}<button data-camera="zoom-out" aria-label="Zoom out">−</button><button data-camera="zoom-in" aria-label="Zoom in">+</button><button data-camera="reset">Fit / reset</button><button data-camera="focus" ${state.selected ? "" : "disabled"}>Focus selection</button><button data-camera="export-svg">Export SVG</button><button data-camera="export-png">Export PNG</button>${layoutControls}`;
    if (state.view === "multi") controls.querySelectorAll("[data-camera]").forEach((button) => button.remove());
    if (state.view === "single") {
      const elkButton = document.createElement("button"); elkButton.dataset.layout = "elk"; elkButton.textContent = "Apply ELK layout";
      controls.querySelector('[data-layout="left"]')?.before(elkButton);
      const stressButton = document.createElement("button"); stressButton.dataset.layout = "stress"; stressButton.textContent = "Apply stress layout"; stressButton.title = "Recompute a deterministic PivotMDS + SMACOF stress arrangement";
      controls.querySelector('[data-layout="left"]')?.before(stressButton);
    }
    if ($("canvas").querySelector(".network-directory")) controls.querySelectorAll("[data-camera], [data-layout], .layout-select, .layout-label").forEach(node => { node.hidden = true; });
    controls.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => {
      const camera = state.cameras[state.view];
      if (button.dataset.camera === "zoom-in") zoomCamera(1.25);
      else if (button.dataset.camera === "zoom-out") zoomCamera(1/1.25);
      else if (button.dataset.camera === "focus") { focusSelection(); return; }
      else if (button.dataset.camera === "export-svg") { exportCurrentSvg(); return; }
      else if (button.dataset.camera === "export-png") { exportCurrentPng(); return; }
      else { camera.scale = 1; camera.x = 0; camera.y = 0; }
      updateCamera();
    }));
    controls.querySelectorAll("[data-navigation]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.navigation === "multi-detail") { state.multiDetailCollapsed = false; render(); return; }
      if (button.dataset.navigation === "overview") {
        const budget = overviewBudget();
        state.largeCaseDecision = budget.over ? (state.largeCaseBypass ? "full" : "pending") : "full";
        navigateTo({ view: state.view, selected: null });
        return;
      }
      const delta = button.dataset.navigation === "back" ? -1 : 1;
      if (!navigationDisabled(delta < 0 ? "back" : "forward")) history.go(delta);
    }));
    const direction = $("sld-direction");
    if (direction) direction.addEventListener("change", (event) => { switchLayoutProfile(event.target.value, state.layout.root); renderView(); renderCameraControls(); });
    const root = $("sld-root");
    if (root) root.addEventListener("change", (event) => { const id = event.target.value || "auto"; if (id !== "auto" && !state.index.busById.has(id)) { event.target.setCustomValidity("Enter an existing bus ID or auto."); event.target.reportValidity(); return; } event.target.setCustomValidity(""); switchLayoutProfile(state.layout.direction, id); renderView(); renderCameraControls(); });
    bindLayoutControls();
  }

  function exportCurrentSvg() {
    const svg = $("canvas")?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const caseName = (state.index?.name || "bmopf-case").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "bmopf-case";
    anchor.href = url; anchor.download = `${caseName}-${state.view}.svg`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${state.view} view exported as SVG.`);
  }

  function exportCurrentPng() {
    const svg = $("canvas")?.querySelector("svg");
    if (!svg) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    const source = new XMLSerializer().serializeToString(clone);
    const image = new Image();
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const viewBox = (svg.getAttribute("viewBox") || "0 0 760 500").trim().split(/\s+/).map(Number);
      const width = Number(svg.getAttribute("width")) || viewBox[2] || 760;
      const height = Number(svg.getAttribute("height")) || viewBox[3] || 500;
      const scale = 2; canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext("2d"); context.fillStyle = "#fbfaf7"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { setStatus("PNG export failed in this browser."); URL.revokeObjectURL(url); return; }
        const pngUrl = URL.createObjectURL(blob); const anchor = document.createElement("a");
        const caseName = (state.index?.name || "bmopf-case").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "bmopf-case";
        anchor.href = pngUrl; anchor.download = `${caseName}-${state.view}.png`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000); URL.revokeObjectURL(url);
        setStatus(`${state.view} view exported as PNG.`);
      }, "image/png");
    };
    image.onerror = () => { URL.revokeObjectURL(url); setStatus("PNG export failed in this browser."); };
    image.src = url;
  }

  function bindCamera() {
    if (state.view === "multi") return;
    const canvas = $("canvas");
    const svg = canvas.querySelector("svg");
    if (!svg) return;
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const camera = state.cameras[state.view];
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(svg.getScreenCTM().inverse());
      zoomCamera(event.deltaY < 0 ? 1.1 : .9, local.x, local.y);
      updateCamera();
    }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-kind], [data-region-cell], [data-landmark-cell]")) return;
      drag = { x: event.clientX, y: event.clientY, camera: { ...state.cameras[state.view] } };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const camera = state.cameras[state.view];
      camera.x = drag.camera.x + (event.clientX - drag.x) / svg.getScreenCTM().a;
      camera.y = drag.camera.y + (event.clientY - drag.y) / svg.getScreenCTM().d;
      updateCamera();
    });
    svg.addEventListener("pointerup", () => { drag = null; });
    svg.addEventListener("pointercancel", () => { drag = null; });
  }
  let geographicCache = null;
  function busCoordinates() {
    if (geographicCache?.index === state.index) return geographicCache.value;
    const buses = state.index.buses, mapped = buses.filter(b => b.coordinates);
    const geographic = mapped.length > 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const bus of mapped) {
      minX = Math.min(minX, bus.coordinates.longitude); maxX = Math.max(maxX, bus.coordinates.longitude);
      minY = Math.min(minY, bus.coordinates.latitude); maxY = Math.max(maxY, bus.coordinates.latitude);
    }
    const centerX = geographic ? (minX + maxX) / 2 : 0, centerY = geographic ? (minY + maxY) / 2 : 0;
    const longitudeScale = Math.max(.01, Math.cos(centerY * Math.PI / 180));
    const scale = geographic ? Math.min(650 / Math.max((maxX - minX) * longitudeScale, .00001), 380 / Math.max(maxY - minY, .00001)) : 1;
    const project = (longitude, latitude) => [380 + (Number(longitude) - centerX) * longitudeScale * scale, 250 - (Number(latitude) - centerY) * scale];
    const positions = new Map(buses.map((bus, i) => [bus.ref.id, geographic ? (bus.coordinates ? project(bus.coordinates.longitude, bus.coordinates.latitude) : null) : [90 + i % 4 * 210, 110 + Math.floor(i / 4) * 140]]));
    const value = { positions, geographic, project, unmapped: buses.filter(bus => !bus.coordinates) };
    geographicCache = { index: state.index, value }; return value;
  }

  // Lay out the visible neighbourhood, not all 24,000+ buses behind it.
  // Include boundary endpoints so every displayed branch retains both ends.
  let focusedLayoutCache = null;
  const focusedLayout = globalThis.BMOPFLayouts.createDeterministicLayout({
    getIndex: () => {
      if (focusedLayoutCache?.index === state.index && sameRef(focusedLayoutCache.selected, state.selected) && focusedLayoutCache.kind === state.activeKind) return focusedLayoutCache.scoped;
      const assets = overviewAssets();
      const ids = overviewScope() || new Set();
      for (const item of assets) for (const port of item.ports || []) ids.add(port.busId);
      const scoped = { assets, buses: [...ids].map((id) => state.index.busById.get(id)).filter(Boolean) };
      focusedLayoutCache = { index: state.index, selected: state.selected, kind: state.activeKind, scoped };
      return scoped;
    },
    getLayout: () => state.layout
  });
  function singlePositions() { return overviewScope() ? focusedLayout.singlePositions() : deterministicLayout.singlePositions(); }

  function focusSelection() {
    const item = itemFor(state.selected); if (!item || !state.index || ["multi", "diagnostics"].includes(state.view)) return;
    const positions = state.view === "geo" ? busCoordinates().positions : singlePositions();
    const fallbackPoints = item.ref.kind === "bus" ? [positions.get(item.ref.id)] : (item.ports || []).map((port) => positions.get(port.busId));
    const points = state.view === "single" && item.ref.kind !== "bus"
      ? [singleElementPosition(item, fallbackPoints.find(Boolean) || null)]
      : fallbackPoints;
    const valid = points.filter(Boolean); if (!valid.length) return;
    const target = [valid.reduce((sum, point) => sum + point[0], 0) / valid.length, valid.reduce((sum, point) => sum + point[1], 0) / valid.length];
    const camera = state.cameras[state.view];
    camera.x = 380 - target[0] * camera.scale;
    camera.y = 250 - target[1] * camera.scale;
    updateCamera();
  }

  function geometryPointsOf(item) {
    let value = item.sourceRecord?.geometry ?? item.sourceRecord?.coordinates ?? item.sourceRecord?.line_geometry;
    if (typeof value === "string") value = itemFor({ kind: "line_geometry", id: value })?.sourceRecord;
    if (value && !Array.isArray(value) && Array.isArray(value.coordinates)) value = value.coordinates;
    if (value && !Array.isArray(value) && value.geometry) value = value.geometry.coordinates;
    if (!Array.isArray(value)) return [];
    return value.filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
      .map((point) => [Number(point[0]), Number(point[1])]);
  }

  const geospatialRenderer = globalThis.BMOPFRenderers?.createGeospatialRenderer({
    state,
    escapeHtml,
    setStatus,
    setCanvas: (html) => { $("canvas").innerHTML = html; },
    svgShell,
    bindSvgSelection,
    busCoordinates,
    overviewAssets,
    overviewBuses,
    geometryPointsOf,
    sameRef,
    resultVisual,
    colourOf,
    resultStatus,
    titleOf,
    entityLabelSvg,
    resultTooltip,
    resultVoltageVisual,
    resultRecordFor,
    resultPairingStatus,
    resultLegend,
    select
  });
  function drawGeo() { return geospatialRenderer.drawGeo(); }

  function singleSymbol(item, x, y) { return symbolRenderer.singleSymbol(item, x, y, state.selected, state.view === "single" ? state.singleDisplay : undefined); }

  const singleWireRenderer = globalThis.BMOPFRenderers?.createSingleWireRenderer({
    state,
    escapeHtml,
    setStatus,
    setCanvas: (html) => { $("canvas").innerHTML = html; },
    svgShell,
    bindSvgSelection,
    singlePositions,
    singleBounds: deterministicLayout.singleBounds,
    singleLayoutInfo: () => (overviewScope() ? focusedLayout : deterministicLayout).singleLayoutInfo(),
    overviewAssets,
    overviewBuses,
    sameRef,
    resultVisual,
    colourOf,
    resultStatus,
    titleOf,
    entityLabelSvg,
    resultTooltip,
    singleSymbol,
    singleElementPosition,
    resultVoltageVisual,
    layoutLocked,
    resultLegend
  });
  function drawSingle() { return singleWireRenderer.drawSingle(); }

  function drawMulti(target = $("canvas"), { announce = target === $("canvas") } = {}) {
    modelSheets.render(target, state.selected, target === $("canvas"));
    if (announce) setStatus("Electrical model sheets · connections, parameters, operating values and unresolved assumptions");
  }

  function multiDetailAvailable(item) { return Boolean(item); }

  function startTerminalTrace(bus, terminal) {
    state.terminalTrace = globalThis.BMOPFElectrical.traceTerminal(state.index, bus, terminal, { maxVisits: state.traceLimit, maxSteps: state.traceLimit*10 });
    state.tracePage = 0; renderMultiDetail(); geospatialRenderer.refresh();
  }
  function tracePanelHtml() {
    const trace=state.terminalTrace, h=escapeHtml;
    if (!trace) return '<section class="terminal-trace"><h3>Terminal trace</h3><p>Choose a terminal above to follow its declared conductor mappings.</p></section>';
    const pages=Math.max(1,Math.ceil(trace.rows.length/50)); state.tracePage=Math.min(state.tracePage,pages-1);
    const endpoint = p => `${h(p.busId)} / ${h(p.terminal)}`;
    return `<section class="terminal-trace"><h3>Terminal trace · ${endpoint(trace.origin)}</h3><p>${trace.terminals.length} bus terminals reached · ${trace.rows.length} evidence entries. Structural connectivity only; this does not establish energisation. Ground and transformer winding boundaries stop the trace.</p><button data-trace-clear>Clear trace</button>${trace.truncated ? `<p class="trace-stop">Incomplete: traversal budget reached.</p><button data-trace-more ${state.traceLimit>=64000 ? "disabled" : ""}>Extend trace budget</button>` : ""}<ol start="${state.tracePage*50+1}">${trace.rows.slice(state.tracePage*50,(state.tracePage+1)*50).map(row=>`<li class="trace-${row.type}"><strong>${h(row.type)}</strong> ${row.from ? endpoint(row.from) : ""}${row.to ? ` → ${endpoint(row.to)}` : ""}<p>${h(row.message)}</p>${row.ref ? `<button data-trace-ref="${h(JSON.stringify(row.ref))}">${h(row.ref.kind)} ${h(row.ref.id)}</button>` : ""}<small>${h(row.pointer)}</small>${row.windings ? `<p>Related winding ports — inspect separately; no direct continuity:</p>${row.windings.map(w=>`<p>${h(w.role)} · ${h(w.busId)} · ${h(w.configuration)} · ${h(w.terminals.join(", "))}</p>`).join("")}` : ""}</li>`).join("")}</ol><button data-trace-prev ${state.tracePage ? "" : "disabled"}>Previous trace entries</button> ${state.tracePage+1}/${pages} <button data-trace-next ${state.tracePage+1<pages ? "" : "disabled"}>Next trace entries</button></section>`;
  }
  function bindTraceControls(target) {
    target.querySelector("[data-trace-clear]")?.addEventListener("click",()=>{state.terminalTrace=null;renderMultiDetail();geospatialRenderer.refresh();});
    target.querySelector("[data-trace-more]")?.addEventListener("click",()=>{state.traceLimit*=2;startTerminalTrace(state.terminalTrace.origin.busId,state.terminalTrace.origin.terminal);});
    for(const [selector,delta] of [["[data-trace-prev]",-1],["[data-trace-next]",1]]) target.querySelector(selector)?.addEventListener("click",()=>{state.tracePage+=delta;renderMultiDetail();});
    target.querySelectorAll("[data-trace-ref]").forEach(button=>button.onclick=()=>select(JSON.parse(button.dataset.traceRef)));
  }

  function renderMapDetail(target, item) {
    const E = globalThis.BMOPFElectrical, model = E.interpret(item, state.index), h = escapeHtml;
    const value = v => h(v === undefined ? "not supplied" : typeof v === "object" ? JSON.stringify(v) : String(v));
    const table = rows => `<table class="map-detail-table"><tbody>${rows.map(([label,v,unit,path])=>`<tr><th>${h(label)}</th><td>${value(v)} ${h(unit || "")} ${path ? `<small>${h(path)}</small>` : ""}</td></tr>`).join("")}</tbody></table>`;
    const rows = fields => fields.map(f=>[(f.label || f.keys.join(" / ")) + (f.reference ? ` · ${f.reference}` : ""), f.value, f.unit, f.path]);
    const section = (title, content) => `<section><h3>${title}</h3>${content}</section>`;
    const ports = item.ref.kind === "bus" ? [{ role: "bus", busId: item.ref.id, terminals: item.terminals }] : item.ports;
    const connections = ports.map(port=>`<div><strong>${h(port.role)}</strong> <button class="sheet-link" data-map-bus="${h(port.busId)}">${h(port.busId)}</button><p>Trace terminal: ${port.terminals.map(terminal=>`<button data-trace-start="${h(JSON.stringify([port.busId,terminal]))}">${h(terminal)}</button>`).join(" ") || "not supplied"}</p><p>Ideal ground: ${h(state.index.busById.get(port.busId)?.groundedTerminals.join(" · ") || "not declared")}</p></div>`).join("");
    const ratingFields = model.fields.filter(f=>/^(v_nom|v_magnitude|p_nom|q_nom|[is]_(max|rating)|tap|length)/.test(f.keys[0]));
    const inherited = model.line?.ratings.filter(r=>r.value !== undefined && !ratingFields.some(f=>f.path === r.path)).map(r=>[r.key,r.value,r.unit,r.path]) || [];
    const result = E.resultFields(item, resultRecordFor(item));
    const unknown = model.fields.filter(f=>f.category === "unrepresented");
    const scenario = state.resultScenario || (state.result && globalThis.BMOPFModel.resultScenarios(state.result).length > 1 ? "Choose a scenario" : "single network");
    const pairing = state.result ? resultPairingStatus() : null;
    target.innerHTML = `<article class="map-detail"><p>Service: <strong>${h(item.status)}</strong> · Frequency: ${value(model.frequency)} ${model.frequency === undefined ? "" : "Hz"}</p>${section("Connections & grounding", connections || "<p>No connection ports supplied.</p>")}${section("Ratings & nominal values", ratingFields.length || inherited.length ? table([...rows(ratingFields),...inherited]) : "<p>Not supplied for this element.</p>")}${section("Operating values", `<p>${state.result ? `${h(state.resultLabel)} · ${h(scenario)}` : "No results attached."}</p>${pairing ? `<p class="muted">Pairing: ${h(pairing.label)} · ${h(pairing.message)}</p>` : ""}${result.length ? table(rows(result.slice(0,12))) : state.result ? "<p>No values for this element in the selected scenario.</p>" : ""}${result.length > 12 ? `<p>${result.length-12} more result fields in the full electrical sheet.</p>` : ""}`)}${section("Unresolved model information", model.problems.length ? `<ul>${model.problems.map(p=>`<li>${h(p)}</li>`).join("")}</ul>` : "<p>No issues found by the available model checks.</p>")}${unknown.length ? `<p><strong>${unknown.length} uninterpreted source fields</strong></p>${table(rows(unknown.slice(0,8)))}${unknown.length>8 ? `<p>${unknown.length-8} more in the full electrical sheet.</p>` : ""}` : ""}<p class="muted">${model.fields.length} source fields retained. Open the full view for matrices, all results and source evidence.</p></article>`;
    target.insertAdjacentHTML(state.terminalTrace ? "afterbegin" : "beforeend", tracePanelHtml());
    bindTraceControls(target);
    target.querySelectorAll("[data-trace-start]").forEach(button=>button.onclick=()=>{ const [bus,terminal]=JSON.parse(button.dataset.traceStart); state.traceLimit=2000; startTerminalTrace(bus,terminal); });
    target.querySelectorAll("[data-map-bus]").forEach(button=>button.onclick=()=>select({kind:"bus",id:button.dataset.mapBus}));
  }

  function renderMultiDetail() {
    const stage = $("single-view-layout");
    const pane = $("multi-detail-panel");
    const resizer = $("multi-detail-resizer");
    const target = $("multi-detail-canvas");
    if (!stage || !pane || !resizer || !target) return;
    const item = itemFor(state.selected);
    const visible = ["single", "geo"].includes(state.view) && !state.multiDetailCollapsed && multiDetailAvailable(item);
    stage.classList.toggle("has-detail", visible);
    stage.classList.toggle("map-detail-active", visible && state.view === "geo");
    pane.hidden = !visible;
    resizer.hidden = !visible;
    if (!visible) { target.innerHTML = ""; return; }
    $("multi-detail-selection").innerHTML = entityLabelHtml(item.ref.kind, item.ref.id);
    setMultiDetailWidth(state.multiDetailWidth);
    if (state.view === "geo") renderMapDetail(target, item);
    else drawMulti(target, { announce: false });
  }

  function bindMultiDetailActions() {
    $("multi-detail-open")?.addEventListener("click", () => {
      if (multiDetailAvailable(itemFor(state.selected))) navigateTo({ view: "multi", selected: state.selected });
    });
    $("multi-detail-close")?.addEventListener("click", () => {
      state.multiDetailCollapsed = true;
      render();
    });
  }

  function drawDiagnostics() {
    if (!state.result) {
      setStatus("Attach a results JSON file to inspect validation and solution diagnostics.");
      $("canvas").innerHTML = '<div class="message">No results attached. Diagnostics are derived from BMOPFTools result/profile fields.</div>';
      return;
    }
    const allDiagnostics = allDiagnosticsForView();
    const diagnostics = diagnosticsForView();
    const filterControls = '<div class="diagnostic-filters"><label>Filter<input id="diagnostic-query" type="search" placeholder="Search findings" value="' + escapeHtml(state.diagnosticsQuery) + '" aria-label="Filter diagnostics"></label><label>Severity<select id="diagnostic-severity" aria-label="Filter diagnostic severity"><option value="all" ' + (state.diagnosticsSeverity === "all" ? "selected" : "") + '>All</option><option value="error" ' + (state.diagnosticsSeverity === "error" ? "selected" : "") + '>Error</option><option value="warning" ' + (state.diagnosticsSeverity === "warning" ? "selected" : "") + '>Warning</option><option value="info" ' + (state.diagnosticsSeverity === "info" ? "selected" : "") + '>Info</option></select></label><button id="diagnostic-clear" type="button">Clear</button></div>';
    if (!allDiagnostics.length) {
      setStatus("No diagnostics were found in the active result slice.");
      $("canvas").innerHTML = '<div class="diagnostics-view"><div class="diagnostics-heading"><h2>Result diagnostics</h2><span class="muted">0 findings</span></div>' + filterControls + '<div class="message">No validation, bound, residual, or solution-profile diagnostics were found.</div></div>';
      bindDiagnosticFilters();
      return;
    }
    if (!diagnostics.length) {
      setStatus("No diagnostics match the current filters.");
      $("canvas").innerHTML = '<div class="diagnostics-view"><div class="diagnostics-heading"><h2>Result diagnostics</h2><span class="muted">0 of ' + allDiagnostics.length + ' findings</span></div>' + filterControls + '<div class="message">No findings match the current filters. Clear the filters to show all diagnostics.</div></div>';
      bindDiagnosticFilters();
      return;
    }
    const cards = diagnostics.map((diagnostic) => {
      const severity = ["error", "warning", "info"].includes(diagnostic.severity) ? diagnostic.severity : "warning";
      const target = diagnostic.kind && diagnostic.id && itemFor({ kind: diagnostic.kind, id: diagnostic.id })
        ? '<button class="diagnostic-target" data-kind="' + escapeHtml(diagnostic.kind) + '" data-id="' + escapeHtml(diagnostic.id) + '">' + entityLabelHtml(diagnostic.kind, diagnostic.id) + '</button>'
        : '<span class="muted">No linked asset</span>';
      const category = diagnostic.category ? '<span class="diagnostic-category">' + escapeHtml(diagnostic.category) + '</span>' : "";
      return '<article class="diagnostic-card ' + severity + '"><div class="diagnostic-heading"><span class="diagnostic-severity">' + escapeHtml(severity) + '</span>' + category + target + '</div><p>' + escapeHtml(diagnostic.message) + '</p><details class="copyable-details"><summary>Diagnostic data ' + copyTargetButton("Copy diagnostic data") + '</summary><pre class="raw">' + escapeHtml(JSON.stringify(diagnostic.raw, null, 2)) + '</pre></details></article>';
    }).join("");
    $("canvas").innerHTML = '<div class="diagnostics-view"><div class="diagnostics-heading"><h2>Result diagnostics</h2><span class="muted">' + (diagnostics.length === allDiagnostics.length ? diagnostics.length : diagnostics.length + ' of ' + allDiagnostics.length) + ' finding' + (allDiagnostics.length === 1 ? "" : "s") + '</span></div>' + filterControls + cards + '</div>';
    setStatus(diagnostics.length + ' result diagnostic' + (diagnostics.length === 1 ? "" : "s") + (state.resultScenario ? ' · ' + state.resultScenario : ""));
    bindDiagnosticFilters();
    bindCopyButtons($("canvas"));
    bindSvgSelection();
  }

  function bindDiagnosticFilters() {
    const query = $("diagnostic-query");
    const severity = $("diagnostic-severity");
    const clear = $("diagnostic-clear");
    if (query) query.addEventListener("input", (event) => { state.diagnosticsQuery = event.target.value; drawDiagnostics(); });
    if (severity) severity.addEventListener("change", (event) => { state.diagnosticsSeverity = event.target.value; drawDiagnostics(); });
    if (clear) clear.addEventListener("click", () => { state.diagnosticsQuery = ""; state.diagnosticsSeverity = "all"; drawDiagnostics(); });
  }

  function bindSvgSelection(target = $("canvas")) {
    // Only the main single-wire canvas is draggable. The multi-wire detail pane
    // renders while the view is still "single", so without this its groups would
    // pick up the drag handlers and rewrite single-wire layout positions.
    const draggable = state.view === "single" && target === $("canvas");
    const svgPoint = (svg, event) => {
      const ctm = svg.getScreenCTM?.();
      if (!ctm) return [event.offsetX || 0, event.offsetY || 0];
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(ctm.inverse());
      return [local.x, local.y];
    };
    const transformPoint = (node) => {
      const match = /translate\(\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\)/.exec(node.getAttribute("transform") || "");
      return match ? [Number(match[1]), Number(match[2])] : null;
    };
    let activeDrag = null;
    target.querySelectorAll("[data-kind][data-id]").forEach((node) => {
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", `${node.dataset.kind.replaceAll("_", " ")} ${node.dataset.id}`);
      node.addEventListener("click", () => select(globalThis.BMOPFRendererContract?.assetRef(node) || { kind: node.dataset.kind, id: node.dataset.id }));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(globalThis.BMOPFRendererContract?.assetRef(node) || { kind: node.dataset.kind, id: node.dataset.id }); }
      });
      if (!draggable || node.tagName.toLowerCase() !== "g") return;
      node.classList.add("sld-draggable");
      node.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const item = itemFor({ kind: node.dataset.kind, id: node.dataset.id });
        const svg = node.closest("svg");
        if (!item || !svg) return;
        const initial = item.ref.kind === "bus" ? singlePositions().get(item.ref.id) : transformPoint(node);
        if (!initial || !initial.every(Number.isFinite)) return;
        activeDrag = { node, item, svg, pointerId: event.pointerId, start: svgPoint(svg, event), initial, current: [...initial], moved: false };
        node.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      });
      node.addEventListener("pointermove", (event) => {
        if (!activeDrag || activeDrag.node !== node || activeDrag.pointerId !== event.pointerId) return;
        const point = svgPoint(activeDrag.svg, event);
        const dx = point[0] - activeDrag.start[0]; const dy = point[1] - activeDrag.start[1];
        activeDrag.current = [activeDrag.initial[0] + dx, activeDrag.initial[1] + dy];
        activeDrag.moved = activeDrag.moved || Math.hypot(dx, dy) >= 3;
        if (!activeDrag.moved) return;
        const transform = activeDrag.item.ref.kind === "bus"
          ? `translate(${dx} ${dy})`
          : `translate(${activeDrag.current[0]} ${activeDrag.current[1]})`;
        node.setAttribute("transform", transform);
        event.preventDefault();
        event.stopPropagation();
      });
      const finishDrag = (event, cancelled = false) => {
        if (!activeDrag || activeDrag.node !== node || activeDrag.pointerId !== event.pointerId) return;
        const drag = activeDrag; activeDrag = null;
        if (drag.moved && !cancelled) {
          saveSingleElementPosition(drag.item, drag.current);
          navigateTo({ view: "single", selected: { kind: drag.item.ref.kind, id: drag.item.ref.id } });
        } else if (drag.moved) renderView();
        event.stopPropagation();
      };
      node.addEventListener("pointerup", (event) => finishDrag(event));
      node.addEventListener("pointercancel", (event) => finishDrag(event, true));
    });
  }

  let networkPage = 0, networkQuery = "";
  function renderNetworkDirectory() {
    const matches = state.index.components.filter((network) => !networkQuery || network.busIds.some((id) => id.toLowerCase().includes(networkQuery.toLowerCase())));
    const pages = Math.max(1, Math.ceil(matches.length / 25));
    networkPage = Math.min(networkPage, pages - 1);
    const rows = matches.slice(networkPage * 25, (networkPage + 1) * 25);
    $("canvas").innerHTML = `<section class="network-directory"><h2>Explore connected networks</h2><p>${state.index.buses.length.toLocaleString()} buses across ${state.index.componentCount.toLocaleString()} networks. Choose a network to inspect its source neighbourhood, then follow its connections. Structural connectivity includes open and out-of-service branches.</p><label>Find a network by any bus ID <input id="network-search" type="search" value="${escapeHtml(networkQuery)}"></label><p role="status">${matches.length.toLocaleString()} matching networks · showing ${matches.length ? networkPage * 25 + 1 : 0}–${Math.min((networkPage + 1) * 25, matches.length)}</p><div class="network-grid">${rows.map(network => `<article><h3>${escapeHtml(network.rootBus)}</h3><p><strong>${network.busIds.length.toLocaleString()}</strong> buses · ${network.assetCount.toLocaleString()} devices · ${network.sourceCount.toLocaleString()} sources</p><button data-network-root="${escapeHtml(network.rootBus)}">Inspect neighbourhood</button></article>`).join("")}</div><p><button id="network-previous" ${networkPage === 0 ? "disabled" : ""}>Previous networks</button> Page ${networkPage + 1} / ${pages} <button id="network-next" ${networkPage + 1 === pages ? "disabled" : ""}>Next networks</button></p></section>`;
    $("network-search").addEventListener("input", event => { networkQuery = event.target.value; networkPage = 0; renderNetworkDirectory(); $("network-search").focus(); });
    $("network-previous").addEventListener("click", () => { networkPage--; renderNetworkDirectory(); });
    $("network-next").addEventListener("click", () => { networkPage++; renderNetworkDirectory(); });
    $("canvas").querySelectorAll("[data-network-root]").forEach(button => button.addEventListener("click", () => select({ kind: "bus", id: button.dataset.networkRoot })));
  }

  function renderView() {
    if (!state.index) { $("canvas").innerHTML = `<div class="message">Open a BMOPF JSON case to see its views.</div>`; return; }
    const budget = overviewBudget();
    if (budget.over && state.largeCaseDecision !== "full" && state.view === "single" && !state.selected) {
      setStatus(`Focused overview mode: ${budget.message} Select a bus or device from the inventory to render nearby topology.`);
      renderNetworkDirectory();
      document.querySelectorAll(".view-tab").forEach((button) => { const active = button.dataset.view === state.view; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); button.setAttribute("tabindex", active ? "0" : "-1"); });
      return;
    }
    if (state.view === "geo") drawGeo();
    else if (state.view === "single") drawSingle();
    else if (state.view === "multi") drawMulti();
    else drawDiagnostics();
    document.querySelectorAll(".view-tab").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.setAttribute("tabindex", active ? "0" : "-1");
    });
    bindCamera();
  }

  function render() { renderSummary(); renderClassOverview(); renderResultSummary(); renderInventory(); renderInspector(); renderView(); renderMultiDetail(); renderCameraControls(); renderMultiHopControls(); renderDisplayOptions(); renderFloatingLegend(); }

  function parseHash() {
    const entry = navigationEntryFromHash();
    state.view = entry.view;
    state.selected = entry.selected;
    return entry;
  }

  let pendingImport = null;
  function cancelImport() {
    pendingImport?.abort();
    pendingImport = null;
    $("import-progress")?.remove();
  }
  async function importFile(file, mode) {
    cancelImport();
    const controller = new AbortController();
    pendingImport = controller;
    const progress = document.createElement("div");
    progress.id = "import-progress";
    progress.className = "message";
    progress.innerHTML = '<span role="status" aria-live="polite"></span> <button type="button">Cancel import</button>';
    $("drop-zone").after(progress);
    progress.querySelector("button").addEventListener("click", () => { cancelImport(); setStatus("Import cancelled. The current case is unchanged."); });
    const report = (phase) => { if (pendingImport === controller) progress.querySelector("span").textContent = `${file.name} · ${phase}…`; };
    report("Starting import");
    try {
      const prepared = await globalThis.BMOPFImporter.read(file, { mode, signal: controller.signal, onProgress: report });
      if (pendingImport !== controller) return;
      cancelImport();
      if (mode === "comparison") loadComparisonResultDocument(prepared.raw, file.name);
      else if (prepared.isResult) loadResultDocument(prepared.raw, file.name, { preserveCase: mode === "auto" && Boolean(state.index), preparedIndex: prepared.index });
      else {
        loadDocument(prepared.raw, file.name, prepared.index);
        if ($("example-select")) $("example-select").value = "";
      }
      // Local performance diagnostics, containing timings only, never case data.
      globalThis.__BMOPF_IMPORT_METRICS__ = { execution: prepared.execution, indexMs: prepared.indexMs };
    } catch (error) {
      if (error.name === "AbortError" || pendingImport !== controller) return;
      cancelImport();
      if (mode === "comparison") showComparisonError(error.message, file.name);
      else if (mode === "result" || (mode === "auto" && state.index)) showResultError(error.message, file.name);
      else { setStatus(`${file.name} was not loaded: ${error.message}`); progress.textContent = error.message; $("drop-zone").after(progress); }
    }
  }
  const readFile = (file) => importFile(file, "case");
  const readDroppedFile = (file) => importFile(file, "auto");

  function showResultError(message, label) {
    state.resultError = message;
    renderResultSummary();
    setStatus(label ? `${label} was not attached.` : "Results were not attached.");
  }

  function loadResultDocument(resultDocument, label, options = {}) {
    try {
      const embeddedCase = globalThis.BMOPFModel.resultCase(resultDocument);
      if (embeddedCase && (!state.index || !options.preserveCase)) loadDocument(embeddedCase, `${label || "Results"} · embedded case`, options.preparedIndex);
      globalThis.BMOPFModel.resultRoot(resultDocument);
      state.result = resultDocument;
      state.resultLabel = label || "Results JSON";
      state.resultError = "";
      state.diagnosticsQuery = "";
      state.diagnosticsSeverity = "all";
      const scenarios = globalThis.BMOPFModel.resultScenarios(resultDocument);
      state.resultScenario = scenarios.length === 1 ? scenarios[0] : null;
      render();
      const pairing = state.index ? resultPairingStatus() : null;
      const pairingNote = pairing?.kind === "mismatch"
        ? " Case/result identity mismatch; metrics are shown for best-effort inspection."
        : pairing?.kind === "unverified" ? " Case/result identity could not be verified; metrics are shown for best-effort inspection." : "";
      setStatus(`${embeddedCase && !options.preserveCase ? "Results attached with embedded case." : "Results attached to the current case."}${pairingNote}`);
    } catch (error) {
      showResultError(error.message, label);
    }
  }

  const readResultFile = (file) => importFile(file, "result");

  function showComparisonError(message, label) {
    state.resultCompareError = message;
    renderResultSummary();
    setStatus(label ? `${label} was not attached as a comparison.` : "Comparison results were not attached.");
  }

  function loadComparisonResultDocument(resultDocument, label) {
    try {
      globalThis.BMOPFModel.resultRoot(resultDocument);
      state.resultCompare = resultDocument;
      state.resultCompareLabel = label || "Comparison results JSON";
      state.resultCompareError = "";
      render();
      setStatus(state.result ? "Comparison results attached." : "Comparison results attached; attach a primary result file to inspect deltas.");
    } catch (error) {
      showComparisonError(error.message, label);
    }
  }

  const readComparisonResultFile = (file) => importFile(file, "comparison");

  document.addEventListener("DOMContentLoaded", () => {
    initialiseSidebarResize();
    initialiseMultiDetailResize();
    bindMultiDetailActions();
    const initialNavigation = parseHash();
    initialiseNavigation(initialNavigation);
    populateExamples();
    $("file-input").addEventListener("change", (event) => { if (event.target.files[0]) readFile(event.target.files[0]); });
    $("result-input").addEventListener("change", (event) => { if (event.target.files[0]) readResultFile(event.target.files[0]); });
    $("comparison-input").addEventListener("change", (event) => { if (event.target.files[0]) readComparisonResultFile(event.target.files[0]); });
    const zone = $("drop-zone");
    zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("dragging"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone.addEventListener("drop", (event) => { event.preventDefault(); zone.classList.remove("dragging"); if (event.dataTransfer.files[0]) readDroppedFile(event.dataTransfer.files[0]); });
    document.querySelectorAll(".view-tab").forEach((button) => button.addEventListener("click", () => navigateTo({ view: button.dataset.view, selected: state.selected })));
    window.addEventListener("popstate", () => {
      const entry = history.state?.bmopfEntry || navigationEntryFromHash();
      syncNavigationEntry(entry);
      applyNavigationEntry(entry);
    });
    window.addEventListener("hashchange", () => {
      if (history.state?.bmopfEntry && navigationHash(history.state.bmopfEntry) === window.location.hash) return;
      const entry = navigationEntryFromHash();
      syncNavigationEntry(entry);
      applyNavigationEntry(entry);
    });
    const embedded = globalThis.__BMOPF_CASE__;
    const embeddedResult = globalThis.__BMOPF_RESULT__;
    if (embedded) loadDocument(embedded, embedded.name || "Embedded case");
    if (embeddedResult) loadResultDocument(embeddedResult, "Embedded results");
    if (!embedded && !embeddedResult && availableExamples().length) {
      $("example-select").value = availableExamples()[0].id;
      loadExample(availableExamples()[0].id);
    } else if (!embedded && !embeddedResult) render();
  });
})();
