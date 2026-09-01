(function () {
  "use strict";

  const state = { index: null, selected: null, view: "geo", query: "", activeKind: null };
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleOf = (item) => `${item.ref.kind.replaceAll("_", " ")} ${item.ref.id}`;
  const colourOf = (kind) => ({ line: "#8a8378", switch: "#c26a27", transformer: "#4f789f", load: "#a75a1b", generator: "#4a8f5f", ibr: "#789e46", shunt: "#8a6ca8", capacitor: "#8a6ca8", voltage_source: "#3f6fb9" }[kind] || "#9a9388");

  function setStatus(text) { $("view-status").textContent = text || ""; }

  function select(ref) {
    state.selected = ref;
    state.activeKind = null;
    if (ref) window.location.hash = `#/${state.view}/${ref.kind}/${encodeURIComponent(ref.id)}`;
    render();
  }

  function itemFor(ref) {
    if (!state.index || !ref) return null;
    return state.index.entities.find((item) => item.ref.kind === ref.kind && item.ref.id === ref.id) || null;
  }

  function loadDocument(caseDocument, label) {
    const requestedSelection = state.selected;
    try {
      state.index = globalThis.BMOPFModel.buildCaseIndex(caseDocument);
      state.selected = requestedSelection && itemFor(requestedSelection) ? requestedSelection : null;
      state.activeKind = null;
      render();
      setStatus(`${state.index.name} · ${state.index.buses.length} buses · ${state.index.assets.length - state.index.buses.length} devices`);
      if (label) globalThis.document.title = `${label} · BMOPF Explorer`;
    } catch (error) {
      state.index = null;
      $("case-summary").innerHTML = `<strong>Could not open case</strong><p class="muted">${escapeHtml(error.message)}</p>`;
      $("inventory").innerHTML = "";
      $("inspector").textContent = "";
      $("canvas").innerHTML = `<div class="message">${escapeHtml(error.message)}</div>`;
    }
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
    $("case-summary").className = "panel";
    $("case-summary").innerHTML = `<div class="panel-heading"><h2>${escapeHtml(index.name)}</h2><span class="muted">${index.schema ? "schema" : "JSON"}</span></div><div class="stats">${stats.map(([n, label]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join("")}</div>${warningHtml}`;
  }

  function renderInventory() {
    const index = state.index;
    if (!index) { $("inventory").innerHTML = ""; return; }
    const rows = Object.entries(index.counts).sort(([a], [b]) => a.localeCompare(b));
    const filtered = state.query
      ? index.assets.filter((item) => `${item.ref.kind} ${item.ref.id}`.toLowerCase().includes(state.query.toLowerCase()))
      : null;
    const body = filtered
      ? filtered.map((item) => `<button class="inventory-row ${sameRef(item.ref, state.selected) ? "selected" : ""}" data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><span>${escapeHtml(titleOf(item))}</span><span class="count">›</span></button>`).join("")
      : rows.map(([kind, count]) => `<button class="inventory-row ${state.activeKind === kind ? "selected" : ""}" data-kind-filter="${escapeHtml(kind)}"><span class="kind">${escapeHtml(kind.replaceAll("_", " "))}</span><span class="count">${count}</span></button>`).join("");
    $("inventory").innerHTML = `<div class="panel-heading"><h2>Inventory</h2><input id="search" type="search" placeholder="Search assets" value="${escapeHtml(state.query)}" aria-label="Search assets"></div><div class="inventory-list">${body || `<p class="muted" style="padding:12px 14px">No matching assets.</p>`}</div>`;
    $("search").addEventListener("input", (event) => { state.query = event.target.value; renderInventory(); });
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

  function renderInspector() {
    const item = itemFor(state.selected);
    $("selection-label").textContent = item ? titleOf(item) : "Nothing selected";
    if (!item) { $("inspector").innerHTML = `<p class="muted">Select a bus or asset in a view or in the inventory.</p>`; return; }
    const record = item.sourceRecord || {};
    const keys = Object.keys(record).sort();
    const related = [];
    for (const p of item.ports || []) related.push({ kind: "bus", id: p.busId });
    for (const relatedItem of related) {
      if (!state.index.buses.some((bus) => bus.ref.id === relatedItem.id)) continue;
    }
    const relatedHtml = related.length ? `<div class="related">${related.map((r) => `<button class="link-button" data-related-kind="${escapeHtml(r.kind)}" data-related-id="${escapeHtml(r.id)}">${escapeHtml(r.kind)} ${escapeHtml(r.id)}</button>`).join("")}</div>` : "";
    const portHtml = item.ports?.length ? `<h3>Ports</h3><table class="property-table">${item.ports.map((p) => `<tr><th>${escapeHtml(p.role || p.id)}</th><td>${escapeHtml(p.busId)} · [${p.terminals.map(escapeHtml).join(", ")}]</td></tr>`).join("")}</table>` : "";
    $("inspector").innerHTML = `<h3>${escapeHtml(titleOf(item))}</h3><p class="muted">status: ${escapeHtml(item.status)}</p>${relatedHtml}${portHtml}<h3 style="margin-top:14px">Properties</h3><table class="property-table">${keys.map((key) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(formatValue(record[key]))}</td></tr>`).join("")}</table><details><summary>Raw record</summary><pre class="raw"></pre></details>`;
    $("inspector").querySelector(".raw").textContent = JSON.stringify(record, null, 2);
    $("inspector").querySelectorAll("[data-related-kind]").forEach((button) => button.addEventListener("click", () => select({ kind: button.dataset.relatedKind, id: button.dataset.relatedId })));
  }

  function formatValue(value) {
    if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
    if (value && typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function svgShell(content) { return `<svg viewBox="0 0 760 500" role="img" aria-label="${escapeHtml(state.view)} view">${content}</svg>`; }
  function busCoordinates() {
    const buses = state.index.buses;
    const mapped = buses.filter((b) => b.coordinates);
    const source = mapped.length >= 2 ? mapped : [];
    const xs = source.map((b) => b.coordinates.longitude); const ys = source.map((b) => b.coordinates.latitude);
    const minX = Math.min(...xs, 0); const maxX = Math.max(...xs, 1); const minY = Math.min(...ys, 0); const maxY = Math.max(...ys, 1);
    const positions = new Map();
    buses.forEach((bus, i) => {
      if (source.length >= 2 && bus.coordinates) {
        positions.set(bus.ref.id, [55 + ((bus.coordinates.longitude - minX) / (maxX - minX || 1)) * 650, 440 - ((bus.coordinates.latitude - minY) / (maxY - minY || 1)) * 380]);
      } else positions.set(bus.ref.id, [90 + (i % 4) * 210, 110 + Math.floor(i / 4) * 140]);
    });
    return { positions, geographic: source.length >= 2 };
  }

  function drawGeo() {
    const { positions, geographic } = busCoordinates();
    let content = "";
    for (const item of visibleAssets().filter((e) => e.connections?.length)) {
      for (const connection of item.connections) {
        const a = positions.get(connection.from.busId); const b = positions.get(connection.to.busId);
        if (!a || !b) continue;
        const selected = sameRef(item.ref, state.selected);
        content += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${colourOf(item.ref.kind)}" stroke-width="${selected ? 6 : 3}" stroke-opacity="${item.status === "open" ? .35 : .85}" ${item.status === "open" ? "stroke-dasharray=\"8 6\"" : ""} data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><title>${escapeHtml(titleOf(item))}</title></line>`;
      }
    }
    for (const bus of state.index.buses) {
      const p = positions.get(bus.ref.id); const selected = sameRef(bus.ref, state.selected);
      content += `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><circle cx="${p[0]}" cy="${p[1]}" r="${selected ? 12 : 8}" fill="${selected ? "#2f6fb3" : "#fffdf9"}" stroke="#2f6fb3" stroke-width="${selected ? 4 : 2}"><title>bus ${escapeHtml(bus.ref.id)}</title></circle><text x="${p[0] + 12}" y="${p[1] + 4}" fill="#37332c" font-size="12">${escapeHtml(bus.ref.id)}</text></g>`;
    }
    setStatus(geographic ? "Geographic coordinates used for bus placement." : "No geographic coordinates: showing a schematic placement.");
    $("canvas").innerHTML = svgShell(content);
    bindSvgSelection();
  }

  function drawSingle() {
    const positions = new Map();
    state.index.buses.forEach((bus, i) => positions.set(bus.ref.id, [90 + (i % 4) * 210, 100 + Math.floor(i / 4) * 145]));
    let content = "";
    for (const item of visibleAssets().filter((e) => e.connections?.length)) {
      for (const connection of item.connections) {
        const a = positions.get(connection.from.busId); const b = positions.get(connection.to.busId); if (!a || !b) continue;
        content += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${colourOf(item.ref.kind)}" stroke-width="${sameRef(item.ref, state.selected) ? 6 : 3}" stroke-opacity=".85" ${item.status === "open" ? "stroke-dasharray=\"8 6\"" : ""} data-kind="${escapeHtml(item.ref.kind)}" data-id="${escapeHtml(item.ref.id)}"><title>${escapeHtml(titleOf(item))}</title></line>`;
      }
    }
    for (const bus of state.index.buses) {
      const p = positions.get(bus.ref.id); const selected = sameRef(bus.ref, state.selected);
      content += `<g data-kind="bus" data-id="${escapeHtml(bus.ref.id)}"><rect x="${p[0] - 25}" y="${p[1] - 14}" width="50" height="28" rx="4" fill="${selected ? "#e8f0f8" : "#fffdf9"}" stroke="#2f6fb3" stroke-width="${selected ? 3 : 1.5}"><title>bus ${escapeHtml(bus.ref.id)}</title></rect><text x="${p[0]}" y="${p[1] + 4}" text-anchor="middle" fill="#37332c" font-size="12">${escapeHtml(bus.ref.id)}</text></g>`;
    }
    setStatus("Single-wire projection: conductor detail is collapsed; devices remain selectable.");
    $("canvas").innerHTML = svgShell(content);
    bindSvgSelection();
  }

  function drawMulti() {
    const item = itemFor(state.selected);
    if (!item || !item.connections?.length) {
      setStatus("Select a line, switch, or transformer to expand its terminal-level neighbourhood.");
      $("canvas").innerHTML = `<div class="message">Multi-wire focus mode starts from a selected multi-terminal device.</div>`;
      return;
    }
    const connection = item.connections[0];
    const left = connection.from; const right = connection.to;
    let content = `<text x="380" y="32" text-anchor="middle" font-size="16" fill="#25231f">${escapeHtml(titleOf(item))}</text><rect x="35" y="70" width="200" height="350" rx="8" fill="#fffdf9" stroke="#2f6fb3" stroke-width="2"/><rect x="525" y="70" width="200" height="350" rx="8" fill="#fffdf9" stroke="#2f6fb3" stroke-width="2"/><text x="135" y="102" text-anchor="middle" font-size="15">bus ${escapeHtml(left.busId)}</text><text x="625" y="102" text-anchor="middle" font-size="15">bus ${escapeHtml(right.busId)}</text>`;
    const pairs = connection.pairs;
    pairs.forEach(([a, b], i) => {
      const y = 145 + i * 45; const phase = String(a).toLowerCase() === "n" ? "#787266" : ["#c2564b", "#4a8f5f", "#3f6fb9"][i % 3];
      content += `<text x="60" y="${y + 4}" fill="#37332c" font-size="13">${escapeHtml(a)}</text><line x1="90" y1="${y}" x2="670" y2="${y}" stroke="${phase}" stroke-width="3" ${item.status === "open" ? "stroke-dasharray=\"8 6\"" : ""}/><text x="690" y="${y + 4}" fill="#37332c" font-size="13">${escapeHtml(b)}</text>`;
    });
    content += `<text x="380" y="455" text-anchor="middle" fill="#70695f" font-size="12">Ordered conductor pairing from source terminal maps</text>`;
    setStatus(`${pairs.length} conductor pairs · ${item.status}`);
    $("canvas").innerHTML = svgShell(content);
  }

  function bindSvgSelection() {
    $("canvas").querySelectorAll("[data-kind][data-id]").forEach((node) => node.addEventListener("click", () => select({ kind: node.dataset.kind, id: node.dataset.id })));
  }

  function renderView() {
    if (!state.index) { $("canvas").innerHTML = `<div class="message">Open a BMOPF JSON case to see its views.</div>`; return; }
    if (state.view === "geo") drawGeo();
    else if (state.view === "single") drawSingle();
    else drawMulti();
    document.querySelectorAll(".view-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  }

  function render() { renderSummary(); renderInventory(); renderInspector(); renderView(); }

  function parseHash() {
    const parts = window.location.hash.slice(2).split("/");
    if (parts[0] && ["geo", "single", "multi"].includes(parts[0])) state.view = parts[0];
    if (parts[1] && parts[2]) state.selected = { kind: parts[1], id: decodeURIComponent(parts.slice(2).join("/")) };
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => { try { loadDocument(JSON.parse(reader.result), file.name); } catch (error) { loadDocument(null, file.name); } };
    reader.readAsText(file);
  }

  document.addEventListener("DOMContentLoaded", () => {
    parseHash();
    $("file-input").addEventListener("change", (event) => { if (event.target.files[0]) readFile(event.target.files[0]); });
    const zone = $("drop-zone");
    zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("dragging"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone.addEventListener("drop", (event) => { event.preventDefault(); zone.classList.remove("dragging"); if (event.dataTransfer.files[0]) readFile(event.dataTransfer.files[0]); });
    document.querySelectorAll(".view-tab").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
    window.addEventListener("hashchange", () => { parseHash(); render(); });
    const embedded = globalThis.__BMOPF_CASE__;
    if (embedded) loadDocument(embedded, embedded.name || "Embedded case"); else render();
  });
})();
