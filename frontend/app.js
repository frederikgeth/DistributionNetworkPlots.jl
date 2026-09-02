(function () {
  "use strict";

  const LAYOUT_CACHE_VERSION = 3;
  const LAYOUT_MAX_PROFILES = 8;
  const ELK_VERSION = "0.10.2";
  const LAYOUT_ROUTE_SPACE = "single-svg-v2";
  const SIDEBAR_WIDTH_KEY = "bmopf-sidebar-width-v1";
  const TABLE_WIDTHS_KEY = "bmopf-table-widths-v1";
  const SIDEBAR_WIDTH_DEFAULT = 360;
  const SIDEBAR_WIDTH_MIN = 280;
  const SIDEBAR_WIDTH_MAX = 640;
  const state = { index: null, selected: null, result: null, resultLabel: "", resultError: "", resultCompare: null, resultCompareLabel: "", resultCompareError: "", resultScenario: null, diagnosticsQuery: "", diagnosticsSeverity: "all", view: "single", query: "", activeKind: null, multiHops: 1, searchFocus: -1, navigation: { entries: [], cursor: -1, nextId: 0 }, largeCaseDecision: "full", largeCaseBypass: false, sidebarWidth: SIDEBAR_WIDTH_DEFAULT, multiDetailWidth: 380, multiDetailCollapsed: false, singleDisplay: { showBusLabels: true, showDeviceLabels: true, showArrows: true, labelsSelectedOnly: false }, layout: { version: LAYOUT_CACHE_VERSION, key: null, locked: {}, positions: {}, routes: {}, direction: "source-to-load", root: "auto", engine: "deterministic", profiles: {} }, cameras: { geo: { scale: 1, x: 0, y: 0 }, single: { scale: 1, x: 0, y: 0 }, multi: { scale: 1, x: 0, y: 0 } } };
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_JSON_ELEMENTS = 100000;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleOf = (item) => `${item.ref.kind.replaceAll("_", " ")} ${item.ref.id}`;
  const colourOf = (kind) => ({ line: "#8a8378", switch: "#c26a27", transformer: "#4f789f", load: "#a75a1b", generator: "#4a8f5f", ibr: "#789e46", shunt: "#8a6ca8", capacitor: "#8a6ca8", voltage_source: "#3f6fb9" }[kind] || "#9a9388");
  const symbolRenderer = globalThis.BMOPFRenderers?.createSymbolRenderer({ escapeHtml, colourOf, sameRef, resultStatus, resultTooltip, titleOf });

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

  function countJsonElements(value, limit) {
    let count = 0;
    const pending = [value];
    while (pending.length) {
      const current = pending.pop();
      count += 1;
      if (count > limit) return count;
      if (Array.isArray(current)) pending.push(...current);
      else if (current && typeof current === "object") pending.push(...Object.values(current));
    }
    return count;
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
    if (entry.view === "single" && (!current || current.view !== "single" || JSON.stringify(current.selected) !== JSON.stringify(entry.selected))) state.multiDetailCollapsed = false;
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
    return state.index.entities.find((item) => item.ref.kind === ref.kind && item.ref.id === ref.id) || null;
  }

  function loadDocument(caseDocument, label) {
    const requestedSelection = state.selected;
    try {
      state.index = globalThis.BMOPFModel.buildCaseIndex(caseDocument);
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
    const buses = state.index.buses.map((bus) => bus.ref.id).sort();
    const edges = [];
    state.index.assets.forEach((item) => (item.connections || []).forEach((connection) => edges.push({ kind: item.ref.kind, id: item.ref.id, from: connection.from.busId, to: connection.to.busId })));
    edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const input = JSON.stringify({ buses, edges });
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `sld-elk-graph-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function normaliseLayoutProfile(profile) {
    if (!profile || typeof profile !== "object") return { locked: {}, positions: {}, routes: {}, engine: "deterministic" };
    const locked = profile.locked && typeof profile.locked === "object" ? profile.locked : {};
    const positions = profile.positions && typeof profile.positions === "object" ? profile.positions : {};
    const routes = profile.routes && typeof profile.routes === "object" ? profile.routes : {};
    const lastUsed = Number.isFinite(Number(profile.lastUsed)) ? Number(profile.lastUsed) : 0;
    return { locked, positions, routes, engine: ["elk", "force"].includes(profile.engine) ? profile.engine : "deterministic", lastUsed };
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
        const engine = ["elk", "force"].includes(legacy.engine) ? legacy.engine : "deterministic";
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
      const engine = ["elk", "force"].includes(state.layout.engine) ? state.layout.engine : "deterministic";
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
    setStatus("Loading ELK layered layout…");
    try {
      const direction = state.layout.direction === "load-to-source" ? "LEFT" : "RIGHT";
      const graph = { id: "bmopf-root", layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction, "elk.edgeRouting": "ORTHOGONAL", "elk.spacing.nodeNode": "64", "elk.layered.spacing.nodeNodeBetweenLayers": "150" }, children: state.index.buses.map((bus) => ({ id: `bus:${bus.ref.id}`, width: 84, height: 24, ports: [{ id: `port:${bus.ref.id}`, width: 4, height: 4, layoutOptions: { "elk.port.side": state.layout.direction === "load-to-source" ? "EAST" : "WEST" } }] })), edges: [] };
      const busIds = new Set(state.index.buses.map((bus) => bus.ref.id));
      if (state.layout.root && state.layout.root !== "auto" && busIds.has(state.layout.root)) {
        graph.layoutOptions["org.eclipse.elk.processingOrder.rootSelection"] = "FIXED";
        graph.layoutOptions["org.eclipse.elk.processingOrder.preferredRoot"] = `bus:${state.layout.root}`;
      }
      state.index.assets.forEach((item) => {
        (item.connections || []).forEach((connection) => {
          const from = connection.from.busId; const to = connection.to.busId;
          if (busIds.has(from) && busIds.has(to)) graph.edges.push({ id: `edge:${item.ref.kind}:${item.ref.id}:${from}:${to}`, sources: [`port:${from}`], targets: [`port:${to}`] });
        });
      });
      const result = await layoutWithElk(graph);
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

  function applyForceLayout() {
    if (!state.index || state.view !== "single") return;
    const positions = deterministicLayout.singleForcePositions();
    const nextLocked = {};
    positions.forEach((point, id) => { if (Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) nextLocked[id] = [...point]; });
    state.layout.locked = nextLocked;
    state.layout.routes = {};
    state.layout.engine = "force";
    saveLayout();
    renderView();
    renderCameraControls();
    setStatus(`Force-directed layout applied to ${positions.size} buses; positions are now locally persisted.`);
  }

  function layoutLocked(id) { return Array.isArray(state.layout?.locked?.[id]); }

  function renderDisplayOptions() {
    const pane = $("display-options");
    if (!pane) return;
    const visible = Boolean(state.index && state.view === "single");
    pane.hidden = !visible;
    if (!visible) return;
    pane.querySelectorAll("[data-display-option]").forEach((input) => {
      const option = input.dataset.displayOption;
      const defaultValue = option === "labelsSelectedOnly" ? false : true;
      input.checked = state.singleDisplay?.[option] ?? defaultValue;
      input.onchange = () => {
        state.singleDisplay[option] = input.checked;
        renderView();
        renderDisplayOptions();
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
      if (button.dataset.layout === "force") { applyForceLayout(); return; }
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
      [index.coordinateCount, "mapped buses"]
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
    const budgetHtml = budget.over && state.largeCaseDecision !== "full"
      ? `<p class="budget-warning"><strong>Focused overview mode</strong> · ${escapeHtml(budget.message)} Select an asset to render its one-hop context.</p>`
      : budget.over ? `<p class="budget-meta"><strong>Full overview enabled</strong> · ${escapeHtml(budget.message)}</p>`
      : `<p class="budget-meta">Overview budget: ${budget.elements.toLocaleString()} estimated SVG elements of ${budget.limit.toLocaleString()}.</p>`;
    const largeCasePrompt = budget.over && state.largeCaseDecision === "pending"
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
    panel.innerHTML = `<div class="panel-heading"><h2>Class overview</h2><span class="muted">full / focused / raw</span></div><table class="property-table class-overview-table resizable-table" data-resizable-table="class-overview"><thead><tr><th>class</th><th>count</th><th>support</th><th>result ranges</th></tr></thead><tbody>${rows}</tbody></table>`;
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
    const symbols = `<div class="floating-legend-section"><strong>Symbols</strong><div class="floating-legend-row"><span class="legend-line busbar"></span><span>busbar</span></div><div class="floating-legend-row"><span>○</span><span>source or generator</span></div><div class="floating-legend-row"><span>paired coils</span><span>transformer</span></div><div class="floating-legend-row"><span>□</span><span>load</span></div><div class="floating-legend-row"><span>║</span><span>capacitor</span></div><div class="floating-legend-row"><span>⏚</span><span>shunt / grounding</span></div><div class="floating-legend-row"><span class="legend-line open"></span><span>open switch or interrupted path</span></div><p class="legend-note">A dashed leader marks a manually moved symbol. Hover or select an asset for its full tooltip.</p></div>`;
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
    const visible = Boolean(state.index && state.view === "single");
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
    const body = filtered
      ? filtered.map((item, i) => `<button class="inventory-row ${sameRef(item.ref, state.selected) ? "selected" : ""} ${state.searchFocus === i ? "focused" : ""}" data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}" role="option" aria-selected="${sameRef(item.ref, state.selected)}" aria-posinset="${i + 1}" aria-setsize="${filtered.length}"><span>${escapeHtml(titleOf(item))}</span><span class="count">›</span></button>`).join("")
      : rows.map(([kind, count]) => `<button class="inventory-row ${state.activeKind === kind ? "selected" : ""}" data-kind-filter="${escapeHtml(kind)}"><span class="kind">${escapeHtml(kind.replaceAll("_", " "))}</span><span class="count">${count}</span></button>`).join("");
    const resultNote = filtered ? `<p class="search-meta" role="status">${filtered.length} ranked match${filtered.length === 1 ? "" : "es"} · Enter opens the first result</p>` : "";
    $("inventory").innerHTML = `<div class="panel-heading"><h2>Inventory</h2><input id="search" type="search" placeholder="Search assets, buses, or result fields" value="${escapeHtml(state.query)}" aria-label="Search assets, buses, or result fields" aria-controls="inventory-list" aria-autocomplete="list"></div>${resultNote}<div class="inventory-header" role="row"><span>asset / class</span><span class="inventory-column-resizer" role="separator" aria-orientation="vertical" aria-label="Resize inventory name column" tabindex="0" title="Drag to resize this column; use Arrow keys for precise sizing"></span><span>count</span></div><div id="inventory-list" class="inventory-list" role="listbox">${body || `<p class="muted" style="padding:12px 14px">No matching assets.</p>`}</div>`;
    bindResizableInventory();
    const search = $("search");
    search.addEventListener("input", (event) => { state.query = event.target.value; state.searchFocus = -1; renderInventory(); $("search")?.focus(); });
    search.addEventListener("keydown", (event) => {
      if (!filtered?.length) return;
      if (event.key === "ArrowDown") { event.preventDefault(); state.searchFocus = Math.min(filtered.length - 1, state.searchFocus + 1); renderInventory(); $("search")?.focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); state.searchFocus = Math.max(0, state.searchFocus - 1); renderInventory(); $("search")?.focus(); }
      else if (event.key === "Enter") { event.preventDefault(); select(filtered[state.searchFocus >= 0 ? state.searchFocus : 0].ref); }
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
    return visibleAssets().filter((item) => !scope || sameRef(item.ref, state.selected) || (item.ports || []).some((port) => scope.has(port.busId)));
  }

  function overviewBuses() {
    const scope = overviewScope();
    return state.index.buses.filter((bus) => !scope || scope.has(bus.ref.id));
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

  const multiWireProjection = globalThis.BMOPFProjections?.createMultiWireProjection({
    escapeHtml,
    findBus: (id) => state.index?.buses.find((bus) => bus.ref.id === id),
    findRecord: (ref) => itemFor(ref)
  });
  const deterministicLayout = globalThis.BMOPFLayouts?.createDeterministicLayout({
    getIndex: () => state.index,
    getLayout: () => state.layout
  });
  function conductorVisual(...args) { return multiWireProjection.conductorVisual(...args); }
  function terminalNames(...args) { return multiWireProjection.terminalNames(...args); }
  function multiBusPanel(...args) { return multiWireProjection.multiBusPanel(...args); }
  function multiWindingPanel(...args) { return multiWireProjection.multiWindingPanel(...args); }
  function focusedPath(...args) { return multiWireProjection.focusedPath(...args); }
  function branchModel(...args) { return multiWireProjection.branchModel(...args, (ref) => itemFor(ref)); }

  function renderMultiHopControls() {
    const controls = $("multi-hop-controls");
    const selected = itemFor(state.selected);
    if (state.view !== "multi" || !selected || selected.ref.kind !== "bus") {
      controls.hidden = true;
      controls.innerHTML = "";
      return;
    }
    controls.hidden = false;
    controls.innerHTML = `<span>Neighbourhood:</span>${[1, 2].map((hops) => `<button class="${state.multiHops === hops ? "active" : ""}" data-hops="${hops}" aria-pressed="${state.multiHops === hops}">${hops}-hop</button>`).join("")}`;
    controls.querySelectorAll("[data-hops]").forEach((button) => button.addEventListener("click", () => { state.multiHops = Number(button.dataset.hops); render(); }));
  }

  function renderInspector() {
    const item = itemFor(state.selected);
    $("selection-label").textContent = item ? titleOf(item) : "Nothing selected";
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
    const relatedHtml = uniqueRelated.length ? `<h3>Related</h3><div class="related">${uniqueRelated.map((r) => `<button class="link-button" data-related-kind="${escapeHtml(r.kind)}" data-related-id="${escapeHtml(r.id)}">${escapeHtml(r.kind)} ${escapeHtml(r.id)}</button>`).join("")}</div>` : "";
    const portHtml = item.ports?.length ? `<h3>Ports</h3><table class="property-table">${item.ports.map((p) => `<tr><th>${escapeHtml(p.role || p.id)}</th><td>${escapeHtml(p.busId)} · [${p.terminals.map(escapeHtml).join(", ")}]</td></tr>`).join("")}</table>` : "";
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
      return `<tr><th>${escapeHtml(key)}</th><td>${current === undefined ? "—" : escapeHtml(formatInspectorValue(current, key, unitContext))}</td>${state.resultCompare ? `<td>${other === undefined ? "—" : escapeHtml(formatInspectorValue(other, key, unitContext))}</td><td>${delta === null ? "—" : escapeHtml(formatInspectorValue(delta, key, unitContext))}</td>` : ""}</tr>`;
    }).join("");
    const resultColspan = state.resultCompare ? 4 : 2;
    const comparisonRaw = state.resultCompare ? `<details><summary>Raw comparison record</summary><pre class="raw comparison-raw"></pre></details>` : "";
    const resultHtml = state.result ? (result ? `<h3 class="result-heading">Simulation / optimisation result${state.resultCompare ? " · comparison" : ""}</h3><table class="property-table result-table">${comparisonHeader}${metricRows || `<tr><td colspan="${resultColspan}" class="muted">No recognised metrics were found for this record.</td></tr>`}</table><details><summary>Raw result record</summary><pre class="raw result-raw"></pre></details>${comparisonRaw}` : `<p class="muted result-missing">No result record found for this asset.</p>`) : "";
    const unitContext = { kind: item.ref.kind, source: "case" };
    const propertyRows = keys.map((key) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(formatInspectorValue(record[key], key, unitContext))}</td></tr>`).join("");
    $("inspector").innerHTML = `<h3>${escapeHtml(titleOf(item))}</h3><p class="muted">status: ${escapeHtml(item.status)} · support: ${escapeHtml(item.support || "raw-only")}</p><p class="support-note">${escapeHtml(supportNote)}</p><p class="support-note inspector-units-note">Physical quantities are displayed in SI base units (without automatic scaling); engineering angles and geographic coordinates retain their degree convention. Unknown fields remain in their source form.</p>${relatedHtml}${portHtml}${resultHtml}<h3 style="margin-top:14px">Properties</h3><table class="property-table">${propertyRows}</table><details><summary>Raw record</summary><pre class="raw"></pre></details>`;
    $("inspector").querySelector(".raw").textContent = JSON.stringify(record, null, 2);
    const resultRaw = $("inspector").querySelector(".result-raw");
    if (resultRaw) resultRaw.textContent = JSON.stringify(result, null, 2);
    const comparisonRawNode = $("inspector").querySelector(".comparison-raw");
    if (comparisonRawNode) comparisonRawNode.textContent = JSON.stringify(comparison, null, 2);
    $("inspector").querySelectorAll("[data-related-kind]").forEach((button) => button.addEventListener("click", () => select({ kind: button.dataset.relatedKind, id: button.dataset.relatedId })));
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
    if (field === "x_sc" || field === "per_unit" || field.endsWith("_per_unit")) return "p.u.";
    if (field === "va" || field === "v_angle" || field === "angle" || field.endsWith("_angle")) return "°";
    if (field === "vm" || field === "v_magnitude" || field === "voltage" || field.startsWith("v_nom") || field.endsWith("_voltage")) return "V";
    if (field === "i_max" || field === "i_nom" || field === "current" || field === "ampacity" || field.endsWith("_current")) return "A";
    if (field === "s_rating" || field === "s_nom" || field === "apparent_power" || field.endsWith("_apparent_power")) return "VA";
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

  function updateCamera() {
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
      ? `<span class="layout-label">Layout:</span><label class="layout-select">Direction<select id="sld-direction" aria-label="Single-line direction"><option value="source-to-load" ${state.layout.direction === "source-to-load" ? "selected" : ""}>Source → load</option><option value="load-to-source" ${state.layout.direction === "load-to-source" ? "selected" : ""}>Load → source</option></select></label><label class="layout-select">Root<select id="sld-root" aria-label="Single-line root bus"><option value="auto" ${state.layout.root === "auto" ? "selected" : ""}>Automatic</option>${state.index.buses.map((bus) => `<option value="${escapeHtml(bus.ref.id)}" ${state.layout.root === bus.ref.id ? "selected" : ""}>${escapeHtml(bus.ref.id)}</option>`).join("")}</select></label><button data-layout="left" aria-label="Move selected bus left" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>←</button><button data-layout="right" aria-label="Move selected bus right" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>→</button><button data-layout="up" aria-label="Move selected bus up" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>↑</button><button data-layout="down" aria-label="Move selected bus down" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>↓</button><button data-layout="lock" ${state.selected && itemFor(state.selected)?.ref.kind === "bus" ? "" : "disabled"}>Lock bus</button><button data-layout="unlock" ${state.selected && layoutLocked(state.selected?.id) ? "" : "disabled"}>Unlock bus</button><button data-layout="reset">Reset layout</button>` : "";
    const overviewButton = state.view === "single" ? `<button data-navigation="overview" aria-label="Show full overview" ${state.selected ? "" : "disabled"}>Overview</button>` : "";
    const detailTarget = itemFor(state.selected);
    const detailButton = state.view === "single" && state.multiDetailCollapsed && multiDetailAvailable(detailTarget) ? `<button data-navigation="multi-detail">Show component detail</button>` : "";
    controls.innerHTML = `<span>View:</span><button data-navigation="back" aria-label="Go back" ${navigationDisabled("back") ? "disabled" : ""}>Back</button><button data-navigation="forward" aria-label="Go forward" ${navigationDisabled("forward") ? "disabled" : ""}>Forward</button>${overviewButton}${detailButton}<button data-camera="zoom-out" aria-label="Zoom out">−</button><button data-camera="zoom-in" aria-label="Zoom in">+</button><button data-camera="reset">Fit / reset</button><button data-camera="focus" ${state.selected ? "" : "disabled"}>Focus selection</button><button data-camera="export-svg">Export SVG</button><button data-camera="export-png">Export PNG</button>${layoutControls}`;
    if (state.view === "single") {
      const elkButton = document.createElement("button"); elkButton.dataset.layout = "elk"; elkButton.textContent = "Apply ELK layout";
      controls.querySelector('[data-layout="left"]')?.before(elkButton);
      const forceButton = document.createElement("button"); forceButton.dataset.layout = "force"; forceButton.textContent = "Apply force layout"; forceButton.title = "Recompute a deterministic force-directed arrangement";
      controls.querySelector('[data-layout="left"]')?.before(forceButton);
    }
    controls.querySelectorAll("[data-camera]").forEach((button) => button.addEventListener("click", () => {
      const camera = state.cameras[state.view];
      if (button.dataset.camera === "zoom-in") camera.scale = Math.min(3, camera.scale * 1.25);
      else if (button.dataset.camera === "zoom-out") camera.scale = Math.max(.5, camera.scale / 1.25);
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
    if (root) root.addEventListener("change", (event) => { switchLayoutProfile(state.layout.direction, event.target.value); renderView(); renderCameraControls(); });
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
    const canvas = $("canvas");
    const svg = canvas.querySelector("svg");
    if (!svg) return;
    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const camera = state.cameras[state.view];
      camera.scale = Math.max(.5, Math.min(3, camera.scale * (event.deltaY < 0 ? 1.1 : .9)));
      updateCamera();
    }, { passive: false });
    let drag = null;
    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-kind]")) return;
      drag = { x: event.clientX, y: event.clientY, camera: { ...state.cameras[state.view] } };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const camera = state.cameras[state.view];
      camera.x = drag.camera.x + event.clientX - drag.x;
      camera.y = drag.camera.y + event.clientY - drag.y;
      updateCamera();
    });
    svg.addEventListener("pointerup", () => { drag = null; });
    svg.addEventListener("pointercancel", () => { drag = null; });
  }
  function busCoordinates() {
    const buses = state.index.buses;
    const mapped = buses.filter((b) => b.coordinates);
    const source = mapped.length >= 2 ? mapped : [];
    const xs = source.map((b) => b.coordinates.longitude); const ys = source.map((b) => b.coordinates.latitude);
    const minX = Math.min(...xs, 0); const maxX = Math.max(...xs, 1); const minY = Math.min(...ys, 0); const maxY = Math.max(...ys, 1);
    const project = (longitude, latitude) => [55 + ((Number(longitude) - minX) / (maxX - minX || 1)) * 650, 440 - ((Number(latitude) - minY) / (maxY - minY || 1)) * 380];
    const positions = new Map();
    buses.forEach((bus, i) => {
      if (source.length >= 2) positions.set(bus.ref.id, bus.coordinates ? project(bus.coordinates.longitude, bus.coordinates.latitude) : null);
      else positions.set(bus.ref.id, [90 + (i % 4) * 210, 110 + Math.floor(i / 4) * 140]);
    });
    return { positions, geographic: source.length >= 2, project, unmapped: buses.filter((bus) => source.length >= 2 && !bus.coordinates) };
  }

  function singlePositions() { return deterministicLayout.singlePositions(); }

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
    resultTooltip,
    resultVoltageVisual,
    resultLegend
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
    overviewAssets,
    overviewBuses,
    sameRef,
    resultVisual,
    colourOf,
    resultStatus,
    titleOf,
    resultTooltip,
    singleSymbol,
    singleElementPosition,
    resultVoltageVisual,
    layoutLocked,
    resultLegend
  });
  function drawSingle() { return singleWireRenderer.drawSingle(); }

  function drawMulti(target = $("canvas"), { announce = target === $("canvas") } = {}) {
    const setMultiStatus = announce ? setStatus : () => {};
    const multiShell = (content, options = {}) => target === $("canvas") ? svgShell(content, options) : svgShell(content, { ...options, camera: { x: 0, y: 0, scale: 1 }, view: "multi" });
    const item = itemFor(state.selected);
    if (!item) {
      setMultiStatus("Select a line, switch, or transformer to expand its terminal-level neighbourhood.");
      target.innerHTML = `<div class="message">Multi-wire focus mode starts from a selected multi-terminal device.</div>`;
      return;
    }
    if (item.ref.kind === "bus") {
      const neighbourhood = neighbourhoodForBus(item.ref.id, state.multiHops);
      const incident = neighbourhood.assets;
      const busPanel = multiBusPanel(item, { terminals: item.terminals }, 35, 70, 220, "left");
      let content = `<text x="380" y="32" text-anchor="middle" font-size="16" fill="#25231f">bus ${escapeHtml(item.ref.id)} · terminal neighbourhood</text>${busPanel.html}`;
      content += `<rect x="300" y="70" width="425" height="350" rx="8" fill="#fffdf9" stroke="#ded8cc"/><text x="512" y="102" text-anchor="middle" font-size="15">${state.multiHops}-hop assets</text>`;
      incident.slice(0, 7).forEach((device, i) => {
        const y = 140 + i * 38;
        const attachedPorts = (device.ports || []).filter((port) => port.busId === item.ref.id);
        const terminalText = attachedPorts.map((port) => `${port.role}: ${terminalNames(port).join(", ")}`).join(" · ");
        const warning = (device.connections || []).find((connection) => connection.warning)?.warning;
        content += `<g data-kind="${escapeHtml(device.ref.kind)}" data-id="${escapeHtml(device.ref.id)}"><circle cx="335" cy="${y - 4}" r="6" fill="${colourOf(device.ref.kind)}"/><text x="352" y="${y}" fill="#37332c" font-size="13">${escapeHtml(titleOf(device))}</text><text x="352" y="${y + 15}" fill="#70695f" font-size="10">${escapeHtml(terminalText || "terminal mapping unavailable")}</text>${warning ? `<text x="352" y="${y + 28}" fill="#8a4d20" font-size="10">⚠ ${escapeHtml(warning)}</text>` : ""}<title>${escapeHtml(titleOf(device))}${terminalText ? ` · ${escapeHtml(terminalText)}` : ""}</title></g>`;
      });
      if (incident.length > 7) content += `<text x="512" y="405" text-anchor="middle" fill="#70695f" font-size="12">+ ${incident.length - 7} more in the inspector</text>`;
      content += `<text x="380" y="455" text-anchor="middle" fill="#70695f" font-size="12">Select an incident device to expand its conductor pairing</text>`;
      setMultiStatus(`${item.terminals.length} terminals · ${incident.length} assets across ${neighbourhood.buses.size} buses · ${state.multiHops}-hop`);
      target.innerHTML = multiShell(content);
      bindSvgSelection(target);
      return;
    }
    if (item.ref.kind === "transformer" && item.ports?.length > 2) {
      const body = { x: 280, y: 165, width: 200, height: 125 };
      const layouts = item.ports.map((_, i) => {
        if (i === 0) return { x: 25, y: 78, width: 205, side: "left" };
        if (i === 1) return { x: 530, y: 78, width: 205, side: "right" };
        const count = item.ports.length - 2;
        const width = Math.min(205, Math.max(150, 680 / Math.max(count, 1)));
        const x = 380 - (width * count) / 2 + (i - 2) * width;
        return { x, y: 335, width, side: "top" };
      });
      let content = `<text x="380" y="32" text-anchor="middle" font-size="16" fill="#25231f">${escapeHtml(titleOf(item))} · winding detail</text><rect x="${body.x}" y="${body.y}" width="${body.width}" height="${body.height}" rx="10" fill="#e8f0f8" stroke="#4f789f" stroke-width="3"/><path d="M345 188c-16 0-16 28 0 28s16 28 0 28 16 28 0 28M415 188c16 0 16 28 0 28s-16 28 0 28-16 28 0 28" fill="none" stroke="#4f789f" stroke-width="3"/><text x="380" y="232" text-anchor="middle" font-size="14">multi-winding body</text>`;
      item.ports.forEach((winding, i) => {
        const layout = layouts[i];
        const bus = state.index.buses.find((candidate) => candidate.ref.id === winding.busId) || { ref: { id: winding.busId }, groundedTerminals: [] };
        const panel = multiWindingPanel(bus, winding, layout.x, layout.y, layout.width, layout.side);
        content += panel.html;
        panel.anchors.forEach((anchor, terminalIndex) => {
          const terminal = winding.terminals[terminalIndex] || "?";
          const visual = conductorVisual(terminal, terminal, winding.busId, winding.busId, terminalIndex);
          const target = layout.side === "left" ? [body.x, body.y + 28 + terminalIndex * 22]
            : layout.side === "right" ? [body.x + body.width, body.y + 28 + terminalIndex * 22]
              : [body.x + 38 + terminalIndex * 42, body.y + body.height];
          content += focusedPath([anchor, target], visual, "unknown");
        });
        const windingRecord = item.sourceRecord?.windings?.[i] || {};
        const details = [windingRecord.configuration, windingRecord.v_nom === undefined ? null : `V ${formatValue(windingRecord.v_nom)}`].filter(Boolean).join(" · ");
        content += `<text x="${layout.side === "left" ? layout.x + layout.width + 8 : layout.side === "right" ? layout.x - 8 : layout.x + layout.width / 2}" y="${layout.side === "top" ? layout.y + 78 : layout.y + 42}" text-anchor="${layout.side === "left" ? "start" : layout.side === "right" ? "end" : "middle"}" fill="#70695f" font-size="10">${escapeHtml(details || winding.role)}</text>`;
      });
      content += `<text x="380" y="455" text-anchor="middle" fill="#70695f" font-size="12">Each winding keeps its bus and terminal stack; no false direct bus-to-bus edges are drawn</text>`;
      setMultiStatus(`${item.ports.length} winding ports · ${item.status}`);
      target.innerHTML = multiShell(content);
      bindSvgSelection(target);
      return;
    }
    if (!item.connections?.length) {
      const attachment = item.ports?.[0];
      if (!attachment) {
        setMultiStatus("This record has no renderable terminal connection.");
        target.innerHTML = `<div class="message">The selected record is inspectable but has no terminal connection to draw.</div>`;
        return;
      }
      const terminals = attachment.terminals.length ? attachment.terminals : ["(no terminal map)"];
      let content = `<text x="380" y="32" text-anchor="middle" font-size="16" fill="#25231f">${escapeHtml(titleOf(item))}</text><rect x="180" y="85" width="400" height="300" rx="8" fill="#fffdf9" stroke="${colourOf(item.ref.kind)}" stroke-width="3"/><text x="380" y="125" text-anchor="middle" font-size="15">bus ${escapeHtml(attachment.busId)}</text>`;
      terminals.forEach((terminal, i) => { const y = 170 + i * 42; content += `<line x1="250" y1="${y}" x2="510" y2="${y}" stroke="#9a9388" stroke-width="2"/><text x="230" y="${y + 4}" text-anchor="end" fill="#37332c" font-size="13">${escapeHtml(terminal)}</text>`; });
      content += `<text x="380" y="430" text-anchor="middle" fill="#70695f" font-size="12">Single-bus attachment · inspect properties for device details</text>`;
      setMultiStatus(`${terminals.length} attached terminals · ${item.status}`);
      target.innerHTML = multiShell(content);
      bindSvgSelection(target);
      return;
    }
    const connection = item.connections[0];
    const left = connection.from; const right = connection.to;
    const leftBus = state.index.buses.find((bus) => bus.ref.id === left.busId) || { ref: { id: left.busId }, groundedTerminals: [] };
    const rightBus = state.index.buses.find((bus) => bus.ref.id === right.busId) || { ref: { id: right.busId }, groundedTerminals: [] };
    const branch = ["line", "dc_branch"].includes(item.ref.kind) ? branchModel(item, connection) : null;
    const leftPanel = multiBusPanel(leftBus, left, 20, 70, 200, "left");
    const rightPanel = multiBusPanel(rightBus, right, branch ? 700 : 520, 70, 200, "right");
    const pairs = connection.pairs;
    if (item.ref.kind === "switch") {
      if (!pairs.length) {
        setMultiStatus(`${item.status} switch · terminal map unavailable`);
        target.innerHTML = `<div class="message">This switch has no terminal pairs to draw. Inspect its raw terminal mapping.</div>`;
        return;
      }
      const switchX = 380;
      const rowY = pairs.map((_, i) => 138 + i * 46);
      let content = `<text x="380" y="32" text-anchor="middle" font-size="16" fill="#25231f">${escapeHtml(titleOf(item))} · multi-wire switch</text>${leftPanel.html}${rightPanel.html}<text x="380" y="64" text-anchor="middle" fill="#70695f" font-size="11">One switch blade per conductor pair · ${item.status === "open" ? "open" : "closed"}</text>`;
      pairs.forEach(([a, b], i) => {
        const yLeft = leftPanel.rowY[i] || (142 + i * 34); const yRight = rightPanel.rowY[i] || (142 + i * 34); const y = rowY[i]; const visual = conductorVisual(a, b, left.busId, right.busId, i);
        content += focusedPath([[220, yLeft], [switchX - 16, y]], visual, item.status);
        content += focusedPath([[switchX + 16, y], [700, yRight]], visual, item.status);
        content += singleSymbol(item, switchX, y);
        content += `<text x="${switchX}" y="${y - 15}" text-anchor="middle" fill="#70695f" font-size="9">${escapeHtml(visual.label)} · ${escapeHtml(a)}→${escapeHtml(b)}</text>`;
      });
      content += `<text x="380" y="${Math.max(365, rowY[rowY.length - 1] + 58)}" text-anchor="middle" fill="#70695f" font-size="12">${item.status === "open" ? "Open switch: each conductor path is interrupted independently" : "Closed switch: each conductor path is switched independently"}</text>`;
      setMultiStatus(`${pairs.length} conductor switches · ${item.status}`);
      target.innerHTML = multiShell(content, { size: { width: 760, height: Math.max(500, rowY[rowY.length - 1] + 90) } });
      bindSvgSelection(target);
      return;
    }
    const bodyY = 142 + Math.max(pairs.length - 1, 0) * 17;
    const canvasWidth = branch ? 940 : 760;
    let content = `<text x="${branch ? 470 : 380}" y="32" text-anchor="middle" font-size="16" fill="#25231f">${escapeHtml(titleOf(item))} · terminal detail</text>${leftPanel.html}${rightPanel.html}`;
    if (branch) {
      const boxX = 260; const boxY = 92; const boxWidth = 400; const columnStep = Math.min(82, 320 / Math.max(pairs.length - 1, 1));
      const boxHeight = Math.max(190, 78 + pairs.length * 28);
      const labels = pairs.map(([from]) => String(from));
      const formatImpedance = (value) => value === null || value === undefined ? "—" : formatValue(value);
      const formatComplex = (entry) => entry.r === null && entry.x === null ? "—" : `${formatImpedance(entry.r)}${entry.x === null ? "" : ` + j${formatImpedance(entry.x)}`}`;
      const header = labels.map((label, i) => `<text x="${boxX + 55 + i * columnStep}" y="${boxY + 47}" text-anchor="middle" fill="#70695f" font-size="9">${escapeHtml(label)}</text>`).join("");
      const matrixRows = branch.series.map((row, i) => `<text x="${boxX + 18}" y="${boxY + 68 + i * 28}" fill="#37332c" font-size="9">${escapeHtml(labels[i] || String(i + 1))}</text>${row.map((entry, j) => `<text x="${boxX + 55 + j * columnStep}" y="${boxY + 68 + i * 28}" text-anchor="middle" fill="#37332c" font-size="9">${escapeHtml(formatComplex(entry))}</text>`).join("")}`).join("");
      const formatAdmittance = (entry) => entry.g === null && entry.b === null ? "—" : `${entry.g === null ? "—" : formatImpedance(entry.g)}${entry.b === null ? "" : ` + j${formatImpedance(entry.b)}`} S`;
      const matrixBox = (side, x, y, width) => {
        const matrix = branch.shunt[side] || [];
        const step = Math.min(42, (width - 48) / Math.max(pairs.length - 1, 1));
        const head = labels.map((label, i) => `<text x="${x + 30 + i * step}" y="${y + 31}" text-anchor="middle" fill="#70695f" font-size="8">${escapeHtml(label)}</text>`).join("");
        const rows = matrix.map((row, i) => `<text x="${x + 10}" y="${y + 49 + i * 20}" fill="#37332c" font-size="8">${escapeHtml(labels[i] || String(i + 1))}</text>${row.map((entry, j) => `<text x="${x + 30 + j * step}" y="${y + 49 + i * 20}" text-anchor="middle" fill="#37332c" font-size="8">${escapeHtml(formatAdmittance(entry))}</text>`).join("")}`).join("");
        return `<rect x="${x}" y="${y}" width="${width}" height="${48 + pairs.length * 20}" rx="7" fill="#fffdf9" stroke="#ded8cc"/><text x="${x + width / 2}" y="${y + 16}" text-anchor="middle" fill="#37332c" font-size="10" font-weight="700">Y${side} [S]</text>${head}${rows}<path d="M${x + width / 2} ${y + 48 + pairs.length * 20}v12M${x + width / 2 - 9} ${y + 60 + pairs.length * 20}h18M${x + width / 2 - 6} ${y + 66 + pairs.length * 20}h12M${x + width / 2 - 3} ${y + 72 + pairs.length * 20}h6" fill="none" stroke="#70695f" stroke-width="1.3"/>`;
      };
      const shuntY = boxY + boxHeight + 18;
      const shuntHeight = 48 + pairs.length * 20 + 76;
      const branchHeight = branch.shuntPresent ? shuntY + shuntHeight + 42 : boxY + boxHeight + 58;
      content += `<g data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="10" fill="#f4f1ea" stroke="${colourOf(item.ref.kind)}" stroke-width="2"/><text x="${boxX + boxWidth / 2}" y="${boxY + 20}" text-anchor="middle" fill="#37332c" font-size="12" font-weight="700">Π branch model</text><text x="${boxX + boxWidth / 2}" y="${boxY + 34}" text-anchor="middle" fill="#70695f" font-size="9">Series Zs [Ω] · ${escapeHtml(branch.source)}</text>${header}${matrixRows}${branch.shuntPresent ? "" : `<text x="${boxX + boxWidth / 2}" y="${boxY + boxHeight - 14}" text-anchor="middle" fill="#70695f" font-size="10">Pure series branch · shunt admittance omitted</text>`}</g>`;
      if (branch.shuntPresent) content += `<g>${matrixBox("from", boxX, shuntY, 190)}${matrixBox("to", boxX + 210, shuntY, 190)}</g>`;
      pairs.forEach(([a, b], i) => {
        const yLeft = leftPanel.rowY[i] || (142 + i * 34); const yRight = rightPanel.rowY[i] || (142 + i * 34); const visual = conductorVisual(a, b, left.busId, right.busId, i);
        content += focusedPath([[220, yLeft], [boxX, yLeft]], visual, item.status);
        content += focusedPath([[boxX + boxWidth, yRight], [700, yRight]], visual, item.status);
      });
      content += `<text x="470" y="${branch.shuntPresent ? branchHeight - 16 : branchHeight - 16}" text-anchor="middle" fill="#70695f" font-size="10">R and X are absolute series impedance entries in Ω; shunt G/B entries are absolute admittance values in S.</text>`;
      setMultiStatus(`${pairs.length} conductor pairs · ${item.status} · ${branch.shuntPresent ? "Π series + shunt model" : "pure series model"}`);
      target.innerHTML = multiShell(content, { size: { width: canvasWidth, height: Math.max(510, branchHeight) } });
      bindSvgSelection(target);
      return;
    }
    content += `<rect x="285" y="${Math.max(105, bodyY - 48)}" width="190" height="96" rx="10" fill="#f4f1ea" stroke="${colourOf(item.ref.kind)}" stroke-width="2"/><text x="380" y="${Math.max(122, bodyY - 20)}" text-anchor="middle" fill="#70695f" font-size="10">${escapeHtml(item.ref.kind.replaceAll("_", " "))}</text>`;
    pairs.forEach(([a, b], i) => {
      const yLeft = leftPanel.rowY[i] || (142 + i * 34); const yRight = rightPanel.rowY[i] || (142 + i * 34); const visual = conductorVisual(a, b, left.busId, right.busId, i);
      if (item.status === "open") {
        content += focusedPath([[240, yLeft], [350, yLeft]], visual, item.status);
        content += focusedPath([[410, yRight], [520, yRight]], visual, item.status);
        content += `<path d="M350 ${yLeft}L380 ${bodyY - 12}M380 ${bodyY + 12}L410 ${yRight}" fill="none" stroke="${visual.colour}" stroke-width="3" stroke-dasharray="8 6"/>`;
      } else {
        content += focusedPath([[240, yLeft], [380, bodyY], [520, yRight]], visual, item.status);
      }
      content += `<text x="380" y="${Math.min(405, Math.max(yLeft, yRight) - 7)}" text-anchor="middle" fill="#70695f" font-size="10">${escapeHtml(visual.label)} · ${escapeHtml(visual.kind)}</text>`;
    });
    content += singleSymbol(item, 380, bodyY);
    const mappingNote = connection.warning ? `<text x="380" y="438" text-anchor="middle" fill="#8a4d20" font-size="12">${escapeHtml(connection.warning)} Inspect raw maps before relying on this pairing.</text>` : "";
    content += `${mappingNote}<text x="380" y="455" text-anchor="middle" fill="#70695f" font-size="12">${item.status === "open" ? "Open switch: conductor paths are intentionally interrupted" : "Ordered conductor pairing from source terminal maps"}</text>`;
    setMultiStatus(`${pairs.length} conductor pairs · ${item.status}${connection.warning ? " · terminal-map warning" : ""}`);
    target.innerHTML = multiShell(content);
    bindSvgSelection(target);
  }

  function multiDetailAvailable(item) { return Boolean(item && (item.ref.kind === "bus" || item.ports?.length)); }

  function renderMultiDetail() {
    const stage = $("single-view-layout");
    const pane = $("multi-detail-panel");
    const resizer = $("multi-detail-resizer");
    const target = $("multi-detail-canvas");
    if (!stage || !pane || !resizer || !target) return;
    const item = itemFor(state.selected);
    const visible = state.view === "single" && !state.multiDetailCollapsed && multiDetailAvailable(item);
    stage.classList.toggle("has-detail", visible);
    pane.hidden = !visible;
    resizer.hidden = !visible;
    if (!visible) { target.innerHTML = ""; return; }
    $("multi-detail-selection").textContent = titleOf(item);
    setMultiDetailWidth(state.multiDetailWidth);
    drawMulti(target, { announce: false });
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
        ? '<button class="diagnostic-target" data-kind="' + escapeHtml(diagnostic.kind) + '" data-id="' + escapeHtml(diagnostic.id) + '">' + escapeHtml(diagnostic.kind.replaceAll("_", " ")) + ' ' + escapeHtml(diagnostic.id) + '</button>'
        : '<span class="muted">No linked asset</span>';
      const category = diagnostic.category ? '<span class="diagnostic-category">' + escapeHtml(diagnostic.category) + '</span>' : "";
      return '<article class="diagnostic-card ' + severity + '"><div class="diagnostic-heading"><span class="diagnostic-severity">' + escapeHtml(severity) + '</span>' + category + target + '</div><p>' + escapeHtml(diagnostic.message) + '</p><details><summary>Diagnostic data</summary><pre class="raw">' + escapeHtml(JSON.stringify(diagnostic.raw, null, 2)) + '</pre></details></article>';
    }).join("");
    $("canvas").innerHTML = '<div class="diagnostics-view"><div class="diagnostics-heading"><h2>Result diagnostics</h2><span class="muted">' + (diagnostics.length === allDiagnostics.length ? diagnostics.length : diagnostics.length + ' of ' + allDiagnostics.length) + ' finding' + (allDiagnostics.length === 1 ? "" : "s") + '</span></div>' + filterControls + cards + '</div>';
    setStatus(diagnostics.length + ' result diagnostic' + (diagnostics.length === 1 ? "" : "s") + (state.resultScenario ? ' · ' + state.resultScenario : ""));
    bindDiagnosticFilters();
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
      if (state.view !== "single" || node.tagName.toLowerCase() !== "g") return;
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

  function renderView() {
    if (!state.index) { $("canvas").innerHTML = `<div class="message">Open a BMOPF JSON case to see its views.</div>`; return; }
    const budget = overviewBudget();
    if (budget.over && state.largeCaseDecision !== "full" && ["geo", "single"].includes(state.view) && !state.selected) {
      setStatus(`Focused overview mode: ${budget.message} Select a bus or device from the inventory to render nearby topology.`);
      $("canvas").innerHTML = `<div class="message"><strong>This case is larger than the overview budget.</strong><p>${escapeHtml(budget.message)}</p><p>Select an asset in the inventory to render its focused one-hop context. The full index and Diagnostics remain available.</p></div>`;
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

  function readFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showLoadError(`The selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Files larger than 25 MB are not supported in the browser prototype.`, file.name);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (error) {
        showLoadError(`This file is not valid JSON. Check the file syntax and try again.`, file.name);
        return;
      }
      if (countJsonElements(parsed, MAX_JSON_ELEMENTS) > MAX_JSON_ELEMENTS) {
        showLoadError(`This case contains more than ${MAX_JSON_ELEMENTS.toLocaleString()} JSON values, which exceeds the browser prototype limit.`, file.name);
        return;
      }
      loadDocument(parsed, file.name);
      if ($("example-select")) $("example-select").value = "";
    };
    reader.onerror = () => showLoadError("The browser could not read this file. Check its permissions and try again.", file.name);
    reader.readAsText(file);
  }

  const RESULT_ROOT_MARKERS = new Set(["termination_status", "objective", "objective_value", "solver", "solution_info", "solution_profile", "profile", "diagnostics", "validation", "residuals", "bound_violations", "near_active_bounds", "case_fingerprint", "case_fingerprint_algorithm", "case_id"]);
  const RESULT_RECORD_MARKERS = new Set(["loading", "vm", "v_magnitude", "voltage_magnitude", "voltage_deviation", "p_from", "q_from", "pg", "qg", "dual", "shadow_price", "cost", "residual"]);

  function looksLikeResultDocument(document, label = "") {
    if (!document || typeof document !== "object" || Array.isArray(document)) return false;
    if (globalThis.BMOPFModel.resultCase(document) || document.result || document.results) return true;
    const root = globalThis.BMOPFModel.resultRoot(document);
    if (Object.keys(root).some((key) => RESULT_ROOT_MARKERS.has(key))) return true;
    for (const table of Object.values(root)) {
      if (!table || typeof table !== "object" || Array.isArray(table)) continue;
      for (const record of Object.values(table)) {
        if (record && typeof record === "object" && !Array.isArray(record) && Object.keys(record).some((key) => RESULT_RECORD_MARKERS.has(key))) return true;
      }
    }
    return /(?:result|solution|scenario|output)/i.test(String(label));
  }

  function readDroppedFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      const message = `The dropped file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Files larger than 25 MB are not supported in the browser prototype.`;
      if (state.index) showResultError(message, file.name); else showLoadError(message, file.name);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (error) {
        const message = "The dropped file is not valid JSON. Check the file syntax and try again.";
        if (state.index) showResultError(message, file.name); else showLoadError(message, file.name);
        return;
      }
      if (countJsonElements(parsed, MAX_JSON_ELEMENTS) > MAX_JSON_ELEMENTS) {
        const message = `The dropped file contains more than ${MAX_JSON_ELEMENTS.toLocaleString()} JSON values, which exceeds the browser prototype limit.`;
        if (state.index) showResultError(message, file.name); else showLoadError(message, file.name);
        return;
      }
      if (looksLikeResultDocument(parsed, file.name)) loadResultDocument(parsed, file.name, { preserveCase: Boolean(state.index) });
      else loadDocument(parsed, file.name);
    };
    reader.onerror = () => {
      const message = "The browser could not read the dropped file. Check its permissions and try again.";
      if (state.index) showResultError(message, file.name); else showLoadError(message, file.name);
    };
    reader.readAsText(file);
  }

  function showResultError(message, label) {
    state.resultError = message;
    renderResultSummary();
    setStatus(label ? `${label} was not attached.` : "Results were not attached.");
  }

  function loadResultDocument(resultDocument, label, options = {}) {
    try {
      const embeddedCase = globalThis.BMOPFModel.resultCase(resultDocument);
      if (embeddedCase && (!state.index || !options.preserveCase)) loadDocument(embeddedCase, `${label || "Results"} · embedded case`);
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

  function readResultFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showResultError(`The selected results file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Files larger than 25 MB are not supported in the browser prototype.`, file.name);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (error) { showResultError("This file is not valid JSON. Check the file syntax and try again.", file.name); return; }
      if (countJsonElements(parsed, MAX_JSON_ELEMENTS) > MAX_JSON_ELEMENTS) {
        showResultError(`These results contain more than ${MAX_JSON_ELEMENTS.toLocaleString()} JSON values, which exceeds the browser prototype limit.`, file.name);
        return;
      }
      loadResultDocument(parsed, file.name);
    };
    reader.onerror = () => showResultError("The browser could not read this file. Check its permissions and try again.", file.name);
    reader.readAsText(file);
  }

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

  function readComparisonResultFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showComparisonError(`The comparison results file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Files larger than 25 MB are not supported in the browser prototype.`, file.name);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (error) { showComparisonError("This comparison file is not valid JSON. Check the file syntax and try again.", file.name); return; }
      if (countJsonElements(parsed, MAX_JSON_ELEMENTS) > MAX_JSON_ELEMENTS) {
        showComparisonError(`These comparison results contain more than ${MAX_JSON_ELEMENTS.toLocaleString()} JSON values, which exceeds the browser prototype limit.`, file.name);
        return;
      }
      loadComparisonResultDocument(parsed, file.name);
    };
    reader.onerror = () => showComparisonError("The browser could not read this comparison file. Check its permissions and try again.", file.name);
    reader.readAsText(file);
  }

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
