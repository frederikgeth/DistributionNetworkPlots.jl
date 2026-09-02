import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
