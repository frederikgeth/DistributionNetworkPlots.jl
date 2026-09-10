(function () {
  "use strict";
  const E = globalThis.BMOPFElectrical;
  const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v) => v === undefined || v === null ? "not supplied" : typeof v === "object" ? JSON.stringify(v) : String(v);
  const compact = (v) => E.number(v) ? Number(v.toPrecision(6)).toString() : "not supplied";
  const refKey = (ref) => `${ref.kind}:${ref.id}`;
  const table = (headers, rows, cls = "") => `<div class="sheet-table-scroll"><table class="sheet-table ${cls}"><thead><tr>${headers.map((s) => `<th scope="col">${s}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((s) => `<td>${s}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const section = (name, html, cls = "") => `<section class="sheet-section ${cls}"><h3>${h(name)}</h3>${html}</section>`;
  const svg = (body, width, height, label) => `<div class="sheet-figure"><svg class="sheet-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${h(label)}"><title>${h(label)}</title>${body}</svg><button type="button" data-sheet-svg>Export drawing SVG</button></div>`;
  const wire = (d, attrs = "") => `<path class="sheet-wire" d="${d}" ${attrs}/>`;
  const text = (x, y, label, attrs = "") => `<text x="${x}" y="${y}" ${attrs}>${h(label)}</text>`;
  const dot = (x, y) => `<circle class="sheet-junction" cx="${x}" cy="${y}" r="3"/>`;
  const terminal = (x, y, label, anchor = "middle") => `<circle class="sheet-terminal" cx="${x}" cy="${y}" r="4"/>${text(x, y - 11, label, `text-anchor="${anchor}"`)}`;
  const ground = (x, y) => wire(`M${x} ${y}v13m-10 0h20m-17 5h14m-11 5h8`);

  function coil(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const p = (t, offset = 0) => [a[0] + dx * t - dy / length * offset, a[1] + dy * t + dx / length * offset];
    let d = `M${a}L${p(.2)}`;
    for (let i = 0; i < 6; i++) d += `Q${p(.2 + (i + .5) * .6 / 6, i % 2 ? -7 : 7)} ${p(.2 + (i + 1) * .6 / 6)}`;
    return d + `L${b}`;
  }

  function createModelSheets(d) {
    let pins = [], comparisonIndex = null, comparisonName = "";
    const local = new Map();
    let instance = 0;
    const find = (ref, index = d.getIndex()) => ref ? index?.entities.find((e) => e.ref.kind === ref.kind && e.ref.id === ref.id) : null;
    const stateFor = (item) => { const key = refKey(item.ref); if (!local.has(key)) local.set(key, { row: 0, column: 0, matrix: "series", basis: "total", representation: "rectangular", u: 1, element: 0 }); return local.get(key); };
    const link = (ref, label) => `<button type="button" class="sheet-link" data-sheet-select="${h(JSON.stringify(ref))}">${h(label || `${ref.kind} ${ref.id}`)}</button>`;
    const pinButton = (ref) => `<button type="button" data-sheet-pin="${h(JSON.stringify(ref))}" aria-label="Pin ${h(ref.kind)} ${h(ref.id)}">Pin</button>`;
    const source = (path) => `<code class="sheet-source" data-source-path="${h(path)}">${h(path)}</code>`;
    const groundNote = (port, terminalId) => d.getIndex().buses.find((b) => b.ref.id === port?.busId)?.groundedTerminals.includes(terminalId) || false;

    function connectionGraph(connection, port, winding = false, selected = 0) {
      const t = connection.terminals;
      if (!connection.elements.length) {
        return `<div class="sheet-unknown">${h(connection.warning || "Connection topology not established.")}</div>${table(["External terminal", "Grounding at bus"], t.map((v) => [h(v), groundNote(port, v) ? "ideal ground" : "not declared"]))}`;
      }
      const positions = new Map();
      const config = connection.configuration;
      if (config === "DELTA") { positions.set(t[0], [150, 34]); positions.set(t[1], [55, 188]); positions.set(t[2], [245, 188]); }
      else if (config === "WYE") { t.slice(0, 3).forEach((v, i) => positions.set(v, [50 + 100 * i, 34])); positions.set(t[3], [150, 194]); }
      else if (config === "CENTER_TAP") { positions.set(t[0], [50, 50]); positions.set(t[1], [150, 154]); positions.set(t[2], [250, 50]); }
      else { positions.set(t[0], [50, 100]); positions.set(t[1], [250, 100]); }
      let body = "";
      connection.elements.forEach((e) => {
        const a = positions.get(e.pair[0]);
        const b = config === "WYE" ? [150, 148] : positions.get(e.pair[1]);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const element = winding ? wire(coil(a, b)) : `${wire(`M${a}L${b}`)}<rect class="sheet-element" x="${mx - 21}" y="${my - 13}" width="42" height="26"/>${text(mx, my + 5, `e${e.index + 1}`, 'text-anchor="middle"')}`;
        body += `<g data-sheet-element-mark="${e.index}" class="${e.index === selected ? "sheet-highlight" : ""}">${element}</g>`;
      });
      if (config === "WYE") body += dot(150, 148) + wire("M150 148V194");
      positions.forEach(([x, y], id) => {
        // Arbitrary-length IDs are also visible without clipping in the port table.
        body += terminal(x, y, id.length > 14 ? `${id.slice(0, 11)}…` : id);
        if (groundNote(port, id)) body += ground(x, y + 4);
      });
      return svg(body, 300, 245, `${config} ${winding ? "winding" : "electrical elements"}; ${connection.elements.map((e) => e.pair.join(" to ")).join(", ")}`);
    }

    function ports(model) {
      const rows = [];
      model.item.ports.forEach((p) => p.terminals.length ? p.terminals.forEach((t, i) => rows.push([h(p.role), link({ kind: "bus", id: p.busId }, p.busId), `${i + 1}: ${h(t)}`, groundNote(p, t) ? "ideal ground at this bus" : "not declared"])) : rows.push([h(p.role), link({ kind: "bus", id: p.busId }, p.busId), "not supplied", "not established"]));
      return rows.length ? section("External terminals", table(["Port", "Bus", "Source order / ID", "Grounding"], rows) + '<p class="sheet-note">Terminal IDs are preserved. Grounding is local to each bus; it does not establish conductor phase identity.</p>') : "";
    }

    function busSheet(model) {
      const item = model.item, incident = d.getIndex().byBus.get(item.ref.id) || [];
      const rows = item.terminals.flatMap((t) => {
        const connections = incident.flatMap((asset) => asset.ports.filter((p) => p.busId === item.ref.id && p.terminals.includes(t)).map((p) => ({ asset, p })));
        const status = item.groundedTerminals.includes(t) ? "ideal ground" : "not declared";
        return connections.length ? connections.map(({ asset, p }) => [h(t), status, link(asset.ref), h(p.role), h(asset.ref.kind === "switch" ? switchState(asset.sourceRecord) : asset.status), pinButton(asset.ref)]) : [[h(t), status, "no connected asset", "—", "—", ""]];
      });
      return section("Terminal incidence · all connections", table(["Terminal", "Grounding", "Asset", "Port", "State", "Atlas"], rows));
    }

    function switchState(record, i) {
      if (Array.isArray(record.open_switch)) return "unsupported per-pole state";
      if (record.open_switch === true) return "open";
      if (record.open_switch === false) return "closed";
      return "unknown";
    }

    function branchDrawing(item, pairs, s, isSwitch = false) {
      const left = item.ports[0], right = item.ports[1];
      const rightTerminals = d.getIndex().buses.find((b) => b.ref.id === right?.busId)?.terminals || right?.terminals || [];
      const order = [...rightTerminals.filter((t) => right?.terminals.includes(t)), ...(right?.terminals || []).filter((t) => !rightTerminals.includes(t))];
      let body = "";
      pairs.forEach((p, i) => {
        const y = 35 + i * 55, toY = 35 + Math.max(0, order.indexOf(p.to)) * 55;
        const state = switchState(item.sourceRecord, i);
        let path = "";
        if (isSwitch) {
          path = wire(`M55 ${y}H132M172 ${y}H205L245 ${toY}`);
          path += state === "open" ? wire(`M132 ${y}l34 -18`) : state === "closed" ? wire(`M132 ${y}H172`) : text(150, y + 5, "?", 'text-anchor="middle"');
          path += `<circle class="sheet-terminal" cx="132" cy="${y}" r="3"/><circle class="sheet-terminal" cx="172" cy="${y}" r="3"/>`;
        } else path = wire(`M55 ${y}H112M188 ${y}H205L245 ${toY}`);
        if (p.from === null || p.to === null) path = wire(`M${p.from === null ? 205 : 55} ${y}h40`) + text(150, y + 5, "unmatched", 'text-anchor="middle"');
        body += `<g data-sheet-conductor="${i}" class="${[s.row, s.column].includes(i) ? "sheet-highlight" : ""}">${path}${terminal(55, y, p.from === null ? "?" : String(p.from).slice(0, 14))}${terminal(245, toY, p.to === null ? "?" : String(p.to).slice(0, 14))}${p.from !== null && groundNote(left, p.from) ? ground(55, y + 4) : ""}${p.to !== null && groundNote(right, p.to) ? ground(245, toY + 4) : ""}</g>`;
      });
      if (!isSwitch) body += `<rect class="sheet-coupling" x="112" y="16" width="76" height="${Math.max(44, pairs.length * 55 - 16)}"/>${text(150, 40, "Coupled", 'text-anchor="middle"')}${text(150, 58, "series Z", 'text-anchor="middle"')}`;
      return svg(body, 300, Math.max(110, pairs.length * 55 + 24), isSwitch ? "Switch contacts and ordered terminal mapping; crossings are not junctions" : "Conductors enter a shared coupled series model; see the full impedance matrix");
    }

    function matrixTable(model, matrix, s) {
      const line = model.line;
      const total = s.basis === "total" && (!line.perLength || matrix.totalsAvailable);
      const scale = total && line.perLength ? line.length.value : 1;
      const units = matrix.units + (line.perLength && !total ? "/m" : "");
      const label = (i) => line.pairs[i] ? `${line.pairs[i].from ?? "?"}→${line.pairs[i].to ?? "?"}` : `index ${i + 1} (unmapped)`;
      const value = (cell) => {
        const a = cell.real, b = cell.imaginary;
        if (a.state === "not supplied" && b.state === "not supplied") return "not supplied";
        if (s.representation === "polar" && a.state === "supplied" && b.state === "supplied") return `${compact(Math.hypot(a.value, b.value) * scale)} ∠ ${compact(Math.atan2(b.value, a.value) * 180 / Math.PI)}°`;
        return `${a.state === "supplied" ? compact(a.value * scale) : a.state} ${b.state === "supplied" && b.value < 0 ? "−" : "+"} j${b.state === "supplied" ? compact(Math.abs(b.value) * scale) : b.state}`;
      };
      const cellButton = (cell) => `<button type="button" class="sheet-matrix-cell" data-matrix="${matrix.id}" data-row="${cell.row}" data-column="${cell.column}" aria-pressed="${s.matrix === matrix.id && s.row === cell.row && s.column === cell.column}" aria-label="${h(`${matrix.title}, row ${label(cell.row)}, column ${label(cell.column)}: ${value(cell)} ${units}`)}">${h(value(cell))}</button>`;
      let content = `<p>${h(matrix.state)} · ${h(units)}${line.perLength && !matrix.totalsAvailable ? " · segment totals unavailable" : ""}</p>`;
      if (matrix.state !== "not supplied") {
        if (matrix.sparse) content += `<p>Large matrix: all supplied entries shown as an indexed table; absent entries remain unknown.</p>${table(["Row", "Column", h(units)], matrix.cells.map((cell) => [h(label(cell.row)), h(label(cell.column)), cellButton(cell)]))}`;
        else content += table(["row / column", ...Array.from({ length: matrix.dimension }, (_, i) => h(label(i)))], Array.from({ length: matrix.dimension }, (_, i) => [h(label(i)), ...matrix.cells.filter((cell) => cell.row === i).map(cellButton)]), "sheet-matrix");
      }
      return section(matrix.title, content);
    }

    function matrixEvidence(model, s) {
      const m = model.line.matrices.find((v) => v.id === s.matrix), c = m?.cells.find((v) => v.row === s.row && v.column === s.column);
      if (!c) return '<p class="sheet-note">Select a supplied matrix entry to trace its source.</p>';
      const pairs = model.line.pairs, name = (i) => pairs[i] ? `${pairs[i].from ?? "?"}→${pairs[i].to ?? "?"}` : `unmapped index ${i + 1}`;
      const meaning = m.id === "series" ? `Current on conductor ${name(c.column)} contributes to the series voltage drop on ${name(c.row)}. ${c.row === c.column ? "Self term." : "Mutual coupling; not an extra physical wire."}` : `Admittance entry in the ${m.id}-end multiport model. Rows and columns follow conductor order; no physical ground branch is inferred.`;
      return `<h4>${h(m.title)} [${h(name(c.row))}, ${h(name(c.column))}]</h4><p>${h(meaning)}</p>${table(["Term", "Source value", "Evidence"], [["Real", `${h(fmt(c.real.value))} ${h(m.units)}${model.line.perLength ? "/m" : ""}`, source(c.real.path)], ["Imaginary", `${h(fmt(c.imaginary.value))} ${h(m.units)}${model.line.perLength ? "/m" : ""}`, source(c.imaginary.path)]])}<p>${model.line.perLength ? m.totalsAvailable ? `Segment totals = supplied per-metre entries × ${h(model.line.length.value)} m. ${source(model.line.length.path)}` : "Segment total derivation unavailable; no unit-length fallback is applied." : "Inline matrices are section totals; length is not used to scale them."}</p>`;
    }

    function lineSheet(model, s, uid) {
      const l = model.line;
      const mapping = table(["Conductor order", "From terminal", "To terminal", "Limit"], l.pairs.map((p) => [String(p.index + 1), h(p.from ?? "unmatched"), h(p.to ?? "unmatched"), ...[l.ratings.filter((r) => r.value !== undefined).map((r) => `${h(r.key)}: ${h(Array.isArray(r.value) ? fmt(r.value[p.index]) : "unresolved scalar")} ${h(r.unit)}`).join("<br>") || "not supplied"]]));
      const copy = l.matrices.map((m) => `${m.title} [${m.units}${l.perLength ? "/m source" : ""}]\nrow\tcolumn\treal\timaginary\n${m.cells.map((c) => `${c.row + 1}\t${c.column + 1}\t${fmt(c.real.value)}\t${fmt(c.imaginary.value)}`).join("\n")}`).join("\n\n");
      return section("Conductor connections", `<div class="sheet-grid"><div>${branchDrawing(model.item, l.pairs, s)}</div><div>${mapping}<p class="sheet-note">Crossings are not junctions. Source: ${link(l.source)}. Length: ${h(fmt(l.length.value))} m.</p></div></div>`) + `<div class="sheet-controls"><label for="${uid}-basis">Values <select id="${uid}-basis" data-sheet-basis><option value="total" ${s.basis === "total" ? "selected" : ""}>Segment total (when available)</option><option value="source" ${s.basis === "source" ? "selected" : ""}>Source basis</option></select></label><label for="${uid}-form">Complex form <select id="${uid}-form" data-sheet-form><option value="rectangular" ${s.representation === "rectangular" ? "selected" : ""}>Real + j imaginary</option><option value="polar" ${s.representation === "polar" ? "selected" : ""}>Magnitude / angle</option></select></label><button data-sheet-copy="${h(copy)}" aria-label="Copy branch matrices">Copy source matrices</button></div>${l.matrices.map((m) => matrixTable(model, m, s)).join("")}${section("Selected term · source and derivation", `<div data-matrix-evidence aria-live="polite">${matrixEvidence(model, s)}</div>`)}<p class="sheet-note">Neutral representation: ${h(model.item.sourceRecord.neutral_representation || "not declared; matrix order alone does not establish reduction")}.</p>`;
    }

    function loadSheet(model, s, uid) {
      const load = model.load;
      const rows = load.elements.map((e) => [`<button type="button" data-sheet-element="${e.index}" aria-pressed="${s.element === e.index}">e${e.index + 1} · ${h(e.pair.join("–"))}</button>`, h(fmt(e.p_nom)), h(fmt(e.q_nom)), h(fmt(e.v_nom)), h(load.reference)]);
      const coefficients = load.model === "zip" ? table(["Element", "P: Z / I / P", "Q: Z / I / P"], load.elements.map((e) => [h(e.pair.join("–")), [e.alpha_z, e.alpha_i, e.alpha_p].map(fmt).map(h).join(" / "), [e.beta_z, e.beta_i, e.beta_p].map(fmt).map(h).join(" / ")])) : load.model === "exponential" ? table(["Element", "P exponent", "Q exponent"], load.elements.map((e) => [h(e.pair.join("–")), h(fmt(e.gamma_p)), h(fmt(e.gamma_q))])) : "";
      const law = { constant_power: "P = P₀; Q = Q₀", constant_current: "P = P₀u; Q = Q₀u", constant_impedance: "P = P₀u²; Q = Q₀u²", zip: "P = P₀(αz u² + αi u + αp); Q = Q₀(βz u² + βi u + βp)", exponential: "P = P₀u^γp; Q = Q₀u^γq" }[load.model] || "Unsupported load law; all supplied fields remain visible below.";
      return section(`${load.configuration} connection · load model: ${load.model}`, `<div class="sheet-grid"><div>${connectionGraph(load, model.item.ports[0], false, s.element)}</div><div>${table(["Element", "P₀ [W]", "Q₀ [var]", "V₀ [V]", "Reference"], rows)}<p>${h(law)}</p><p class="sheet-note">u = element voltage magnitude / V₀ · model ${h(load.origin)}. Positive P/Q denote consumption.</p>${coefficients}</div></div>`) + (load.elements.length ? section("Model response · calculated illustration", `<p>This is the declared load law, not a solved network result. Nominal data stays unchanged. Time-series scaling is not applied.</p><label for="${uid}-u">All element voltage magnitudes: <output data-sheet-u-label>${s.u.toFixed(2)}</output> × nominal</label><input id="${uid}-u" data-sheet-u type="range" min="0.9" max="1.1" step="0.01" value="${s.u}"><div data-sheet-response aria-live="polite">${responseTable(load, s.u)}</div>`) : "");
    }
    const responseTable = (load, u) => table(["Element", "Voltage [V]", "P [W]", "Q [var]"], E.loadResponse(load, u).map((e) => [h(e.pair.join("–")), h(compact(e.voltage)), h(compact(e.p)), h(compact(e.q))])) + '<p class="sheet-note">Unavailable outputs indicate missing or invalid nominal values, coefficients, voltage bases, or an unsupported law.</p>';

    function transformerSheet(model) {
      const r = model.item.sourceRecord;
      const windingHtml = model.windings.map((w, i) => `<section class="sheet-winding"><h4>W${i + 1} · ${link({ kind: "bus", id: w.port.busId }, w.port.busId)} · ${h(w.connection.configuration)}</h4>${connectionGraph(w.connection, w.port, true, -1)}${table(["Quantity", "Value"], [["Nominal voltage", `${h(fmt(w.raw.v_nom))} V · ${h(w.voltageReference)}`], ["Terminal order", h(w.port.terminals.join(", "))], ["Coil resistance", `${h(fmt(w.raw.r_winding))} Ω`], ["Current limit", `${h(fmt(w.raw.i_max))} A`], ["Delta rotation", h(fmt(w.raw.delta_roll))]])}${source(w.path)}</section>`).join("");
      return section("Winding connections", `<div class="sheet-windings">${windingHtml}</div><p class="sheet-note">Each winding retains its bus and terminals. No direct bus-to-bus conductor pairing is implied. ${/auto/.test(model.item.subtype || "") ? "Autotransformer internal conductive topology is not yet interpreted; see all supplied fields below." : "Winding graphs show connections; the shared transformer model establishes coupling."}</p>`) + section("Coupling, bases and taps", table(["Quantity", "Value / reference"], [["Power base", `${h(fmt(r.s_rating))} VA`], ["Pairwise x_sc", `${h(fmt(r.x_sc))}${r.windings ? " Ω · all referred to winding 1 coil-voltage base" : " · reference not established"}`], ["Tap", r.tap === undefined ? "not supplied (no implicit value applied)" : h(fmt(r.tap))], ["Tap range", `${h(fmt(r.tap_min))} … ${h(fmt(r.tap_max))}`], ["No-load G / B", `${h(fmt(r.g_no_load))} / ${h(fmt(r.b_no_load))} S · winding 1 / from-side reference`], ["Vector group / phase shift", h(fmt(r.vector_group ?? r.phase_shift))]]));
    }

    function otherSheet(model, s) {
      const item = model.item, r = item.sourceRecord, terminals = item.ports?.[0]?.terminals || [];
      if (!item.ports.length) return section("Record parameters", '<p>This record has no physical ports. All supplied parameters and unsupported fields are listed below; no connection diagram is invented.</p>');
      if (item.ref.kind === "voltage_source") {
        const rows=terminals.map((t,i) => [h(t),h(fmt(r.v_magnitude?.[i])),h(fmt(r.v_angle?.[i])),groundNote(item.ports[0],t)?"ideal ground at bus":"terminal–ground potential"]);
        return section("Prescribed terminal voltages", table(["Terminal", "Magnitude [V]", "Angle [rad]", "Reference"],rows)+'<p>BMOPF voltage sources prescribe each terminal potential relative to the global ground reference. Missing angles or magnitudes remain unavailable; no balanced phase set is assumed.</p>');
      }
      if (item.ref.kind === "switch") {
        const count = Math.max(...item.ports.map((p) => p.terminals.length), 0);
        const pairs = Array.from({ length: count }, (_, i) => ({ from: item.ports[0]?.terminals[i] ?? null, to: item.ports[1]?.terminals[i] ?? null }));
        return section("Switch contacts", `<div class="sheet-grid"><div>${branchDrawing(item, pairs, s, true)}</div><div><p>${r.open_switch === true ? "Open switch" : "Switch"}: ${h(switchState(r))} · common device state. Service state: ${h(item.status)}.</p>${table(["Contact", "From → to", "State"], pairs.map((p, i) => [String(i + 1), h(`${p.from ?? "unmatched"} → ${p.to ?? "unmatched"}`), h(switchState(r, i))]))}</div></div>`);
      }
      if (["shunt", "dc_grounding"].includes(item.ref.kind)) {
        const drawing = terminals.map((t, i) => `${terminal(60, 30 + i * 45, String(t).slice(0,14))}${wire(`M60 ${30+i*45}H170`)}${groundNote(item.ports[0],t) ? ground(60,34+i*45) : ""}`).join("") + `<rect class="sheet-coupling" x="170" y="10" width="100" height="${Math.max(80, terminals.length * 45)}"/>${text(220,40,"Multiport Y",'text-anchor="middle"')}`;
        return section("Multiport shunt model", `${svg(drawing,300,Math.max(120,terminals.length*45+30),"Shunt terminals connected to the supplied admittance model")}<p>Terminals: ${h(terminals.join(", ") || "not supplied")}. Admittance entries are displayed below in S. The supplied matrix does not imply a particular physical branch realization.</p>`);
      }
      const configuration = r.configuration || ({ FOUR_LEG: "WYE", THREE_LEG: "DELTA", SINGLE_PHASE: "SINGLE_PHASE" }[r.topology]);
      const connection = E.topology(configuration, terminals);
      if (item.ref.kind === "capacitor") {
        return section("Capacitor elements · nameplate model", `<div class="sheet-grid"><div>${connectionGraph(connection,item.ports[0])}</div><div>${table(["Element", "Q rated [var]", "Nominal V [V]", "Derived B [S]"],connection.elements.map((e) => {
          const q=E.componentValue(r,"q_rated",e.index,connection.elements.length),v=E.componentValue(r,"v_nom",e.index,connection.elements.length);
          return [h(e.pair.join("–")),h(fmt(q)),h(fmt(v)),E.number(q)&&E.number(v)&&v>0 ? h(compact(q/(v*v))) : "unavailable"];
        }))}<p>B = q_rated / v_nom²; Q supplied = B|V|². Voltage reference: ${h(connection.reference || "not established")}.</p></div></div>`);
      }
      const title = ["generator", "ibr", "voltage_source", "dc_source"].includes(item.ref.kind) ? "Source connection, controls and capability" : "Electrical connection";
      const capability = ["generator", "ibr"].includes(item.ref.kind) ? connection.elements.map((e) => {
        const limit = E.componentValue(r,"s_max",e.index,connection.elements.length);
        if (!E.number(limit) || limit <= 0) return "";
        const result=d.getResult(item)?.[e.pair[0]], p=result?.pg, q=result?.qg;
        const extent=Math.max(limit,E.number(p)?Math.abs(p):0,E.number(q)?Math.abs(q):0), radius=90*limit/extent;
        const operating=E.number(p)&&E.number(q) ? dot(150+90*p/extent,120-90*q/extent) : "";
        return `<div>${svg(`${wire("M30 120H270M150 15V225")}<circle class="sheet-wire" cx="150" cy="120" r="${radius}"/>${operating}${text(260,140,"P [W]",'text-anchor="end"')}${text(158,28,"Q [var]")}`,300,245,`Element ${e.pair.join("–")} apparent power circle, ${limit} VA`)}<p>e${e.index+1} · ${h(e.pair.join("–"))}: P² + Q² ≤ ${h(limit)}². Axis extent ±${h(compact(extent))}. ${operating ? `Operating point ${h(p)} W, ${h(q)} var.` : "Operating point unavailable."}</p></div>`;
      }).join("") : "";
      return section(title, `<div class="sheet-grid"><div>${connectionGraph(connection, item.ports?.[0], false, s.element)}</div><div>${table(["Quantity", "Value"], [["Configuration", h(connection.configuration)], ["Control mode", h(fmt(r.control_mode))], ["Control profile", h(fmt(r.control_profile))], ["P limits [W]", h(`${fmt(r.p_min)} … ${fmt(r.p_max)}`)], ["Q limits [var]", h(`${fmt(r.q_min)} … ${fmt(r.q_max)}`)], ["S limit [VA]", h(fmt(r.s_max))], ["I limit [A]", h(fmt(r.i_max))]])}<p class="sheet-note">Element branches describe external connection only; internal machine or converter circuitry is not inferred. Capability limits retain their supplied scope and array order.</p></div></div>`) + (capability ? section("Apparent-power boundaries", `<div class="sheet-windings">${capability}</div><p>These circles show only the supplied S limits. P/Q bounds, current limits, controls and DC coupling can further restrict dispatch; all supplied fields remain visible below.</p>`) : "");
    }

    function fieldTable(fields) { return table(["Source field", "Value", "Unit"], fields.map((f) => [source(f.path), h(fmt(f.value)), h(f.unit || "source convention")])); }

    function resultSheet(model) {
      const result = d.getResult(model.item), comparison = d.getComparison(model.item);
      const context = d.getResultContext();
      if (!result && !comparison) return section("Operating point", `<p>${context.attached ? "No result record for this asset in the selected scenario." : "No results attached."}</p>`);
      const currentRows = E.resultFields(model.item, result), priorRows = E.resultFields(model.item, comparison);
      const a = new Map(currentRows.map((r) => [r.identity, r])), b = new Map(priorRows.map((r) => [r.identity, r]));
      const rows = [...new Set([...a.keys(), ...b.keys()])].map((id) => {
        const current = a.get(id), prior = b.get(id), row = current || prior;
        const compatible = current?.comparable && prior?.comparable && current.unit === prior.unit && current.reference === prior.reference && E.number(current.value) && E.number(prior.value);
        return [h(row.label), h(fmt(current?.value)), h(row.unit || "source convention"), h(row.reference), ...(context.comparing ? [h(`${fmt(prior?.value)}${prior ? ` ${prior.unit} · ${prior.reference}` : ""}`), compatible ? h(compact(current.value - prior.value)) : "not comparable"] : [])];
      });
      const phasors = E.voltagePhasors(model.item, result);
      const groundedInconsistencies = phasors.filter((p) => model.item.groundedTerminals?.includes(p.terminal) && Math.hypot(p.real,p.imaginary) > 1e-6);
      const missingVoltages = phasors.length ? model.item.terminals.filter((t) => !phasors.some((p) => p.terminal === t)) : [];
      const voltageEvidence = (groundedInconsistencies.length ? `<p class="sheet-problems">Supplied nonzero voltage at ideally grounded terminal(s): ${h(groundedInconsistencies.map((p) => p.terminal).join(", "))}. Check case/result consistency (display check tolerance 10⁻⁶ V).</p>` : "") + (missingVoltages.length ? `<p>Rectangular voltage unavailable for terminal(s): ${h(missingVoltages.join(", "))}.</p>` : "");
      let phasorDrawing = "";
      if (phasors.length) {
        const scale = Math.max(1, ...phasors.map((p) => Math.hypot(p.real, p.imaginary)));
        phasorDrawing = `<h4>Voltage phasors · terminal–ground · shared scale ±${h(compact(scale))} V</h4><div class="sheet-windings">${phasors.map((p) => {
          const x = 150 + 90 * p.real / scale, y = 120 - 90 * p.imaginary / scale;
          return `<div>${svg(`${wire("M40 120H260M150 20V220")}${text(255, 140, "Re [V]", 'text-anchor="end"')}${text(158, 28, "Im [V]")}${wire(`M150 120L${x} ${y}`, 'style="stroke:var(--accent);stroke-width:3"')}${dot(x,y)}`, 300, 245, `Terminal ${p.terminal} voltage phasor: ${p.real} + j${p.imaginary} V`)}<p>Terminal ${h(p.terminal)}: ${h(compact(p.real))} + j${h(compact(p.imaginary))} V</p></div>`;
        }).join("")}</div>`;
      }
      return section("Operating point · scenario comparison", `<p>Current: ${h(context.label || "attached result")} · scenario: ${h(context.scenario || "single network")}${context.comparing ? ` · comparison: ${h(context.comparisonLabel)}` : ""}</p>${table(["Quantity / identity", "Current", "Unit", "Reference / direction", ...(context.comparing ? ["Comparison", "Δ current − comparison"] : [])], rows)}${voltageEvidence}${phasorDrawing}<p class="sheet-note">Terminal-keyed BMOPFTools quantities use their documented SI conventions (voltage angles in radians). Flat arrays are aligned only when cardinality and terminal identity agree; differences require compatible units and references. Other values retain their source indexing. ${phasors.length ? "Phasors derive from supplied rectangular voltages." : "Phasors unavailable without terminal-keyed rectangular voltages."} No losses are inferred from terminal currents.</p>`);
    }

    function comparisonContext(item, index) {
      return { frequency: index.raw.base_frequency, buses: Object.fromEntries([...new Set(item.ports.map((p) => p.busId))].map((id) => {
        const bus = index.buses.find((b) => b.ref.id === id);
        return [id, bus ? { terminals: bus.terminals, grounded: bus.groundedTerminals, neutral: bus.sourceRecord.neutral_terminal } : null];
      })) };
    }

    function difference(model) {
      const previous = comparisonIndex ? find(model.item.ref, comparisonIndex) : null;
      if (!comparisonIndex) return "";
      if (!previous) return section("Model differences", '<p>Asset is absent from the comparison case. No other asset was substituted.</p>');
      const priorCode = comparisonIndex?.entities.find((e) => e.ref.kind === "linecode" && e.ref.id === previous.sourceRecord.linecode)?.sourceRecord;
      const currentCode = d.getIndex().entities.find((e) => e.ref.kind === "linecode" && e.ref.id === model.item.sourceRecord.linecode)?.sourceRecord;
      const changes = E.diffRecords({ record: model.item.sourceRecord, linecode: currentCode, context: comparisonContext(model.item, d.getIndex()) }, { record: previous.sourceRecord, linecode: priorCode, context: comparisonContext(previous, comparisonIndex) });
      return section("Model differences · source parameters", `<p>Comparison: ${h(comparisonName)}. Identity: ${h(refKey(model.item.ref))}. ${previous.subtype !== model.item.subtype ? `Subtype changed: ${h(previous.subtype)} → ${h(model.item.subtype)}.` : ""}</p>${changes.length ? table(["Field", "Before", "Current", "Change"], changes.map((c) => [source(c.path), h(fmt(c.before)), h(fmt(c.after)), h(c.change)])) : "<p>No source-parameter changes.</p>"}<p class="sheet-note">Terminal maps and array positions are compared explicitly; a changed map is not silently realigned. Referenced linecode changes are included. Operating-point differences are separate.</p>`);
    }

    function sheet(item) {
      const model = E.interpret(item, d.getIndex()), s = stateFor(item), uid = `model-sheet-${++instance}`;
      const unrepresented = model.fields.filter((f) => f.category === "unrepresented");
      const parameters = model.fields.filter((f) => f.category === "parameters");
      const connectionFields = model.fields.filter((f) => f.category === "connections");
      const metadata = model.fields.filter((f) => f.category === "metadata");
      const content = item.ref.kind === "bus" ? busSheet(model) : model.line ? lineSheet(model, s, uid) : model.load ? loadSheet(model, s, uid) : model.windings.length ? transformerSheet(model) : otherSheet(model, s);
      const inherited = model.line && model.line.source.kind === "linecode" ? E.manifest(find(model.line.source)) : [];
      return `<article class="model-sheet" data-sheet-ref="${h(JSON.stringify(item.ref))}" aria-label="${h(`${item.ref.kind} ${item.ref.id} electrical model`)}"><header class="sheet-header"><div><h2>${h(item.ref.kind)} <span class="sheet-id">${h(item.ref.id)}</span></h2><p>${h(item.subtype || "")} · service ${h(item.status)} · frequency ${h(fmt(model.frequency))} Hz</p></div><div class="sheet-actions">${pinButton(item.ref)}<button type="button" data-sheet-baseline>Capture case baseline</button><button type="button" data-sheet-export>Export sheet HTML</button></div></header>${model.problems.length ? section("Unresolved model interpretation", `<ul class="sheet-problems">${model.problems.map((p) => `<li>${h(p)}</li>`).join("")}</ul>`) : ""}${content}${resultSheet(model)}${difference(model)}${ports(model)}${parameters.length ? section("Governing parameters · complete source values", fieldTable(parameters)) : ""}${inherited.length ? section("Referenced linecode · ratings and other fields", fieldTable(inherited)) : ""}${connectionFields.length ? section("Connection evidence · source fields", fieldTable(connectionFields)) : ""}${section("Unrepresented model fields", unrepresented.length ? `<p>These supplied fields are not yet interpreted by the drawing. Their values remain visible.</p>${fieldTable(unrepresented)}` : '<p>All supplied fields have a visible destination in this sheet or its source metadata. This is field coverage, not a claim that the electrical model is complete.</p>')}${metadata.length ? `<details class="sheet-metadata"><summary>Source metadata (${metadata.length} fields)</summary>${fieldTable(metadata)}</details>` : ""}<footer class="sheet-footer">${source(item.ref.pointer)} · ${h(E.VERSION)} · displayed numbers retain their source units; matrix display rounding is limited to six significant digits, with exact source values in evidence and copy.</footer></article>`;
    }

    function download(name, content, type) {
      const url = URL.createObjectURL(new Blob([content], { type }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = name.replace(/[^a-zA-Z0-9_.-]/g, "_"); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportHtml(root, name) {
      let css = "";
      for (const styleSheet of document.styleSheets) { try { css += [...styleSheet.cssRules].map((r) => r.cssText).join("\n"); } catch (_) { /* cross-origin styles are optional */ } }
      const restored = root.cloneNode(true);
      restored.querySelectorAll("button").forEach((n) => { if (n.matches(".sheet-matrix-cell,.sheet-link,[data-sheet-element]")) n.replaceWith(document.createTextNode(n.textContent)); else n.remove(); });
      restored.querySelectorAll("input,select,.atlas-toolbar,.sheet-actions").forEach((n) => n.remove());
      restored.querySelectorAll("details").forEach((n) => n.open = true);
      download(`${name}.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${h(name)}</title><style>${css}\nbody{padding:20px}.model-sheet{max-width:1100px;margin:0 auto 24px}</style><body>${restored.outerHTML}</body></html>`, "text/html");
    }

    function render(target, selected, full = false) {
      const item = find(selected);
      const items = full ? [...(item ? [item] : []), ...pins.map((ref) => find(ref)).filter((v) => v && (!item || refKey(v.ref) !== refKey(item.ref)))] : item ? [item] : [];
      const toolbar = full ? `<div class="atlas-toolbar"><h2>Electrical model atlas</h2><div class="sheet-actions"><button type="button" data-atlas-export ${items.length ? "" : "disabled"}>Export atlas HTML</button><label class="sheet-file">Compare model JSON<input type="file" data-model-comparison accept=".json,application/json"></label>${comparisonIndex ? '<button type="button" data-clear-comparison>Clear model comparison</button>' : ""}</div><p>Selected model and ${pins.length} pinned sheet${pins.length === 1 ? "" : "s"}. Pin neighbours to inspect a route together. Important fields stay visible; selections only link evidence.</p><div class="atlas-pins">${pins.map((ref, i) => `<span>${link(ref)}<button type="button" data-unpin="${i}" aria-label="Unpin ${h(ref.id)}">Remove</button>${i ? `<button type="button" data-pin-up="${i}" aria-label="Move ${h(ref.id)} earlier">↑</button>` : ""}</span>`).join("")}</div><p class="atlas-feedback" role="status"></p></div>` : "";
      target.innerHTML = `<div class="model-atlas">${toolbar}${items.map(sheet).join("") || '<div class="message">Select any asset or bus to open its electrical model sheet.</div>'}</div>`;
      const refresh = () => render(target, selected, full);
      target.querySelectorAll("[data-sheet-select]").forEach((b) => b.addEventListener("click", () => d.select(JSON.parse(b.dataset.sheetSelect))));
      target.querySelectorAll("[data-sheet-pin]").forEach((b) => b.addEventListener("click", () => { const ref = JSON.parse(b.dataset.sheetPin); if (!pins.some((r) => refKey(r) === refKey(ref))) pins.push(ref); b.textContent = "Pinned"; if (full) refresh(); }));
      target.querySelectorAll("[data-unpin]").forEach((b) => b.addEventListener("click", () => { pins.splice(Number(b.dataset.unpin), 1); refresh(); }));
      target.querySelectorAll("[data-pin-up]").forEach((b) => b.addEventListener("click", () => { const i = Number(b.dataset.pinUp); [pins[i - 1], pins[i]] = [pins[i], pins[i - 1]]; refresh(); }));
      target.querySelector("[data-atlas-export]")?.addEventListener("click", () => exportHtml(target.querySelector(".model-atlas"), "electrical-model-atlas"));
      target.querySelector("[data-clear-comparison]")?.addEventListener("click", () => { comparisonIndex = null; comparisonName = ""; refresh(); });
      target.querySelector("[data-model-comparison]")?.addEventListener("change", async (event) => {
        const feedback = target.querySelector(".atlas-feedback");
        const activeIndex = d.getIndex(), previousIndex = comparisonIndex, previousName = comparisonName;
        try {
          const file = event.target.files[0];
          if (!file) return;
          if (file.size > 25 * 1024 * 1024) throw new Error("Comparison case exceeds 25 MB.");
          const raw = JSON.parse(await file.text());
          if (activeIndex !== d.getIndex() || !event.target.isConnected) return;
          const pending = [[raw, 0]];
          let count = 0;
          while (pending.length) {
            const [value, depth] = pending.pop();
            if (++count > 100000 || depth > 100) throw new Error("Comparison case exceeds the 100,000-value or 100-level nesting limit.");
            if (value && typeof value === "object") Object.values(value).forEach((v) => pending.push([v, depth + 1]));
          }
          comparisonIndex = globalThis.BMOPFModel.buildCaseIndex(raw); comparisonName = file.name; refresh();
        } catch (error) { if (activeIndex !== d.getIndex() || !event.target.isConnected) return; comparisonIndex = previousIndex; comparisonName = previousName; feedback.textContent = `Model comparison unavailable: ${error.message}`; }
      });
      target.querySelectorAll(".model-sheet").forEach((article) => {
        const item = find(JSON.parse(article.dataset.sheetRef)), model = E.interpret(item, d.getIndex()), s = stateFor(item);
        article.querySelector("[data-sheet-baseline]")?.addEventListener("click", () => { comparisonIndex = globalThis.BMOPFModel.buildCaseIndex(JSON.parse(JSON.stringify(d.getIndex().raw))); comparisonName = `${d.getIndex().name} · baseline captured ${new Date().toLocaleTimeString()}`; refresh(); });
        article.querySelector("[data-sheet-export]")?.addEventListener("click", () => exportHtml(article, `${item.ref.kind}-${item.ref.id}-model`));
        article.querySelectorAll("[data-sheet-svg]").forEach((button, index) => button.addEventListener("click", () => {
          const original = button.previousElementSibling, clone = original.cloneNode(true);
          const elements = [original, ...original.querySelectorAll("*")], clones = [clone, ...clone.querySelectorAll("*")];
          elements.forEach((element, i) => {
            const style = getComputedStyle(element);
            for (const key of ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight", "text-anchor"]) clones[i].style.setProperty(key, style.getPropertyValue(key));
          });
          download(`${item.ref.kind}-${item.ref.id}-drawing-${index + 1}.svg`, new XMLSerializer().serializeToString(clone), "image/svg+xml");
        }));
        const previous = comparisonIndex ? find(item.ref, comparisonIndex) : null;
        if (previous) {
          const changes = E.diffRecords(item.sourceRecord, previous.sourceRecord);
          const changedPaths = new Set(changes.map((c) => `${item.ref.pointer}${c.path}`));
          article.querySelectorAll("[data-source-path]").forEach((node) => {
            if (changedPaths.has(node.dataset.sourcePath)) { node.closest("tr")?.classList.add("sheet-changed"); node.closest("tr")?.setAttribute("aria-label", "Changed model field"); }
          });
          article.querySelectorAll("[data-sheet-conductor]").forEach((mark) => {
            const i=Number(mark.dataset.sheetConductor);
            if (["terminal_map_from","terminal_map_to"].some((k) => item.sourceRecord[k]?.[i] !== previous.sourceRecord[k]?.[i])) mark.classList.add("sheet-changed-conductor");
          });
        }
        article.querySelectorAll("[data-sheet-copy]").forEach((b) => b.addEventListener("click", async () => { const ok = await d.copy(b.dataset.sheetCopy); b.textContent = ok ? "Copied" : "Copy unavailable"; b.setAttribute("aria-label", b.textContent); }));
        article.querySelector("[data-sheet-basis]")?.addEventListener("change", (e) => { s.basis = e.target.value; refresh(); });
        article.querySelector("[data-sheet-form]")?.addEventListener("change", (e) => { s.representation = e.target.value; refresh(); });
        article.querySelectorAll("[data-matrix]").forEach((b) => b.addEventListener("click", () => {
          s.row = Number(b.dataset.row); s.column = Number(b.dataset.column); s.matrix = b.dataset.matrix;
          article.querySelectorAll("[data-matrix]").forEach((cell) => cell.setAttribute("aria-pressed", String(cell === b)));
          article.querySelectorAll("[data-sheet-conductor]").forEach((path) => path.classList.toggle("sheet-highlight", [s.row, s.column].includes(Number(path.dataset.sheetConductor))));
          article.querySelector("[data-matrix-evidence]").innerHTML = matrixEvidence(model, s);
        }));
        article.querySelectorAll("[data-sheet-element]").forEach((b) => b.addEventListener("click", () => { s.element = Number(b.dataset.sheetElement); article.querySelectorAll("[data-sheet-element]").forEach((button) => button.setAttribute("aria-pressed", String(button === b))); article.querySelectorAll("[data-sheet-element-mark]").forEach((mark) => mark.classList.toggle("sheet-highlight", Number(mark.dataset.sheetElementMark) === s.element)); }));
        article.querySelector("[data-sheet-u]")?.addEventListener("input", (e) => { s.u = Number(e.target.value); article.querySelector("[data-sheet-u-label]").textContent = s.u.toFixed(2); article.querySelector("[data-sheet-response]").innerHTML = responseTable(model.load, s.u); });
      });
    }

    return { render, reset() { pins = []; local.clear(); comparisonIndex = null; comparisonName = ""; } };
  }
  globalThis.BMOPFModelSheets = Object.freeze({ VERSION: "model-sheets-v1", createModelSheets });
})();
