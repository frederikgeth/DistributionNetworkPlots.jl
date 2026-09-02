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
const resultCaseFingerprint = JSON.parse(resultFixture).meta.case_fingerprint;
const mismatchedResult = JSON.stringify({ ...JSON.parse(resultFixture), meta: { ...JSON.parse(resultFixture).meta, case_fingerprint: "not-the-open-case" } });
const largeCase = {
  name: "large-browser-smoke-case",
  bus: Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`bus_${index}`, { terminal_names: ["1", "n"] }])),
  voltage_source: { source: { bus: "bus_0", terminal_map: ["1", "n"] } },
  line: Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`line_${index}`, { bus_from: `bus_${index}`, bus_to: `bus_${index + 1}`, terminal_map_from: ["1", "n"], terminal_map_to: ["1", "n"] }]))
};

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
    await page.locator("#case-summary h2").waitFor({ state: "visible" });
    assert.equal(await page.locator("#case-summary h2").textContent(), "example-complete-feeder");
    assert.equal(await page.locator(".view-tab.active").getAttribute("data-view"), "single");
    assert.match(await page.evaluate(() => window.location.hash), /#\/single$/);
    assert.deepEqual(await page.locator(".view-tab").evaluateAll((tabs) => tabs.map((tab) => tab.dataset.view)), ["single", "multi", "geo", "diagnostics"]);
    assert.equal(await page.locator(".sidebar > .help-panel").evaluate((node) => node === node.parentElement.firstElementChild), true);
    const displayOptions = page.locator("#display-options");
    assert.equal(await displayOptions.isVisible(), true);
    await displayOptions.locator("summary").click();
    assert.equal(await displayOptions.locator('input[data-display-option="showBusLabels"]').isChecked(), true);
    assert.equal(await displayOptions.locator('input[data-display-option="showDeviceLabels"]').isChecked(), false);
    assert.equal(await displayOptions.locator('input[data-display-option="showArrows"]').isChecked(), false);
    await displayOptions.locator('input[data-display-option="showDeviceLabels"]').uncheck();
    assert.equal(await displayOptions.locator('input[data-display-option="showDeviceLabels"]').isChecked(), false);
    await displayOptions.locator('input[data-display-option="showDeviceLabels"]').check();
    await page.getByPlaceholder("Search assets, buses, or result fields").fill("rooftop_ibr");
    await page.locator('button[data-kind="ibr"][data-id="rooftop_ibr"]').click();
    assert.match(await page.locator("#inspector").innerText(), /s_max[\s\S]*35000 VA/);
    const attachedTransforms = await page.locator('#canvas g[data-kind="load"], #canvas g[data-kind="ibr"], #canvas g[data-kind="capacitor"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("transform")));
    assert.equal(new Set(attachedTransforms).size, attachedTransforms.length);
    assert.equal(await page.locator("#floating-legend").isVisible(), true);
    assert.match(await page.locator("#floating-legend").innerText(), /busbar/);
    assert.match(await page.locator("#case-summary").innerText(), /Coordinate provenance: synthetic illustrative coordinates/);
    // #view-status is an aria-live region and loading an example announces the
    // example itself, so re-enter the geospatial view to read its own status.
    await page.getByRole("tab", { name: "Single-wire" }).click();
    await page.getByRole("tab", { name: "Geospatial" }).click();
    assert.match(await page.locator("#view-status").textContent(), /Geographic coordinates used for 4\/4 buses/);
    const helpPanel = page.locator(".help-panel");
    await helpPanel.locator("summary").first().click();
    assert.match(await helpPanel.innerText(), /Quick start/);
    assert.match(await helpPanel.innerText(), /Data and units/);
    assert.match(await helpPanel.innerText(), /Provenance and limitations/);
    await page.getByRole("tab", { name: "Single-wire" }).click();
    await page.getByPlaceholder("Search assets, buses, or result fields").fill("line_main");
    await page.locator('button[data-kind="line"][data-id="line_main"]').click();
    const multiDetailPane = page.locator("#multi-detail-panel");
    assert.equal(await multiDetailPane.isVisible(), true);
    assert.match(await page.locator("#multi-detail-canvas").innerText(), /terminal detail|Π branch model/);
    const multiDetailHandle = page.locator("#multi-detail-resizer");
    assert.equal(await multiDetailHandle.getAttribute("role"), "separator");
    const detailWidthBefore = Number(await multiDetailHandle.getAttribute("aria-valuenow"));
    await multiDetailHandle.focus();
    await multiDetailHandle.press("ArrowLeft");
    assert.ok(Number(await multiDetailHandle.getAttribute("aria-valuenow")) > detailWidthBefore);
    await page.getByRole("button", { name: "Collapse Multi-wire detail" }).click();
    assert.equal(await multiDetailPane.isVisible(), false);
    await page.getByRole("button", { name: "Show component detail" }).click();
    assert.equal(await multiDetailPane.isVisible(), true);
    const draggableBus = page.locator('g.sld-draggable[data-kind="bus"][data-id="source"]');
    assert.equal(await draggableBus.count(), 1);
    const sourceBox = await draggableBus.boundingBox();
    assert.ok(sourceBox);
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 30, sourceBox.y + sourceBox.height / 2 + 12);
    await page.mouse.up();
    const defaultLayout = JSON.parse(await page.evaluate(() => localStorage.getItem("bmopf-layout-v3:example-complete-feeder")));
    assert.ok(Object.values(defaultLayout.profiles).some((profile) => Array.isArray(profile.locked?.source)));
    await page.getByPlaceholder("Search assets, buses, or result fields").fill("line_main");
    await page.locator('button[data-kind="line"][data-id="line_main"]').click();
    const draggableLine = page.locator('g.sld-draggable[data-kind="line"][data-id="line_main"]');
    assert.equal(await draggableLine.count(), 1);
    // page.mouse takes raw viewport coordinates and does not scroll, so bring the
    // symbol into view first. Grab it at its translate origin, where the glyph is
    // drawn: the group's bounding box also spans the label 27px below, so the box
    // centre falls in the unpainted gap between the two and hits nothing.
    await draggableLine.scrollIntoViewIfNeeded();
    const lineOrigin = await draggableLine.evaluate((node) => { const ctm = node.getScreenCTM(); return { x: ctm.e, y: ctm.f }; });
    assert.ok(lineOrigin.x > 0 && lineOrigin.y > 0);
    await page.mouse.move(lineOrigin.x, lineOrigin.y);
    await page.mouse.down();
    await page.mouse.move(lineOrigin.x + 18, lineOrigin.y + 8);
    await page.mouse.up();
    const layoutAfterDeviceDrag = JSON.parse(await page.evaluate(() => localStorage.getItem("bmopf-layout-v3:example-complete-feeder")));
    assert.ok(Object.values(layoutAfterDeviceDrag.profiles).some((profile) => Array.isArray(profile.positions?.["line:line_main"])));
    await page.getByRole("button", { name: "Apply force layout" }).click();
    assert.match(await page.locator("#view-status").textContent(), /Force-directed layout applied/);
    const forceLayout = JSON.parse(await page.evaluate(() => localStorage.getItem("bmopf-layout-v3:example-complete-feeder")));
    assert.ok(Object.values(forceLayout.profiles).some((profile) => profile.engine === "force" && Object.keys(profile.locked || {}).length >= 4));
    await page.getByRole("tab", { name: "Multi-wire" }).click();
    assert.match(await page.locator("#canvas").innerText(), /Π branch model/);
    assert.match(await page.locator("#canvas").innerText(), /Series Zs \[Ω\]/);
    assert.match(await page.locator("#canvas").innerText(), /0\.054/);
    assert.match(await page.locator("#canvas").innerText(), /Pure series branch · shunt admittance omitted/);
    await inventorySearch.fill("tx_lv");
    await page.locator('button[data-kind="transformer"][data-id="tx_lv"]').click();
    assert.match(await page.locator("#canvas").innerText(), /from: DELTA/);
    assert.match(await page.locator("#canvas").innerText(), /to: WYE/);
    await inventorySearch.fill("load_a");
    await page.locator('button[data-kind="load"][data-id="load_a"]').click();
    const loadText = await page.locator("#canvas").innerText();
    assert.match(loadText, /connection: SINGLE PHASE/);
    assert.match(loadText, /SINGLE PHASE connection/);
    assert.match(loadText, /load model: CONSTANT POWER \(default\)/);
    await inventorySearch.fill("backup_gen");
    await page.locator('button[data-kind="generator"][data-id="backup_gen"]').click();
    assert.match(await page.locator("#canvas").innerText(), /connection: WYE/);
    assert.match(await page.locator("#canvas").innerText(), /WYE connection/);
    await page.getByRole("tab", { name: "Single-wire" }).click();
    assert.ok(await page.locator("#multi-detail-canvas").evaluate((node) => node.scrollWidth <= node.clientWidth + 1));
    await page.getByRole("tab", { name: "Multi-wire" }).click();
    await page.locator("#file-input").setInputFiles(resolve(fixtureRoot, "micro_bmopf.json"));
    await page.locator("#case-summary h2").waitFor({ state: "visible" });
    assert.equal(await page.locator("#case-summary h2").textContent(), "micro-bmopf");
    const overviewTable = page.locator('table[data-resizable-table="class-overview"]');
    assert.equal(await overviewTable.locator(".column-resizer").count(), 3);
    const resultRangeHandle = overviewTable.locator(".column-resizer").nth(2);
    await resultRangeHandle.focus();
    const overviewWidthBefore = Number(await resultRangeHandle.getAttribute("aria-valuenow"));
    await resultRangeHandle.press("ArrowRight");
    assert.ok(Number(await resultRangeHandle.getAttribute("aria-valuenow")) > overviewWidthBefore);
    assert.match(await page.evaluate(() => localStorage.getItem("bmopf-table-widths-v1")), /class-overview/);
    const inventoryHandle = page.locator(".inventory-column-resizer");
    assert.equal(await inventoryHandle.count(), 1);
    await inventoryHandle.focus();
    await inventoryHandle.press("ArrowRight");
    assert.ok(Number(await inventoryHandle.getAttribute("aria-valuenow")) > 100);
    assert.ok(Number(await page.evaluate(() => localStorage.getItem("bmopf-inventory-column-width-v1"))) > 100);
    const sidebarResizer = page.locator("#sidebar-resizer");
    assert.equal(await sidebarResizer.getAttribute("role"), "separator");
    const initialSidebarWidth = await page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().width);
    await sidebarResizer.focus();
    await sidebarResizer.press("ArrowLeft");
    const expandedSidebarWidth = await page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().width);
    assert.ok(expandedSidebarWidth > initialSidebarWidth);
    assert.equal(await sidebarResizer.getAttribute("aria-valuenow"), String(Math.round(expandedSidebarWidth)));
    assert.equal(await page.evaluate(() => localStorage.getItem("bmopf-sidebar-width-v1")), String(Math.round(expandedSidebarWidth)));
    await sidebarResizer.press("Home");
    assert.equal(await sidebarResizer.getAttribute("aria-valuenow"), "360");
    assert.equal(await page.evaluate(() => localStorage.getItem("bmopf-sidebar-width-v1")), "360");
    const dropJson = async (text, name) => page.evaluate(({ text: content, name: filename }) => {
      const file = new File([content], filename, { type: "application/json" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      document.querySelector("#drop-zone").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, { text, name });
    await dropJson(resultFixture, "micro_bmopf_result.json");
    await page.waitForTimeout(100);
    // A case opened from a plain JSON file carries no fingerprint of its own, so
    // the app can report the identity a result claims but cannot verify it. The
    // cryptographic matched/mismatch paths need a case that declares its own
    // fingerprint, which only a rendered report does today.
    assert.match(await page.locator("#result-summary").innerText(), /Pairing unverified/i);
    assert.match(await page.locator("#result-summary").innerText(), new RegExp(`case identity ${resultCaseFingerprint}`));
    assert.match(await page.locator("#view-status").textContent(), /Results attached to the current case/);
    assert.match(await page.locator("#view-status").textContent(), /identity could not be verified/);
    await dropJson(mismatchedResult, "mismatch_result.json");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#case-summary h2").textContent(), "micro-bmopf");
    assert.match(await page.locator("#result-summary").innerText(), /case identity not-the-open-case/);
    await page.getByRole("tab", { name: "Single-wire" }).click();
    await page.getByRole("button", { name: "Apply ELK layout" }).click();
    await page.locator("#view-status").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#view-status")?.textContent.includes("ELK layered layout applied"), null, { timeout: 15000 });
    // Dragging in the example case persists its own layout entry, so address this
    // case's cache by key rather than taking whichever entry comes first.
    const microLayoutKey = "bmopf-layout-v3:micro-bmopf";
    const readLayout = (key) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || "null"), key);
    const cache = await page.evaluate((storageKey) => localStorage.getItem(storageKey) || "", microLayoutKey);
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
    const profilesAfterSwitch = (await readLayout(microLayoutKey))?.profiles || {};
    assert.ok(Object.keys(profilesAfterSwitch).some((key) => key.includes("direction=load-to-source")));
    // Direction and root permutations live as profiles inside one entry per case,
    // so the set of layout entries stays exactly one per case that was opened.
    const layoutKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("bmopf-layout-v3:")).sort());
    assert.deepEqual(layoutKeys, ["bmopf-layout-v3:example-complete-feeder", microLayoutKey].sort());
    const directionControl = page.getByLabel("Single-line direction");
    const rootControl = page.getByLabel("Single-line root bus");
    for (const direction of ["source-to-load", "load-to-source"]) {
      for (const root of ["auto", "source", "feeder", "load_bus", "aux_bus"]) {
        await directionControl.selectOption(direction);
        await rootControl.selectOption(root);
      }
    }
    const retainedProfiles = (await readLayout(microLayoutKey))?.profiles || {};
    assert.ok(Object.keys(retainedProfiles).length <= 8);
    const inventorySearch = page.getByPlaceholder("Search assets, buses, or result fields");
    await inventorySearch.fill("line_main");
    await page.locator('button[data-kind="line"][data-id="line_main"]').click();
    await inventorySearch.fill("switch_open");
    await page.locator('button[data-kind="switch"][data-id="switch_open"]').click();
    assert.equal(await page.getByRole("button", { name: "Go back", exact: true }).isDisabled(), false);
    await page.getByRole("button", { name: "Go back", exact: true }).click();
    await page.waitForTimeout(100);
    assert.match(await page.evaluate(() => window.location.hash), /line\/line_main$/);
    await page.getByRole("button", { name: "Go forward", exact: true }).click();
    await page.waitForTimeout(100);
    assert.match(await page.evaluate(() => window.location.hash), /switch\/switch_open$/);
    await inventorySearch.fill("line_main");
    await page.locator('button[data-kind="line"][data-id="line_main"]').click();
    await page.getByRole("button", { name: "Show full overview", exact: true }).click();
    await page.waitForTimeout(100);
    assert.match(await page.evaluate(() => window.location.hash), /single$/);
    // The overview action clears the selection, and multi-wire focus mode needs a
    // selected multi-terminal device, so re-select the line before switching tabs.
    await page.locator('button[data-kind="line"][data-id="line_main"]').click();
    await page.getByRole("tab", { name: "Multi-wire" }).click();
    const multiText = await page.locator("#canvas").innerText();
    assert.match(multiText, /terminal detail/);
    // A line renders the Pi branch model detail and returns before the generic
    // conductor view, so the ordered-pairing note is asserted on the transformer.
    assert.match(multiText, /\u03a0 branch model/);
    await inventorySearch.fill("switch_open");
    await page.locator('button[data-kind="switch"][data-id="switch_open"]').click();
    assert.match(await page.locator("#canvas").innerText(), /Open switch/);
    assert.equal(await page.locator('#canvas g[data-kind="switch"][data-id="switch_open"]').count(), 4);
    await inventorySearch.fill("tx_lv");
    await page.locator('button[data-kind="transformer"][data-id="tx_lv"]').click();
    const transformerText = await page.locator("#canvas").innerText();
    assert.match(transformerText, /transformer/);
    assert.match(transformerText, /Ordered conductor pairing/);
    const transformerLabelXs = await page.locator('#canvas text[data-role="conductor-label"]').evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("x"))));
    assert.ok(transformerLabelXs.length >= 3 && transformerLabelXs.every((x) => x < 285));
    await inventorySearch.fill("tx_three");
    await page.locator('button[data-kind="transformer"][data-id="tx_three"]').click();
    const multiWindingText = await page.locator("#canvas").innerText();
    assert.match(multiWindingText, /winding detail/);
    assert.match(multiWindingText, /WYE/);
    assert.match(multiWindingText, /DELTA/);
    assert.match(multiWindingText, /Each winding keeps its bus and terminal stack/);
    await page.locator("#file-input").setInputFiles({ name: "large-browser-smoke-case.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(largeCase)) });
    await page.locator("#case-summary h2").waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "Single-wire" }).click();
    await page.locator("#large-case-dialog").waitFor({ state: "visible" });
    assert.match(await page.locator("#large-case-dialog").innerText(), /large case/i);
    await page.locator("#large-case-bypass").check();
    await page.locator("#large-case-continue").click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#large-case-dialog").count(), 0);
    assert.ok(Number(await page.locator("#canvas svg").getAttribute("width")) > 760);
    await page.getByRole("button", { name: "Apply force layout" }).click();
    assert.match(await page.locator("#view-status").textContent(), /Force-directed layout applied to 501 buses/);
    const largeForceLayout = JSON.parse(await page.evaluate(() => localStorage.getItem("bmopf-layout-v3:large-browser-smoke-case")));
    assert.ok(Object.values(largeForceLayout.profiles).some((profile) => profile.engine === "force" && Object.keys(profile.locked || {}).length === 501));
    assert.deepEqual(consoleErrors, []);
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolveServer) => server.close(resolveServer));
}
