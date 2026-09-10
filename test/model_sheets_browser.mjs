import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../frontend/", import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(req.url === "/" ? "/index.html" : req.url)}`);
    if (!path.startsWith(root)) throw new Error("path");
    res.setHeader("content-type", { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[extname(path)] || "text/plain");
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const select = async (kind, id) => {
    await page.getByPlaceholder("Search assets, buses, or result fields").fill(id);
    await page.locator(`#inventory button[data-kind="${kind}"][data-id="${id}"]`).click();
  };
  const first = () => page.locator("#canvas .model-sheet").first();
  await select("line", "line_main");
  await page.getByRole("tab", { name: "Electrical detail", exact: true }).click();
  await first().locator('[data-matrix="series"][data-row="0"][data-column="1"]').focus();
  await page.keyboard.press("Enter");
  assert.match(await first().locator("[data-matrix-evidence]").innerText(), /Mutual coupling/);
  assert.match(await first().locator("[data-matrix-evidence]").innerText(), /R_series_1_2/);
  assert.equal(await first().locator(".sheet-highlight[data-sheet-conductor]").count(), 2);
  await first().locator("[data-sheet-basis]").selectOption("source");
  assert.match(await first().innerText(), /Ω\/m/);
  await first().locator("[data-sheet-basis]").selectOption("total");
  await first().locator("[data-sheet-pin]").first().click();
  await select("switch", "switch_open");
  assert.equal(await page.locator("#canvas .model-sheet").count(), 2);
  await first().locator("[data-sheet-pin]").first().click();
  await select("load", "load_three_phase");
  assert.equal(await page.locator("#canvas .model-sheet").count(), 3);
  await page.locator("[data-pin-up]").click();
  assert.match(await page.locator(".atlas-pins > span").first().innerText(), /switch_open/);
  await first().locator('[data-sheet-element="2"]').click();
  assert.equal(await first().locator('[data-sheet-element-mark="2"]').getAttribute("class"), "sheet-highlight");
  await first().locator("[data-sheet-u]").fill("1.1");
  assert.match(await first().locator("[data-sheet-response]").innerText(), /9648/);
  const atlasDownload = page.waitForEvent("download");
  await page.locator("[data-atlas-export]").click();
  const atlasHtml = await readFile(await (await atlasDownload).path(), "utf8");
  assert.match(atlasHtml, /0\.054/);
  assert.match(atlasHtml, /load_three_phase/);
  assert.match(atlasHtml, /switch_open/);
  assert.doesNotMatch(atlasHtml, /<script|<button|<input|<select/);
  const svgDownload = page.waitForEvent("download");
  await first().locator("[data-sheet-svg]").first().click();
  const drawing = await readFile(await (await svgDownload).path(), "utf8");
  assert.match(drawing, /<svg/);
  assert.match(drawing, /stroke: rgb/);

  await select("line", "line_main");
  await first().locator("[data-sheet-baseline]").click();
  assert.match(await first().innerText(), /No source-parameter changes/);
  const raw = await page.evaluate(() => JSON.parse(JSON.stringify(BMOPFExamples[0].case)));
  const comparison = structuredClone(raw);
  comparison.line.line_main.length = 240;
  comparison.line.line_main.terminal_map_to = ["2", "1", "3", "n"];
  await page.locator("[data-model-comparison]").setInputFiles({ name: "changed-model.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(comparison)) });
  await page.waitForFunction(() => document.querySelector("#canvas").textContent.includes("changed-model.json"));
  assert.match(await first().innerText(), /240/);
  assert.ok(await first().locator("tr.sheet-changed").count() >= 3);
  assert.equal(await first().locator(".sheet-changed-conductor").count(), 2);
  await page.locator("[data-clear-comparison]").click();

  // A fresh case clears the atlas/baseline; unknown fields and invalid sources
  // are visible even when the overview cannot render those semantics.
  raw.line.line_main.custom_control = { unsafe_name: '<img src=x onerror="alert(1)">' };
  delete raw.line.line_main.length;
  raw.line.line_main.terminal_map_to = ["1", "3", "2", "n", "extra"];
  await page.locator("#file-input").setInputFiles({ name: "incomplete.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(raw)) });
    await page.locator("#import-progress").waitFor({ state: "detached" });
  await select("line", "line_main");
  assert.equal(await page.locator("#canvas .model-sheet").count(), 1);
  assert.match(await first().innerText(), /Segment totals unavailable/);
  assert.match(await first().innerText(), /extra/);
  assert.match(await first().innerText(), /Unrepresented model fields[\s\S]*custom_control/);
  assert.equal(await first().locator("img").count(), 0);

  // Documented terminal-keyed results: nonzero neutral, true radians, current
  // directions and identity-preserving comparisons across object insertion order.
  const result = { meta: { case_id: raw.name }, bus: { source: { "1": { vr: 230, vi: 0, vm: 230, va: 0 }, "n": { vr: 2, vi: 1, vm: Math.sqrt(5), va: Math.atan2(1, 2) } } } };
  await page.locator("#result-input").setInputFiles({ name: "terminal-results.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(result)) });
    await page.locator("#import-progress").waitFor({ state: "detached" });
  await select("bus", "source");
  assert.match(await first().innerText(), /Voltage phasors/);
  assert.match(await first().innerText(), /terminal–ground/);
  assert.match(await first().innerText(), /rad/);
  assert.equal(await first().locator("svg[aria-label*='voltage phasor']").count(), 2);
  const comparisonResult = structuredClone(result);
  comparisonResult.bus.source = { n: { vr: 1, vi: 0, vm: 1, va: 0 }, "1": { vr: 229, vi: 0, vm: 229, va: 0 } };
  await page.locator("#comparison-input").setInputFiles({ name: "prior-results.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(comparisonResult)) });
    await page.locator("#import-progress").waitFor({ state: "detached" });
  assert.match(await first().innerText(), /prior-results.json/);
  assert.match(await first().innerText(), /Δ current − comparison/);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await first().evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `/tmp/model-sheets-app-${width}.png` });
  }
  await select("transformer", "tx_three");
  assert.equal(await first().locator(".sheet-winding").count(), 3);
  assert.match(await first().innerText(), /Winding 1: WYE needs 4 distinct terminals/);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
