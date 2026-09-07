import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import vm from "node:vm";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { buildStatic } from "../scripts/build-static.mjs";

const outDir = await mkdtemp(join(tmpdir(), "distribution-network-plots-build-"));
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = await buildStatic({ rootDir: projectRoot, outDir });
const index = await readFile(join(outDir, "index.html"), "utf8");
const bundle = await readFile(join(outDir, "assets", "bmopf-explorer.js"), "utf8");
const elk = await readFile(join(outDir, "vendor", "elk.bundled.js"), "utf8");
const deterministicSource = await readFile(join(projectRoot, "frontend", "layout", "deterministic.js"), "utf8");
const manifest = JSON.parse(await readFile(join(outDir, "build-manifest.json"), "utf8"));

assert.equal(result.manifest.format, "distribution-network-plots-static-v1");
assert.equal(manifest.javascript, "assets/bmopf-explorer.js");
assert.deepEqual(manifest.moduleOrder, result.manifest.moduleOrder);
assert.match(index, /assets\/bmopf-explorer\.js/);
assert.match(index, /assets\/styles\.css/);
assert.doesNotMatch(index, /src="(?:examples|model|renderer-contract|app)\.js"/);
assert.match(bundle, /BMOPFModel/);
assert.match(bundle, /BMOPFRenderers/);
assert.match(bundle, /BMOPFProjections/);
assert.match(bundle, /BMOPFLayouts/);
assert.match(bundle, /Geospatial/);
assert.match(bundle, /Single-line diagram/);
assert.match(elk, /ELK/);

const sandbox = { globalThis: {} };
vm.runInNewContext(deterministicSource, sandbox);
const denseBuses = [{ ref: { id: "source_bus" } }, ...Array.from({ length: 12 }, (_, index) => ({ ref: { id: `load_${index + 1}` } }))];
const denseAssets = [{ ref: { kind: "voltage_source", id: "source" }, ports: [{ busId: "source_bus" }] }, ...denseBuses.slice(1).map((bus) => ({ ref: { kind: "line", id: `line_${bus.ref.id}` }, ports: [{ busId: "source_bus" }, { busId: bus.ref.id }] }))];
const denseLayout = sandbox.globalThis.BMOPFLayouts.createDeterministicLayout({ getIndex: () => ({ buses: denseBuses, assets: denseAssets }), getLayout: () => ({ direction: "source-to-load", root: "auto", locked: {} }) });
const densePositions = denseLayout.singlePositions();
const denseY = denseBuses.slice(1).map((bus) => densePositions.get(bus.ref.id)[1]).sort((a, b) => a - b);
assert.ok(denseY.every((value, index) => index === 0 || value - denseY[index - 1] >= 64));
assert.ok(denseLayout.singleBounds(densePositions).height > 500);

// A radial network is drawn as a tidy tree: every bus is placed on its topology
// rank and each parent is centred over the children it feeds.
const radialBuses = ["source_bus", "b1", "b2", "b3", "b4", "b5", "b6"].map((id) => ({ ref: { id } }));
const branch = (id, from, to) => ({ ref: { kind: "line", id }, ports: [{ busId: from }, { busId: to }] });
const radialAssets = [
  { ref: { kind: "voltage_source", id: "source" }, ports: [{ busId: "source_bus" }] },
  branch("l1", "source_bus", "b1"), branch("l2", "source_bus", "b2"),
  branch("l3", "b1", "b3"), branch("l4", "b1", "b4"),
  branch("l5", "b2", "b5"), branch("l6", "b2", "b6")
];
const radialLayout = sandbox.globalThis.BMOPFLayouts.createDeterministicLayout({ getIndex: () => ({ buses: radialBuses, assets: radialAssets }), getLayout: () => ({ direction: "source-to-load", root: "auto", locked: {} }) });
const radialInfo = radialLayout.singleLayoutInfo();
assert.equal(radialInfo.topology, "radial");
assert.equal(radialInfo.strategy, "tidy-tree");
const radialPositions = radialLayout.singlePositions();
assert.equal(radialPositions.size, radialBuses.length);
assert.ok(radialPositions.get("b1")[0] < radialPositions.get("b3")[0]);
assert.equal(radialPositions.get("b1")[1], (radialPositions.get("b3")[1] + radialPositions.get("b4")[1]) / 2);
assert.equal(radialPositions.get("source_bus")[1], (radialPositions.get("b1")[1] + radialPositions.get("b2")[1]) / 2);

// Parallel branches and a self-loop add no second path between buses, so the
// feeder stays radial and keeps its tidy tree.
const parallelBuses = ["source_bus", "b1", "b2"].map((id) => ({ ref: { id } }));
const parallelAssets = [
  { ref: { kind: "voltage_source", id: "source" }, ports: [{ busId: "source_bus" }] },
  branch("cable_a", "source_bus", "b1"), branch("cable_b", "source_bus", "b1"),
  branch("l2", "b1", "b2"),
  { ref: { kind: "shunt", id: "loop" }, ports: [{ busId: "b2" }, { busId: "b2" }] }
];
const parallelLayout = sandbox.globalThis.BMOPFLayouts.createDeterministicLayout({ getIndex: () => ({ buses: parallelBuses, assets: parallelAssets }), getLayout: () => ({ direction: "source-to-load", root: "auto", locked: {} }) });
const parallelInfo = parallelLayout.singleLayoutInfo();
assert.equal(parallelInfo.topology, "radial");
assert.equal(parallelInfo.strategy, "tidy-tree");
const parallelPositions = parallelLayout.singlePositions();
assert.equal(parallelPositions.size, parallelBuses.length);
assert.ok(parallelPositions.get("source_bus")[0] < parallelPositions.get("b1")[0]);
assert.ok(parallelPositions.get("b1")[0] < parallelPositions.get("b2")[0]);

// A closed ring is meshed, so it falls back to layered ranks, and the explicit
// stress engine stays deterministic across runs.
const ringBuses = ["b0", "b1", "b2", "b3"].map((id) => ({ ref: { id } }));
const ringAssets = [
  { ref: { kind: "voltage_source", id: "source" }, ports: [{ busId: "b0" }] },
  branch("r1", "b0", "b1"), branch("r2", "b1", "b2"), branch("r3", "b2", "b3"), branch("r4", "b3", "b0")
];
const ringLayout = sandbox.globalThis.BMOPFLayouts.createDeterministicLayout({ getIndex: () => ({ buses: ringBuses, assets: ringAssets }), getLayout: () => ({ direction: "source-to-load", root: "auto", locked: {} }) });
const ringInfo = ringLayout.singleLayoutInfo();
assert.equal(ringInfo.topology, "meshed");
assert.equal(ringInfo.strategy, "layered");
const ringPositions = ringLayout.singlePositions();
assert.equal(ringPositions.size, ringBuses.length);
assert.ok(ringPositions.get("b0")[0] < ringPositions.get("b1")[0]);
assert.equal(ringPositions.get("b1")[0], ringPositions.get("b3")[0]);
const ringStress = ringLayout.singleStressPositions();
assert.equal(ringStress.size, ringBuses.length);
assert.ok([...ringStress.values()].every((point) => point.every(Number.isFinite)));
assert.equal(JSON.stringify([...ringLayout.singleStressPositions()]), JSON.stringify([...ringStress]));
