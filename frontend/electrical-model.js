(function () {
  "use strict";

  // Read-only interpretation. Never alter a case or silently complete its data.
  const VERSION = "electrical-model-v1";
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const number = (v) => typeof v === "number" && Number.isFinite(v);
  const pointer = (v) => String(v).replace(/~/g, "~0").replace(/\//g, "~1");
  const matrixPattern = /^(R_series|X_series|G_from|B_from|G_to|B_to|G|B)(?:_(\d+)_(\d+))?$/;
  const topologyKeys = new Set(["bus", "bus_from", "bus_to", "terminal_map", "terminal_map_from", "terminal_map_to", "terminal_names", "perfectly_grounded_terminals", "neutral_terminal", "configuration", "configuration_from", "configuration_to", "delta_roll", "windings", "open_switch", "status", "in_service"]);
  const parameterKeys = new Set(["length", "linecode", "model", "v_nom", "v_nom_from", "v_nom_to", "v_magnitude", "v_angle", "p_nom", "q_nom", "p", "q", "pg", "qg", "p_min", "p_max", "q_min", "q_max", "s_max", "s_rating", "i_max", "i_max_from", "i_max_to", "q_rated", "alpha_z", "alpha_i", "alpha_p", "beta_z", "beta_i", "beta_p", "gamma_p", "gamma_q", "tap", "tap_min", "tap_max", "x_sc", "r_winding", "r_series", "x_series", "r_series_from", "x_series_from", "r_series_to", "x_series_to", "r_neutral_from", "x_neutral_from", "r_neutral_to", "x_neutral_to", "g_no_load", "b_no_load", "base_frequency", "control_mode", "control_profile", "topology", "prime_mover", "time_series", "v_min", "v_max", "vpn_min", "vpn_max", "vpp_min", "vpp_max"]);
  const metadataKeys = new Set(["name", "description", "meta", "source", "longitude", "latitude", "lon", "lat", "line_geometry", "coordinates"]);

  function flatten(value, path = "", keys = [], out = []) {
    if (value && typeof value === "object" && Object.keys(value).length) {
      Object.entries(value).forEach(([key, v]) => flatten(v, `${path}/${pointer(key)}`, [...keys, key], out));
    } else out.push({ path, keys, value });
    return out;
  }

  function unit(key, kind = "") {
    if (typeof key !== "string") return "";
    if (/^(R_series|X_series)(_|$)/.test(key)) return kind === "linecode" ? "Ω/m" : "Ω";
    if (/^(G_from|B_from|G_to|B_to)(_|$)/.test(key)) return kind === "linecode" ? "S/m" : "S";
    if (/^(G|B)_/.test(key) || ["g_no_load", "b_no_load"].includes(key)) return "S";
    if (/^[rx]_(series|neutral|winding)/.test(key) || key === "x_sc") return "Ω";
    if (["length"].includes(key)) return "m";
    if (key === "base_frequency") return "Hz";
    if (/^v_(nom|min|max|magnitude)/.test(key) || ["vm", "vpn_min", "vpn_max", "vpp_min", "vpp_max"].includes(key)) return "V";
    if (key === "v_angle" && kind === "voltage_source") return "rad";
    if (["vr", "vi"].includes(key)) return "V";
    if (/^(cr|ci|cm)(_|$|d$|g$)|^(cg_r|cg_i|cgm)$/.test(key)) return "A";
    if (key === "pd") return "W";
    if (key === "qd") return "var";
    if (/^i_(max|min|magnitude)/.test(key)) return "A";
    if (/^(p|pg)(_|$)/.test(key)) return "W";
    if (/^(q|qg)(_|$)/.test(key)) return "var";
    if (/^s_(max|rating)/.test(key)) return "VA";
    if (["loading", "voltage_deviation", "vm_deviation", "v_deviation"].includes(key) || key.endsWith("_loading")) return "p.u.";
    return "";
  }

  function manifest(item) {
    return flatten(item.sourceRecord || {}, item.ref.pointer || "").map((entry) => {
      const key = entry.keys[0];
      const inner = key === "windings" ? entry.keys[2] : key;
      const category = metadataKeys.has(key) ? "metadata" : topologyKeys.has(inner) ? "connections" : parameterKeys.has(inner) || matrixPattern.test(inner) ? "parameters" : "unrepresented";
      return { ...entry, category, unit: unit(inner, item.ref.kind) };
    });
  }

  function datum(record, key, path, unitName = "") {
    return { value: record?.[key], state: !own(record, key) ? "not supplied" : number(record[key]) ? "supplied" : "invalid", path: `${path}/${pointer(key)}`, unit: unitName };
  }

  function topology(configuration, terminals, roll = 1) {
    const config = String(configuration || "").toUpperCase();
    const t = (terminals || []).map(String);
    const arity = { WYE: 4, DELTA: 3, SINGLE_PHASE: 2, CENTER_TAP: 3 }[config];
    if (!arity || t.length !== arity || new Set(t).size !== t.length) return { configuration: config || "not supplied", terminals: t, elements: [], warning: !arity ? "Connection topology not established." : `${config} needs ${arity} distinct terminals; received ${t.length}.` };
    const pairs = config === "DELTA" ? t.map((a, i) => [a, t[(i + (roll === -1 ? 2 : 1)) % 3]])
      : config === "WYE" ? t.slice(0, -1).map((a) => [a, t.at(-1)])
        : config === "CENTER_TAP" ? [[t[0], t[1]], [t[1], t[2]]] : [[t[0], t[1]]];
    return { configuration: config, terminals: t, elements: pairs.map((pair, index) => ({ index, pair })), reference: config === "DELTA" ? "line–line" : config === "CENTER_TAP" ? "half-winding" : "terminal–return", neutral: config === "WYE" ? t.at(-1) : null };
  }

  function componentValue(record, key, index, count, broadcast = false) {
    const raw = record?.[key];
    if (raw === undefined) return null;
    if (broadcast && number(raw)) return raw;
    if (!Array.isArray(raw) || (raw.length !== count && !(broadcast && raw.length === 1))) return null;
    return number(raw[raw.length === 1 ? 0 : index]) ? raw[raw.length === 1 ? 0 : index] : null;
  }

  function loadModel(item) {
    const record = item.sourceRecord || {};
    const connection = topology(record.configuration, item.ports?.[0]?.terminals);
    const model = String(record.model ?? "constant_power").toLowerCase();
    const count = connection.elements.length;
    const fields = ["p_nom", "q_nom", "v_nom", "alpha_z", "alpha_i", "alpha_p", "beta_z", "beta_i", "beta_p", "gamma_p", "gamma_q"];
    const elements = connection.elements.map((entry) => ({ ...entry, ...Object.fromEntries(fields.map((key) => [key, componentValue(record, key, entry.index, count, /^(alpha|beta|gamma)_/.test(key))])) }));
    return { ...connection, model, origin: own(record, "model") ? "supplied" : "BMOPF default", elements };
  }

  function loadResponse(load, u) {
    if (!number(u) || u <= 0) return [];
    return load.elements.map((e) => {
      const value = (component) => {
        const nominal = e[`${component}_nom`];
        if (!number(nominal)) return null;
        if (load.model === "constant_power") return nominal;
        if (!number(e.v_nom) || e.v_nom <= 0) return null;
        if (load.model === "constant_current") return nominal * u;
        if (load.model === "constant_impedance") return nominal * u * u;
        if (load.model === "exponential") return number(e[`gamma_${component}`]) ? nominal * Math.pow(u, e[`gamma_${component}`]) : null;
        if (load.model === "zip") {
          const prefix = component === "p" ? "alpha" : "beta";
          const weights = ["z", "i", "p"].map((k) => e[`${prefix}_${k}`]);
          return weights.every(number) && weights.every((w) => w >= 0) && Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-8 ? nominal * (weights[0] * u * u + weights[1] * u + weights[2]) : null;
        }
        return null;
      };
      return { pair: e.pair, voltage: number(e.v_nom) ? e.v_nom * u : null, p: value("p"), q: value("q") };
    });
  }

  function matrixEntries(record, prefix, sourcePath) {
    const entries = new Map();
    const put = (i, j, value, path) => {
      const key = `${i},${j}`;
      const existing = entries.get(key);
      entries.set(key, { row: i, column: j, value, path, state: existing ? "conflicting representations" : number(value) ? "supplied" : "invalid" });
    };
    Object.entries(record || {}).forEach(([key, value]) => {
      const match = key.match(new RegExp(`^${prefix}_(\\d+)_(\\d+)$`));
      if (match) put(Number(match[1]) - 1, Number(match[2]) - 1, value, `${sourcePath}/${pointer(key)}`);
    });
    if (Array.isArray(record?.[prefix])) record[prefix].forEach((row, i) => {
      if (Array.isArray(row)) row.forEach((value, j) => put(i, j, value, `${sourcePath}/${prefix}/${i}/${j}`));
      else put(i, -1, row, `${sourcePath}/${prefix}/${i}`);
    });
    return entries;
  }

  function lineModel(item, index) {
    const r = item.sourceRecord || {}, path = item.ref.pointer;
    const code = index.byKind.get("linecode")?.get(r.linecode);
    const inline = Object.keys(r).some((k) => /^(R_series|X_series)(_|$)/.test(k));
    const conflict = own(r, "linecode") && inline;
    const source = code || item;
    const perLength = Boolean(code);
    const length = datum(r, "length", path, "m");
    const lengthValid = length.state === "supplied" && length.value >= 0;
    const from = item.ports?.[0], to = item.ports?.[1];
    const count = Math.max(from?.terminals.length || 0, to?.terminals.length || 0);
    const problems = [];
    if (conflict) problems.push("Conflicting impedance sources: linecode and inline series matrices. No source was selected for calculation.");
    if (own(r, "linecode") && !code) problems.push(`Linecode ${r.linecode} is unavailable.`);
    if (perLength && !lengthValid) problems.push("Segment totals unavailable: linecode requires a finite, nonnegative length in metres.");
    if (!from || !to || from.terminals.length !== to.terminals.length) problems.push("Terminal-map length mismatch; unmatched terminals are preserved.");
    const matrices = [["series", "Series impedance Z", "R_series", "X_series", "Ω"], ["from", "From shunt admittance", "G_from", "B_from", "S"], ["to", "To shunt admittance", "G_to", "B_to", "S"]].map(([id, title, real, imaginary, units]) => {
      const a = matrixEntries(source.sourceRecord, real, source.ref.pointer), b = matrixEntries(source.sourceRecord, imaginary, source.ref.pointer);
      const supplied = [...a.values(), ...b.values()];
      const invalidDimensions = supplied.some((e) => e.row < 0 || e.column < 0 || e.row >= count || e.column >= count);
      const dimension = Math.max(count, ...supplied.map((e) => Math.max(e.row, e.column) + 1));
      if (invalidDimensions) problems.push(`${title}: matrix indices exceed or contradict the terminal maps.`);
      const makeCell = (i, j) => {
        const term = (entry) => entry || { row: i, column: j, state: "not supplied", path: `${source.ref.pointer}/${real === imaginary ? real : ""}`, value: undefined };
        return { row: i, column: j, real: term(a.get(`${i},${j}`)), imaginary: term(b.get(`${i},${j}`)) };
      };
      const sparse = dimension > 16;
      const cells = sparse ? [...new Set([...a.keys(), ...b.keys()])].map((key) => makeCell(...key.split(",").map(Number))) : Array.from({ length: dimension }, (_, i) => Array.from({ length: dimension }, (_, j) => makeCell(i, j))).flat();
      const complete = dimension > 0 && supplied.length === 2 * dimension * dimension && supplied.every((e) => e.state === "supplied") && !invalidDimensions;
      return { id, title, units, dimension, sparse, cells, state: !supplied.length ? "not supplied" : complete && supplied.every((e) => e.value === 0) ? "supplied zero" : complete ? "supplied" : "incomplete or invalid", totalsAvailable: !conflict && (!own(r, "linecode") || Boolean(code)) && !invalidDimensions && supplied.every((e) => e.state === "supplied") && (!perLength || lengthValid) };
    });
    const pairs = Array.from({ length: count }, (_, i) => ({ index: i, from: from?.terminals[i] ?? null, to: to?.terminals[i] ?? null }));
    return { matrices, pairs, problems, source: source.ref, perLength, length, conflict, inline, ratings: ["i_max", "s_max"].map((key) => ({ key, value: own(r, key) ? r[key] : code?.sourceRecord?.[key], path: `${own(r, key) ? path : code?.ref.pointer || path}/${key}`, unit: unit(key) })) };
  }

  function windings(item) {
    const record = item.sourceRecord || {};
    const configurations = { wye_delta: ["WYE", "DELTA"], delta_wye: ["DELTA", "WYE"], single_phase: ["SINGLE_PHASE", "SINGLE_PHASE"], center_tap: ["SINGLE_PHASE", "CENTER_TAP"] }[item.subtype] || [];
    return (item.ports || []).map((port, i) => {
      const side = i === 0 ? "from" : "to";
      const w = record.windings?.[i] || {};
      const config = w.configuration ?? record[`configuration_${side}`] ?? configurations[i];
      const raw = record.windings ? w : { configuration: config, v_nom: record[`v_nom_${side}`], tap: record.tap, r_winding: record[`r_series_${side}`], i_max: record[`i_max_${side}`] };
      return { port, raw, path: record.windings ? `${item.ref.pointer}/windings/${i}` : item.ref.pointer, connection: topology(config, port.terminals, w.delta_roll), voltageReference: record.windings ? config === "DELTA" ? "line–line coil" : config === "WYE" ? "line–neutral coil" : "not established" : ["wye_delta", "delta_wye"].includes(item.subtype) ? "line–line" : item.subtype === "single_phase" ? "winding terminals" : "not established" };
    });
  }

  function interpret(item, index) {
    const fields = manifest(item);
    const problems = [];
    (item.ports || []).forEach((p) => {
      const bus = index.busById.get(p.busId);
      if (!bus) problems.push(`${p.role}: bus ${p.busId} is unavailable.`);
      else p.terminals.forEach((t) => { if (!bus.terminals.includes(t)) problems.push(`${p.role}: terminal ${t} is absent from bus ${p.busId}.`); });
      if (new Set(p.terminals).size !== p.terminals.length) problems.push(`${p.role}: repeated terminal IDs make conductor identity ambiguous.`);
      if (!p.terminals.length) problems.push(`${p.role}: terminal map not supplied.`);
    });
    const line = ["line", "dc_branch"].includes(item.ref.kind) ? lineModel(item, index) : null;
    if (line) problems.push(...line.problems);
    const load = item.ref.kind === "load" ? loadModel(item) : null;
    const windingModels = item.ref.kind === "transformer" ? windings(item) : [];
    if (load?.warning) problems.push(load.warning);
    if (load?.elements.length) {
      const required = ["p_nom", "q_nom", ...(load.model === "constant_power" ? [] : ["v_nom"]), ...(load.model === "zip" ? ["alpha_z", "alpha_i", "alpha_p", "beta_z", "beta_i", "beta_p"] : load.model === "exponential" ? ["gamma_p", "gamma_q"] : [])];
      for (const key of required) if (load.elements.some((e) => !number(e[key]) || (key === "v_nom" && e[key] <= 0))) problems.push(`Load ${key}: missing/invalid values or array length inconsistent with ${load.elements.length} electrical elements. No scalar power broadcasting is assumed.`);
      if (load.model === "zip") for (const prefix of ["alpha", "beta"]) if (load.elements.some((e) => {
        const weights = ["z", "i", "p"].map((k) => e[`${prefix}_${k}`]);
        return weights.every(number) && (weights.some((w) => w < 0) || Math.abs(weights.reduce((a,b) => a+b,0)-1)>1e-8);
      })) problems.push(`Load ${prefix} ZIP coefficients must be nonnegative and sum to one per element; response calculation is unavailable for invalid elements.`);
    }
    windingModels.forEach((w, i) => { if (w.connection.warning) problems.push(`Winding ${i + 1}: ${w.connection.warning}`); });
    return { version: VERSION, item, fields, problems, line, load, windings: windingModels, frequency: index.raw.meta?.frequency ?? index.raw.base_frequency };
  }

  function diffRecords(current, previous) {
    const a = new Map(flatten(previous ?? {}).map((e) => [e.path, e.value]));
    const b = new Map(flatten(current ?? {}).map((e) => [e.path, e.value]));
    return [...new Set([...a.keys(), ...b.keys()])].sort().filter((path) => JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path))).map((path) => ({ path, before: a.get(path), after: b.get(path), change: !a.has(path) ? "added" : !b.has(path) ? "removed" : "changed" }));
  }

  // Terminal-keyed BMOPFTools results use SI, radians and a ground voltage
  // reference. Legacy flat arrays have no implicit angle/reference convention.
  function resultFields(item, record) {
    if (!record || typeof record !== "object" || !Object.keys(record).length) return [];
    const terminals = item.ref.kind === "bus" ? item.terminals : item.ports?.[0]?.terminals || [];
    const elements = topology(item.sourceRecord.configuration, terminals).elements;
    const rows = flatten(record || {}).map((f) => {
      const metric = f.keys.at(-1), root = f.keys[0];
      const keyed = f.keys.length === 2 && terminals.includes(root) && ["vr", "vi", "vm", "va", "cr_fr", "ci_fr", "cr_to", "ci_to", "cm_fr", "cm_to", "cr", "ci", "cm", "crd", "cid", "crg", "cig", "pg", "qg", "pd", "qd"].includes(metric);
      if (keyed) return { ...f, identity: f.path, label: `${root} · ${metric}`, unit: metric === "va" ? "rad" : unit(metric), reference: item.ref.kind === "bus" ? "terminal–ground" : item.ref.kind === "line" ? "total end current, bus → line; keyed by from terminal" : ["generator", "ibr"].includes(item.ref.kind) ? "injection into bus" : item.ref.kind === "load" ? `consumption · ${elements.find((e) => e.pair[0] === root)?.pair.join("–") || "element reference unresolved"}` : "source convention", comparable: true };
      if (f.keys.length === 2 && Array.isArray(record[root])) {
        const offset = Number(f.keys[1]);
        const candidates = ["vm", "va", "v_magnitude", "v_angle", "i_magnitude"].includes(root) ? (record.terminal_map === undefined ? terminals : Array.isArray(record.terminal_map) ? record.terminal_map : []) : ["p", "q", "pd", "qd"].includes(root) && elements.length ? elements.map((e) => e.pair.join("–")) : /^(p|q)_(from|to)$/.test(root) ? item.ports?.[root.endsWith("to") ? 1 : 0]?.terminals || [] : [];
        const aligned = candidates.length === record[root].length && new Set(candidates).size === candidates.length;
        const reference = root.startsWith("v") ? record.voltage_reference : record.sign_convention;
        const units = ["va", "v_angle"].includes(root) ? record.angle_unit || "not declared" : unit(root);
        return { ...f, identity: aligned ? `${root}/terminal:${candidates[offset]}` : f.path, label: `${root} · ${aligned ? candidates[offset] : `source index ${offset + 1} (unresolved)`}`, unit: units, reference: reference || "not declared", comparable: aligned && Boolean(reference) && units !== "not declared" };
      }
      return { ...f, identity: f.path, label: f.keys.join(" / "), unit: unit(metric), reference: "source convention", comparable: f.keys.length === 1 && number(f.value) && Boolean(unit(metric)) };
    });
    return rows;
  }

  function voltagePhasors(item, record) {
    if (item.ref.kind !== "bus" || !record) return [];
    // Derive from rectangular voltage so no angle-unit inference is necessary.
    return item.terminals.filter((t) => number(record[t]?.vr) && number(record[t]?.vi)).map((terminal) => ({ terminal, real: record[terminal].vr, imaginary: record[terminal].vi, reference: "terminal–ground" }));
  }

  // Trace declared conductor mappings only. This is not an energisation test.
  function traceTerminal(index, busId, terminal, { maxVisits = 2000, maxSteps = 20000 } = {}) {
    const key = (bus, term) => JSON.stringify([bus, term]);
    const valid = (bus, term) => index.busById.get(bus)?.terminals.filter(t => t === term).length === 1;
    const rows = [], terminals = [], busIds = new Set(), assetPointers = new Set(), seen = new Set(), edges = new Set();
    const queue = [{ busId, terminal }]; let cursor = 0, steps = 0, truncated = false;
    if (!valid(busId, terminal)) return { rows: [{ type: "stop", message: "Starting bus/terminal is missing or duplicated.", pointer: "/bus" }], terminals, busIds, assetPointers, truncated: false, origin: { busId, terminal } };
    seen.add(key(busId, terminal));
    while (cursor < queue.length) {
      if (cursor >= maxVisits || steps >= maxSteps) { truncated = true; break; }
      const node = queue[cursor++], bus = index.busById.get(node.busId);
      terminals.push(node); busIds.add(node.busId);
      if (bus.groundedTerminals.includes(node.terminal)) {
        rows.push({ type: "ground", ref: bus.ref, pointer: bus.ref.pointer + "/perfectly_grounded_terminals", from: node, message: "Declared ideal ground. Trace stops here; ground does not join separate buses." }); continue;
      }
      let connected = false;
      for (const item of new Set(index.byBus.get(node.busId) || [])) {
        if (++steps > maxSteps) { truncated = true; break; }
        const matching = item.ports.filter(p => p.busId === node.busId && p.terminals.includes(node.terminal));
        if (!matching.length) continue; connected = true;
        const row = { ref: item.ref, pointer: item.ref.pointer, from: node };
        if (item.ref.kind === "switch" && item.sourceRecord.open_switch !== undefined && typeof item.sourceRecord.open_switch !== "boolean") { rows.push({ ...row, type: "stop", message: "Invalid switch open state; continuity is unresolved." }); continue; }
        if (item.status === "open" || item.status === "out_of_service") {
          rows.push({ ...row, type: "stop", message: `${item.status === "open" ? "Open switch" : "Out of service"}. No continuation through this device.` }); continue;
        }
        if (item.ref.kind === "transformer") {
          rows.push({ ...row, type: "winding", message: "Transformer winding boundary: magnetic coupling does not establish conductor continuity.", windings: item.ports.map((p,i) => ({ role: p.role, busId: p.busId, terminals: p.terminals, configuration: item.sourceRecord.windings?.[i]?.configuration ?? item.sourceRecord[i === 0 ? "configuration_from" : "configuration_to"] ?? "not declared" })) }); continue;
        }
        if (item.ports.length === 1 && !["line", "switch", "dc_branch"].includes(item.ref.kind)) { rows.push({ ...row, type: "device", message: "Connected device. No internal terminal-to-terminal continuity is inferred." }); continue; }
        if (!["line", "switch"].includes(item.ref.kind) || item.ports.length !== 2) {
          rows.push({ ...row, type: "stop", message: "Missing or unsupported connection model; continuation is unresolved." }); continue;
        }
        const [a,b] = item.ports;
        if (!a.terminals.length || a.terminals.length !== b.terminals.length || [a,b].some(p => new Set(p.terminals).size !== p.terminals.length || p.terminals.some(t => !valid(p.busId,t)))) {
          rows.push({ ...row, type: "stop", message: "Missing bus/terminal, duplicate terminal or unequal terminal maps. Continuation is ambiguous." }); continue;
        }
        for (const port of matching) {
          const other = port === a ? b : a, offset = port.terminals.indexOf(node.terminal), edge = `${item.ref.pointer}:${offset}`;
          if (edges.has(edge)) continue; edges.add(edge);
          const to = { busId: other.busId, terminal: other.terminals[offset] };
          rows.push({ ...row, type: "connection", to, pointer: `${item.ref.pointer}/terminal_map_${port === a ? "from" : "to"}/${offset}`, message: `${node.terminal === to.terminal ? "Terminal label retained" : `Terminal renamed ${node.terminal} → ${to.terminal}`}.${item.status === "unknown" ? " Service state undeclared or unrecognised; structural mapping only." : ""}` });
          assetPointers.add(item.ref.pointer);
          if (!seen.has(key(to.busId,to.terminal))) { seen.add(key(to.busId,to.terminal)); queue.push(to); }
        }
      }
      if (!connected) rows.push({ type: "end", ref: bus.ref, pointer: bus.ref.pointer, from: node, message: "No attached port declares this terminal." });
      if (truncated) break;
    }
    return { rows, terminals, busIds, assetPointers, truncated, origin: { busId, terminal } };
  }

  const MAGNITUDE_COLOURS = Object.freeze(["#dceaf1","#a5c9dc","#68a1c4","#dba95e","#ca6747"]);
  function magnitudeColour(value, low, high) {
    const t=Math.max(0,Math.min(1,(value-low)/Math.max(high-low,1e-12)));
    return MAGNITUDE_COLOURS[Math.min(4,Math.floor(t*5))];
  }

  function engineeringAssessment(index, getRecord, { pairing = "unverified", attached = true, scenarioReady = true } = {}) {
    const state = !attached ? "not-run" : !scenarioReady ? "scenario-required" : pairing === "mismatch" ? "pairing-mismatch" : "assessed";
    const rows=[];
    const add=(category,item,message,extra={})=>rows.push({category,ref:item.ref,message,...extra});
    for(const item of index.entities) {
      const source=item.sourceRecord;
      const validPorts=(item.ports || []).every(port=>{const bus=index.busById.get(port.busId);return bus && port.terminals.every(t=>bus.terminals.includes(t)) && new Set(port.terminals).size===port.terminals.length;});
      if(!validPorts) add("ambiguity",item,"Missing bus, undeclared terminal or duplicate port mapping");
      for(const connection of item.connections || []) if(connection.warning) add("ambiguity",item,connection.warning);
      if(item.ref.kind === "line" && own(source,"linecode") && !index.byKind.get("linecode")?.has(String(source.linecode))) add("ambiguity",item,`Linecode ${source.linecode} is unavailable`);
      if(item.ref.kind === "bus") {
        const terminals=item.terminals;
        const validTerminals=terminals.length && new Set(terminals).size===terminals.length;
        if(!validTerminals)add("ambiguity",item,"Terminal identities are missing or duplicated");
        const record=state === "assessed" ? getRecord(item) : null;
        const metric=record ? operatingMetric(item,record,"voltage",index) : null;
        const samples=new Map((metric?.samples || []).map(sample=>[sample.terminal,sample]));
        for(const key of ["vpn_min","vpn_max","vpp_min","vpp_max","vn_max"]) if(own(source,key)) add("unsupported",item,`${key}: neutral / phase-pair mapping is not implemented`,{path:`${item.ref.pointer}/${key}`});
        if(state === "assessed" && !own(source,"v_min") && !own(source,"v_max"))add("unsupported",item,"No supported phase-to-ground voltage limits supplied");
        for(const key of ["v_min","v_max"]) {
          const limits=source[key];if(limits===undefined)continue;
          const path=`${item.ref.pointer}/${key}`;
          if(!validTerminals || !Array.isArray(limits) || limits.length!==terminals.length || limits.some(v=>!number(v)||v<0)) {add("ambiguity",item,`${key} cannot be aligned to finite nonnegative per-terminal limits`,{path});if(state === "assessed")add("unsupported",item,`${key}: invalid limit mapping`,{path});continue;}
          terminals.forEach((terminal,i)=>{
            const limit=limits[i],opposite=source[key === "v_min" ? "v_max" : "v_min"];
            const extra={terminal,limit,unit:"V",path:`${path}/${i}`};
            if(Array.isArray(opposite) && number(opposite[i]) && (key === "v_min" ? limit>opposite[i] : limit<opposite[i])) {add("ambiguity",item,`Contradictory voltage limits at terminal ${terminal}`,extra);if(state === "assessed")add("incomplete",item,"Contradictory voltage limits prevent assessment",extra);return;}
            if(state !== "assessed")return;
            const reference=record?.voltage_reference;
            const referenceValid=record && (!(Array.isArray(record.vm) || reference) || ["phase-to-ground","global ground","BMOPFTools phase-to-ground"].includes(reference));
            const sample=samples.get(terminal);
            if(!referenceValid || !sample){add("incomplete",item,!record ? "No result record in selected scenario" : !referenceValid ? "Result phase-to-ground reference is not established" : metric?.reason || "Missing terminal voltage",extra);return;}
            const excess=key === "v_max" ? sample.value-limit : limit-sample.value;
            add(excess>0 ? "violation" : "passed",item,`${key} at terminal ${terminal}`,{...extra,value:sample.value,excess:Math.max(0,excess),score:excess>0 ? limit>0 ? excess/limit : Infinity : 0,resultPath:sample.path});
          });
        }
      } else if(state === "assessed" && ["line","switch","transformer"].includes(item.ref.kind)) {
        if(item.ref.kind !== "line"){add("unsupported",item,"Current/rating constraint checks are implemented for lines only");continue;}
        const code=index.byKind.get("linecode")?.get(String(source.linecode)),ratingSource=own(source,"i_max") ? item : code;
        const ratings=ratingSource?.sourceRecord.i_max,from=item.ports[0]?.terminals || [],to=item.ports[1]?.terminals || [];
        if(!validPorts || !from.length || from.length!==to.length || !Array.isArray(ratings) || ratings.length!==from.length) {add("unsupported",item,"Current ratings and terminal maps are unavailable or incompatible");continue;}
        const record=getRecord(item);
        from.forEach((terminal,i)=>["fr","to"].forEach(end=>{
          const limit=ratings[i],resultPath=`${terminal}/cm_${end}`;
          const extra={terminal,limit,unit:"A",path:`${ratingSource.ref.pointer}/i_max/${i}`,resultPath};
          if(!number(limit)||limit<=0){add("unsupported",item,`Positive finite current rating required at ${resultPath}`,extra);return;}
          const value=record?.[terminal]?.[`cm_${end}`];
          if(!number(value)||value<0 || record?.current_unit && record.current_unit!=="A"){add("incomplete",item,`Missing or incompatible end current at ${resultPath}`,extra);return;}
          const excess=value-limit;
          add(excess>0 ? "violation" : "passed",item,`Current limit at ${resultPath}`,{...extra,value,excess:Math.max(0,excess),score:excess>0 ? excess/limit : 0});
        }));
      }
    }
    rows.sort((a,b)=>a.category === "violation" && b.category === "violation" ? (b.score>a.score ? 1 : b.score<a.score ? -1 : 0) : a.category.localeCompare(b.category));
    const counts={passed:0,violation:0,incomplete:0,unsupported:0,ambiguity:0};rows.forEach(row=>counts[row.category]++);
    return {state,pairing,rows,counts};
  }

  function engineeringIssues(index,getRecord,options) {
    return engineeringAssessment(index,getRecord,options).rows.filter(row=>row.category!=="passed");
  }

  // Map values retain their evidence and denominator. Zero is data; null is not.
  function operatingMetric(item, record, layer, index, options = {}) {
    const samples = [], unavailable = reason => ({ value: null, samples, available: 0, total: 1, reason });
    if (!record) return unavailable("No result record in the selected scenario");
    if (layer === "loading") {
      if (own(record, "loading")) {
        if (!number(record.loading) || record.loading < 0 || (record.loading_unit && record.loading_unit !== "p.u.")) return unavailable("Invalid loading or incompatible unit");
        return { value: record.loading, available: 1, total: 1, samples: [{ value: record.loading, path: "loading", basis: "Reported p.u. loading; rating basis not verified" }] };
      }
      if (item.ref.kind !== "line") return unavailable("No reported loading; current/rating derivation supported for lines only");
      if (record.current_unit && record.current_unit !== "A") return unavailable("Current unit conflicts with BMOPF amperes");
      const from = item.ports?.[0]?.terminals || [], to = item.ports?.[1]?.terminals || [];
      const code = index.byKind.get("linecode")?.get(String(item.sourceRecord.linecode));
      const source = own(item.sourceRecord, "i_max") ? item : code;
      const ratings = source?.sourceRecord.i_max;
      if (!from.length || from.length !== to.length || new Set(from).size !== from.length || new Set(to).size !== to.length || !Array.isArray(ratings) || ratings.length !== from.length) return unavailable("Current ratings and terminal maps are unavailable or incompatible");
      from.forEach((terminal, i) => ["fr", "to"].forEach(end => {
        const current = record[terminal]?.[`cm_${end}`], rating = ratings[i];
        if (number(current) && current >= 0 && number(rating) && rating > 0 && number(current/rating)) samples.push({ value: current/rating, terminal, current, rating, ratingPath: `${source.ref.pointer}/i_max/${i}`, path: `${terminal}/cm_${end}`, basis: `${current} A ÷ ${rating} A at ${source.ref.pointer}/i_max/${i}` });
      }));
      return { value: samples.length ? samples.reduce((max,s)=>Math.max(max,s.value),-Infinity) : null, samples, available: samples.length, total: from.length*2, reason: "Missing or invalid end currents / positive ratings" };
    }
    if (layer === "deviation") {
      if (typeof record.voltage_reference !== "string" || !record.voltage_reference.trim()) return unavailable("Voltage reference not declared; deviation is not inferred from magnitude");
      const key = ["voltage_deviation", "vm_deviation", "v_deviation"].find(k=>own(record,k));
      if (!key || !number(record[key]) || (record.voltage_deviation_unit && record.voltage_deviation_unit !== "p.u.")) return unavailable("No valid reported p.u. deviation");
      return { value: Math.abs(record[key]), available: 1, total: 1, samples: [{value: record[key], path: key, basis: record.voltage_reference}] };
    }
    const terminals = item.terminals || [];
    if (!terminals.length || new Set(terminals).size !== terminals.length) return unavailable("Terminal identities unavailable or ambiguous");
    if (record.voltage_unit && record.voltage_unit !== "V") return unavailable("Voltage unit conflicts with BMOPF volts");
    const reference = options.reference ?? null, selected = options.terminal ?? null;
    if (selected !== null && !terminals.includes(selected)) return unavailable(`Terminal ${selected} is not declared on this bus`);
    if (reference !== null && !terminals.includes(reference)) return unavailable(`Reference terminal ${reference} is not declared on this bus`);
    const flat = [record.vm, record.vr, record.vi].some(Array.isArray), map = record.terminal_map || terminals;
    const keys = reference === null ? ["vm"] : ["vr","vi"];
    if (flat && (!Array.isArray(map) || new Set(map.map(String)).size !== map.length || keys.some(key=>!Array.isArray(record[key]) || record[key].length !== map.length))) return unavailable("Voltage array cannot be aligned to terminals");
    if (reference !== null && flat && !(typeof record.voltage_reference === "string" && record.voltage_reference.trim())) return unavailable("Complex voltage reference not declared; terminal subtraction unavailable");
    const offsets = new Map(flat ? map.map((terminal,i)=>[String(terminal),i]) : []);
    const read = (terminal,key) => flat ? record[key]?.[offsets.get(terminal)] : record[terminal]?.[key];
    const path = (terminal,key) => flat ? `${key}/${offsets.get(terminal)}` : `${terminal}/${key}`;
    const complex = terminal => {
      const real=read(terminal,"vr"), imaginary=read(terminal,"vi");
      return number(real) && number(imaginary) ? [real,imaginary] : null;
    };
    const base = reference === null ? null : complex(reference);
    if (reference !== null && !base) return unavailable(`Complex voltage missing for reference terminal ${reference}`);
    const chosen = selected === null ? terminals.filter(t=>t!==reference) : [selected];
    if (!chosen.length || selected !== null && selected === reference) return unavailable("Choose a terminal different from the reference");
    chosen.forEach(terminal => {
      const phasor = reference === null ? null : complex(terminal);
      const value = reference === null ? read(terminal,"vm") : phasor ? Math.hypot(phasor[0]-base[0],phasor[1]-base[1]) : null;
      if (number(value) && value >= 0) samples.push({ value, terminal, path: reference === null ? path(terminal,"vm") : `${path(terminal,"vr")}, ${path(terminal,"vi")} − ${path(reference,"vr")}, ${path(reference,"vi")}`, basis: `Terminal ${terminal}; ${reference !== null ? `relative to selected terminal ${reference}; magnitude of complex difference` : record.voltage_reference || (flat ? "reference not declared" : "BMOPFTools phase-to-ground")}` });
    });
    return { value: samples.length ? samples.reduce((max,s)=>Math.max(max,s.value),-Infinity) : null, minimum: samples.length ? samples.reduce((min,s)=>Math.min(min,s.value),Infinity) : null, reference: base ? { terminal: reference, value: Math.hypot(...base), basis: record.voltage_reference || "BMOPFTools phase-to-ground" } : null, samples, available: samples.length, total: chosen.length, reason: "Missing or invalid terminal voltage magnitudes / complex components" };
  }

  globalThis.BMOPFElectrical = Object.freeze({ VERSION, MAGNITUDE_COLOURS, magnitudeColour, engineeringAssessment, engineeringIssues, operatingMetric, traceTerminal, interpret, topology, loadModel, loadResponse, lineModel, manifest, flatten, unit, number, diffRecords, componentValue, resultFields, voltagePhasors });
})();
