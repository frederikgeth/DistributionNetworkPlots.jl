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

test("terminal tracing preserves renaming and stops at open, grounded and winding boundaries", () => {
  const index=build({bus:{a:{terminal_names:['x']},b:{terminal_names:['y']},c:{terminal_names:['z'],perfectly_grounded_terminals:['z']},d:{terminal_names:['q']}},line:{ab:{bus_from:'a',bus_to:'b',terminal_map_from:['x'],terminal_map_to:['y']},bc:{bus_from:'b',bus_to:'c',terminal_map_from:['y'],terminal_map_to:['z']}},switch:{open:{bus_from:'b',bus_to:'d',terminal_map_from:['y'],terminal_map_to:['q'],open_switch:true}},transformer:{t:{bus_from:'b',bus_to:'d',terminal_map_from:['y'],terminal_map_to:['q']}},load:{ld:{bus:'b',terminal_map:['y']}}});
  const trace=E.traceTerminal(index,'a','x');
  assert.deepEqual([...trace.busIds],['a','b','c']);
  assert.ok(trace.rows.some(r=>r.to?.terminal==='y' && r.message.includes('renamed')));
  assert.ok(trace.rows.some(r=>r.type==='ground'));
  assert.ok(trace.rows.some(r=>r.type==='stop' && r.ref.id==='open'));
  assert.ok(trace.rows.some(r=>r.type==='winding' && r.windings.length===2));
  assert.ok(trace.rows.some(r=>r.type==='device'));
  assert.equal(trace.truncated,false);
  assert.equal(E.traceTerminal(index,'a','x',{maxVisits:1}).truncated,true);
  assert.equal(E.traceTerminal(index,'missing','x').rows[0].type,'stop');
});

test("trace rejects ambiguous maps and terminates loops without crossing load terminals", () => {
  const index=build({bus:{a:{terminal_names:['1','n']},b:{terminal_names:['2','n']}},line:{ab:{bus_from:'a',bus_to:'b',terminal_map_from:['1','n'],terminal_map_to:['2','n']},ba:{bus_from:'b',bus_to:'a',terminal_map_from:['2','n'],terminal_map_to:['1','n']},bad:{bus_from:'a',bus_to:'b',terminal_map_from:['1','n'],terminal_map_to:['2']}},load:{load:{bus:'b',terminal_map:['2','n']}}});
  const trace=E.traceTerminal(index,'a','1');
  assert.equal(trace.terminals.length,2);
  assert.equal(trace.rows.filter(r=>r.type==='connection').length,2);
  assert.ok(trace.rows.some(r=>r.ref.id==='bad' && r.type==='stop'));
  assert.ok(!trace.terminals.some(t=>t.terminal==='n'));
});

test("operating layers preserve zero, terminal coverage and declared voltage references", () => {
  const index=build({bus:{b:{terminal_names:["a","n"]}}}), bus=get(index,"bus","b");
  const metric=record=>E.operatingMetric(bus,record,"voltage",index);
  assert.equal(metric({vm:[null,0]}).value,0);
  assert.equal(metric({vm:[null,0]}).available,1);
  assert.equal(metric({vm:[false,"230"]}).value,null);
  assert.equal(metric({vm:[230]}).value,null);
  assert.equal(metric({vm:[230,0],terminal_map:["a","a"]}).value,null);
  assert.equal(metric({a:{vm:230},n:{vm:0}}).available,2);
  assert.equal(metric({vm:[230,0],voltage_unit:"kV"}).value,null);
  assert.equal(E.operatingMetric(bus,{vm:[1.1,0],voltage_deviation:.1},"deviation",index).value,null);
  assert.equal(E.operatingMetric(bus,{voltage_deviation:-.1,voltage_reference:"nominal phase-to-ground 230 V"},"deviation",index).value,.1);
});
test("line loading uses both ends and exact positive conductor ratings", () => {
  const index=oneLine({i_max:[100]}), line=get(index,"line","l");
  const metric=record=>E.operatingMetric(line,record,"loading",index);
  assert.equal(metric({x:{cm_fr:0,cm_to:120}}).value,1.2);
  assert.equal(metric({x:{cm_fr:0,cm_to:120}}).available,2);
  assert.equal(metric({x:{cm_fr:0,cm_to:null}}).available,1);
  assert.equal(metric({loading:0}).value,0);
  assert.equal(metric({loading:null,x:{cm_fr:20,cm_to:20}}).value,null);
  for(const rating of [0,-1,null,"100",false]) {
    line.sourceRecord.i_max=[rating]; assert.equal(metric({x:{cm_fr:1,cm_to:1}}).value,null);
  }
  line.sourceRecord.i_max=[100,200];assert.equal(metric({x:{cm_fr:1,cm_to:1}}).value,null);
});

