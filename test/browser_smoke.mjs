import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const frontendRoot = resolve(fileURLToPath(new URL("../frontend/", import.meta.url)));
const fixtureRoot = resolve(fileURLToPath(new URL("../fixtures/micro/", import.meta.url)));
const contentTypes = { ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
const resultFixture = await readFile(resolve(fixtureRoot, "micro_bmopf_result.json"), "utf8");
const mismatchedResult = JSON.stringify({ ...JSON.parse(resultFixture), meta: { ...JSON.parse(resultFixture).meta, case_fingerprint: "not-the-open-case" } });

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent((request.url || "/").split("?", 1)[0]);
      const relative = pathname === "/" ? "/index.html" : pathname;
      const candidate = resolve(frontendRoot, `.${normalize(relative)}`);
      if (!candidate.startsWith(frontendRoot)) throw new Error("Invalid path");
      const body = await readFile(candidate);
      response.writeHead(200, { "content-type": contentTypes[extname(candidate)] || "application/octet-stream" });
      response.end(body);
    } catch (_) {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  return new Promise((resolveServer) => server.listen(0, "127.0.0.1", () => resolveServer(server)));
}

const server = await startStaticServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;

try {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.locator('script[src="renderer-contract.js"]').count(), 1);
    assert.equal(await page.locator('script[src="renderers/symbols.js"]').count(), 1);
    assert.equal(await page.locator('script[src="projections/multi-wire.js"]').count(), 1);
    assert.equal(await page.locator('script[src="layout/deterministic.js"]').count(), 1);
    assert.equal(await page.locator('script[src="renderers/geospatial.js"]').count(), 1);
    assert.equal(await page.locator('script[src="renderers/single-wire.js"]').count(), 1);
    await page.locator("#file-input").setInputFiles(resolve(fixtureRoot, "micro_bmopf.json"));
    await page.locator("#case-summary h2").waitFor({ state: "visible" });
    assert.equal(await page.locator("#case-summary h2").textContent(), "micro-bmopf");
    const dropJson = async (text, name) => page.evaluate(({ text: content, name: filename }) => {
      const file = new File([content], filename, { type: "application/json" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document.querySelector("#drop-zone").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, { text, name });
    await dropJson(resultFixture, "micro_bmopf_result.json");
    await page.waitForTimeout(100);
    assert.match(await page.locator("#result-summary").innerText(), /Pairing matched/);
    assert.match(await page.locator("#view-status").textContent(), /Results attached to the current case/);
    await dropJson(mismatchedResult, "mismatch_result.json");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#case-summary h2").textContent(), "micro-bmopf");
    assert.match(await page.locator("#result-summary").innerText(), /Pairing mismatch/);
    assert.match(await page.locator("#view-status").textContent(), /identity mismatch/);
    await page.getByRole("tab", { name: "Single-wire" }).click();
    await page.getByRole("button", { name: "Apply ELK layout" }).click();
    await page.locator("#view-status").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#view-status")?.textContent.includes("ELK layered layout applied"), null, { timeout: 15000 });
    const cache = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("bmopf-layout-v3:"))?.[1] || "");
    const parsedCache = JSON.parse(cache);
    assert.equal(parsedCache.version, 3);
    assert.equal(parsedCache.routeSpace, "single-svg-v2");
    assert.equal(parsedCache.elkVersion, "0.10.2");
    assert.match(parsedCache.graphSignature, /^sld-elk-graph-v1:/);
    assert.ok(Object.keys(parsedCache.profiles).some((key) => key.includes("direction=source-to-load")));
    const primaryProfile = Object.values(parsedCache.profiles).find((profile) => profile.engine === "elk");
    assert.ok(primaryProfile);
    assert.ok(Object.keys(primaryProfile.routes || {}).length > 0);
    await page.locator("#sld-direction").selectOption("load-to-source");
    await page.locator("#sld-direction").selectOption("source-to-load");
    const profilesAfterSwitch = await page.evaluate(() => Object.values(localStorage).map((value) => { try { return JSON.parse(value); } catch (_) { return null; } }).find((value) => value?.version === 3)?.profiles || {});
    assert.ok(Object.keys(profilesAfterSwitch).some((key) => key.includes("direction=load-to-source")));
    const profileCount = await page.evaluate(() => Object.values(localStorage).filter((value) => value.includes('"version":3')).length);
    assert.equal(profileCount, 1);
    const directionControl = page.getByLabel("Single-line direction");
    const rootControl = page.getByLabel("Single-line root bus");
    for (const direction of ["source-to-load", "load-to-source"]) {
      for (const root of ["auto", "source", "feeder", "load_bus", "aux_bus"]) {
        await directionControl.selectOption(direction);
        await rootControl.selectOption(root);
      }
    }
    const retainedProfiles = await page.evaluate(() => Object.values(localStorage).map((value) => { try { return JSON.parse(value); } catch (_) { return null; } }).find((value) => value?.version === 3)?.profiles || {});
    assert.ok(Object.keys(retainedProfiles).length <= 8);
    const inventorySearch = page.getByPlaceholder("Search assets, buses, or result fields");
    await inventorySearch.fill("line_main");
    await page.locator('button[data-kind="line"][data-id="line_main"]').click();
    await page.getByRole("tab", { name: "Multi-wire" }).click();
    const multiText = await page.locator("#canvas").innerText();
    assert.match(multiText, /terminal detail/);
    assert.match(multiText, /Ordered conductor pairing/);
    await inventorySearch.fill("switch_open");
    await page.locator('button[data-kind="switch"][data-id="switch_open"]').click();
    assert.match(await page.locator("#canvas").innerText(), /Open switch/);
    await inventorySearch.fill("tx_lv");
    await page.locator('button[data-kind="transformer"][data-id="tx_lv"]').click();
    const transformerText = await page.locator("#canvas").innerText();
    assert.match(transformerText, /transformer/);
    assert.match(transformerText, /Ordered conductor pairing/);
    await inventorySearch.fill("tx_three");
    await page.locator('button[data-kind="transformer"][data-id="tx_three"]').click();
    const multiWindingText = await page.locator("#canvas").innerText();
    assert.match(multiWindingText, /winding detail/);
    assert.match(multiWindingText, /WYE/);
    assert.match(multiWindingText, /DELTA/);
    assert.match(multiWindingText, /Each winding keeps its bus and terminal stack/);
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolveServer) => server.close(resolveServer));
}
