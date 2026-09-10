import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";

const sandbox = { globalThis: {} };
for (const file of ["model.js", "electrical-model.js", "examples.js"]) vm.runInNewContext(await readFile(new URL(`../frontend/${file}`, import.meta.url), "utf8"), sandbox);
const E = sandbox.globalThis.BMOPFElectrical, build = sandbox.globalThis.BMOPFModel.buildCaseIndex;
const fixture = JSON.parse(await readFile(new URL("../fixtures/micro/micro_bmopf.json", import.meta.url), "utf8"));
const get = (index, kind, id) => index.entities.find((e) => e.ref.kind === kind && e.ref.id === id);
const clone = (v) => JSON.parse(JSON.stringify(v));
const series = { R_series_1_1: 0.4, X_series_1_1: 0.3, G_from_1_1: 0, B_from_1_1: 0 };
function oneLine(extra = {}, code = series) {
  return build({ bus: { a: { terminal_names: ["x"] }, b: { terminal_names: ["y"] } }, line: { l: { bus_from: "a", bus_to: "b", terminal_map_from: ["x"], terminal_map_to: ["y"], linecode: "c", length: 120, ...extra } }, linecode: { c: code } });
}

test("source units and no invented absolute values or shunt zeros", () => {
  const index = oneLine();
  const m = E.interpret(get(index, "line", "l"), index).line;
  assert.equal(m.perLength, true);
  assert.equal(m.matrices[0].cells[0].real.value, 0.4);
  assert.equal(m.matrices[0].totalsAvailable, true);
  assert.equal(m.matrices[1].state, "supplied zero");
  assert.equal(m.matrices[2].state, "not supplied");
  for (const length of [undefined, null, "120", false, -1]) {
    const invalid = oneLine({ length });
    const line = E.interpret(get(invalid, "line", "l"), invalid).line;
    assert.equal(line.matrices[0].totalsAvailable, false);
    assert.match(line.problems.join(" "), /Segment totals unavailable/);
  }
});

test("inline impedance is absolute; conflicting and missing sources remain unresolved", () => {
  const index = oneLine();
  const item = get(index, "line", "l");
  delete item.sourceRecord.linecode;
  Object.assign(item.sourceRecord, series);
  const inline = E.interpret(item, index).line;
  assert.equal(inline.perLength, false);
  assert.equal(inline.matrices[0].cells[0].real.value, .4);
  item.sourceRecord.linecode = "c";
  assert.equal(E.interpret(item, index).line.matrices[0].totalsAvailable, false);
  delete item.sourceRecord.R_series_1_1; delete item.sourceRecord.X_series_1_1;
  item.sourceRecord.linecode = "missing";
  assert.match(E.interpret(item, index).problems.join(" "), /unavailable/);
});

test("terminal mismatch preserves both endpoints; matrix mismatch never truncates", () => {
  const index = oneLine({ terminal_map_to: ["y", "z"] }, { ...series, R_series_3_3: .2 });
  const item = get(index, "line", "l"), line = E.interpret(item, index).line;
  assert.equal(item.connections[0].pairs.length, 2);
  assert.equal(line.pairs[1].from, null);
  assert.equal(line.pairs[1].to, "z");
  assert.equal(line.matrices[0].dimension, 3);
  assert.equal(line.matrices[0].totalsAvailable, false);
  assert.match(line.problems.join(" "), /indices/);
  const huge = oneLine({}, { R_series_100000_100000: 1 });
  const sparse = E.interpret(get(huge, "line", "l"), huge).line.matrices[0];
  assert.equal(sparse.sparse, true);
  assert.equal(sparse.cells.length, 1);
});

test("missing entries, booleans, conflicts and tiny nonzero values stay distinct", () => {
  const index = oneLine({}, { ...series, B_from_1_1: 1e-15, R_series: [[4]], X_series_1_1: false });
  const line = E.interpret(get(index, "line", "l"), index).line;
  assert.equal(line.matrices[0].cells[0].real.state, "conflicting representations");
  assert.equal(line.matrices[0].cells[0].imaginary.state, "invalid");
  assert.equal(line.matrices[1].state, "supplied");
});

