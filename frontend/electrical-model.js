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
    const code = index.entities.find((e) => e.ref.kind === "linecode" && e.ref.id === r.linecode);
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
      const bus = index.buses.find((b) => b.ref.id === p.busId);
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
    return { version: VERSION, item, fields, problems, line, load, windings: windingModels, frequency: index.raw.base_frequency };
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

  globalThis.BMOPFElectrical = Object.freeze({ VERSION, interpret, topology, loadModel, loadResponse, lineModel, manifest, flatten, unit, number, diffRecords, componentValue, resultFields, voltagePhasors });
})();