test("terminal voltage selection and complex reference subtraction preserve identity and neutral displacement", () => {
 const index=build({bus:{b:{terminal_names:["p","q","n"]}}}),bus=get(index,"bus","b");
 const record={p:{vm:230,vr:230,vi:0},q:{vm:220,vr:0,vi:220},n:{vm:5,vr:3,vi:4}};
 const metric=(options={},r=record)=>E.operatingMetric(bus,r,"voltage",index,options);
 assert.equal(metric().minimum,5);assert.equal(metric().value,230);
 assert.equal(metric({terminal:"n"}).value,5);
 assert.equal(metric({terminal:"absent"}).value,null);
 const relative=metric({reference:"n"});
 assert.equal(relative.total,2);assert.equal(relative.reference.value,5);
 assert.equal(relative.value,Math.hypot(227,-4));
 assert.equal(relative.minimum,Math.hypot(-3,216));
 assert.equal(metric({terminal:"n",reference:"n"}).value,null);
 assert.equal(metric({reference:"missing"}).value,null);
 assert.equal(metric({reference:"n"},{...record,n:{vm:5}}).value,null);
 const partial=metric({reference:"n"},{...record,q:{vm:220}});
 assert.equal(partial.available,1);assert.equal(partial.total,2);
 const flat={vr:[230,0,3],vi:[0,220,4]};
 assert.equal(metric({reference:"n"},flat).value,null);
 assert.equal(metric({reference:"n"},{...flat,voltage_reference:"global ground"}).value,relative.value);
});

test("engineering issues separate supported violations from incomplete and ambiguous assessments", () => {
 const index=oneLine({i_max:[100]}),a=get(index,"bus","a");
 a.sourceRecord.v_min=[220];a.sourceRecord.v_max=[240];
 const records={a:{x:{vm:200}},b:{y:{vm:230}},l:{x:{cm_fr:150,cm_to:0},loading:0}};
 const issues=()=>E.engineeringIssues(index,item=>records[item.ref.id]);
 const violations=issues().filter(i=>i.category==="violation");
 assert.equal(violations.length,2);assert.equal(violations[0].unit,"A");
 assert.equal(violations[0].limit,100);assert.equal(violations[1].terminal,"x");
 assert.equal(E.engineeringIssues(index,item=>records[item.ref.id],{pairing:"mismatch"}).filter(i=>i.category==="violation").length,0);
 records.a={vm:[200]};assert.ok(issues().some(i=>i.category==="incomplete" && /reference/.test(i.message)));
 a.sourceRecord.v_min=[null];assert.ok(issues().some(i=>i.category==="ambiguity"));
 records.l={loading:1.5};assert.equal(issues().filter(i=>i.category==="violation").length,0);
});

test("assessment lifecycle distinguishes unrun checks, passed limits and unsupported mappings", () => {
 const index=oneLine({i_max:[100]}),a=get(index,"bus","a"),b=get(index,"bus","b");
 a.sourceRecord.v_min=[220];a.sourceRecord.v_max=[240];b.sourceRecord.v_max=[250];
 const records={a:{x:{vm:230}},b:{y:{vm:260}},l:{x:{cm_fr:110,cm_to:null}}};
 const run=options=>E.engineeringAssessment(index,item=>records[item.ref.id],options);
 assert.equal(run({attached:false}).state,"not-run");
 assert.equal(run({attached:false}).rows.length,0);
 assert.equal(run({scenarioReady:false}).state,"scenario-required");
 assert.equal(run({pairing:"mismatch"}).counts.violation,0);
 const result=run({pairing:"matched"});
 assert.equal(result.counts.passed,2);assert.equal(result.counts.violation,2);assert.equal(result.counts.incomplete,1);
 assert.equal(result.rows.find(row=>row.category==="incomplete").resultPath,"x/cm_to");
 a.sourceRecord.vpn_max=[240];assert.equal(run({}).counts.unsupported,1);
 a.sourceRecord.v_min=[270];assert.ok(run({}).counts.ambiguity>0);assert.equal(run({}).counts.passed,0);
});