test("load element order and voltage law follow configuration, without phase guessing", () => {
  const t = E.topology("DELTA", ["blue", "red", "black"]);
  assert.deepEqual(clone(t.elements.map((e) => e.pair)), [["blue", "red"], ["red", "black"], ["black", "blue"]]);
  assert.equal(E.topology(null, ["a", "n"]).elements.length, 0);
  assert.equal(E.topology("WYE", ["a", "b", "c"]).elements.length, 0);
  assert.equal(E.topology("WYE", ["x", "y", "z", "return"]).neutral, "return");
  const index = build(clone(sandbox.globalThis.BMOPFExamples[0].case));
  const item = get(index, "load", "load_three_phase");
  const load = E.loadModel(item), result = E.loadResponse(load, .9);
  assert.equal(result.length, 3);
  assert.ok(Math.abs(result[0].p - 8388) < 1e-8);
  item.sourceRecord.alpha_z = [".2"];
  assert.equal(E.loadResponse(E.loadModel(item), .9)[0].p, null);
  assert.notEqual(E.loadResponse(E.loadModel(item), .9)[0].q, null);
  delete item.sourceRecord.model;
  assert.equal(E.loadModel(item).origin, "BMOPF default");
});

test("winding voltage bases and unknown configurations remain explicit", () => {
  const index = build(clone(fixture));
  const model = E.interpret(get(index, "transformer", "tx_three"), index);
  assert.equal(model.windings.length, 3);
  assert.equal(model.windings[0].voltageReference, "line–neutral coil");
  assert.equal(model.windings[2].voltageReference, "line–line coil");
  assert.equal(E.unit("x_sc", "transformer"), "Ω");
  const unknown = E.interpret(get(index, "transformer", "tx_lv"), index);
  assert.equal(unknown.windings[0].connection.elements.length, 0);
  assert.ok(unknown.problems.some((p) => p.includes("not established")));
});

test("field coverage preserves unknown nested electrical data and source paths", () => {
  const index = build(clone(fixture)), item = get(index, "line", "line_main");
  item.sourceRecord.custom_law = { "a/b": { "~limit": 0 } };
  const fields = E.manifest(item);
  assert.equal(fields.length, E.flatten(item.sourceRecord).length);
  const unknown = fields.find((f) => f.path.endsWith("custom_law/a~1b/~0limit"));
  assert.equal(unknown.category, "unrepresented");
  assert.equal(unknown.value, 0);
  const before = { terminal_map: ["1", "2"], p: null }, after = { terminal_map: ["2", "1"], q: 0 };
  const changes = E.diffRecords(after, before);
  assert.equal(changes.length, 4);
  assert.equal(changes.find((c) => c.path === "/p").change, "removed");
});

test("result identity, references and radians are explicit", () => {
  const index = build(clone(fixture)), bus = get(index, "bus", "source");
  assert.equal(E.resultFields(bus, null).length, 0);
  const keyed = E.resultFields(bus, { "1": { vr: 230, vi: 0, va: Math.PI }, "n": { vr: 1, vi: 2 } });
  assert.equal(keyed.find((r) => r.label === "1 · va").unit, "rad");
  assert.equal(keyed[0].reference, "terminal–ground");
  assert.equal(E.voltagePhasors(bus, { "1": { vr: 230, vi: 0 }, "n": { vr: 1 } }).length, 1);
  const legacy = E.resultFields(bus, { vm: [230, 231, 232, 0] });
  assert.equal(legacy[0].comparable, false);
  const explicit = E.resultFields(bus, { vm: [231, 230], terminal_map: ["2", "1"], voltage_reference: "terminal–ground" });
  assert.equal(explicit.find((r) => r.label === "vm · 2").identity, "vm/terminal:2");
  assert.equal(explicit.find((r) => r.label === "vm · 2").comparable, true);
  const malformed = E.resultFields(bus, { vm: [231, 230], terminal_map: "21", voltage_reference: "terminal–ground" });
  assert.equal(malformed[0].comparable, false);
  assert.equal(E.unit("v_angle", "voltage_source"), "rad");
});

test("large indexes preserve lookup identity, metadata and disconnected topology", () => {
  const count = 24000;
  const index = build({ meta: { $schema: "https://example.org/bmopf.json", frequency: 50 },
    bus: Object.fromEntries(Array.from({ length: count }, (_, i) => [`b${i}`, { terminal_names: ["1"] }])),
    line: { l: { bus_from: "b0", bus_to: "b23999", terminal_map_from: ["1"], terminal_map_to: ["1"] } }
  });
  assert.equal(index.busById.size, count);
  assert.equal(index.componentCount, count - 1);
  assert.equal(index.byKind.get("bus").get("b23999"), index.busById.get("b23999"));
  assert.equal(index.schema, "https://example.org/bmopf.json");
  assert.equal(E.interpret(index.busById.get("b0"), index).frequency, 50);
  assert.ok(!index.warnings.some(w => w.includes("missing bus") || w.includes("No BMOPF schema")));
});
