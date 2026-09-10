import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildStatic } from '../scripts/build-static.mjs';
const browser = await chromium.launch({ headless: true });
const outDir = await mkdtemp(resolve(tmpdir(), 'bmopf-worker-test-'));
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve('frontend/index.html')).href);
  await page.locator('#case-summary h2').waitFor();
  const result = await page.evaluate(async () => {
    const raw = JSON.parse('{"name":"worker-case","bus":{"__proto__":{"terminal_names":["1"]},"b":{"terminal_names":["1"]}},"line":{"l":{"bus_from":"__proto__","bus_to":"b","terminal_map_from":["1"],"terminal_map_to":["1"]}}}');
    raw.meta = { note: 'preserve me', wide: Array(150000).fill(0) };
    const file = new File([JSON.stringify(raw)], 'case.json');
    const imported = await BMOPFImporter.read(file);
    const bus = imported.index.busById.get('__proto__');
    const line = imported.index.byKind.get('line').get('l');
    const embedded = await BMOPFImporter.read(new File([JSON.stringify({ case: raw, result: { bus: { b: { vm: [1] } } } })], 'result.json'), { mode: 'auto' });
    const controller = new AbortController();
    const cancelled = BMOPFImporter.read(file, { signal: controller.signal }).catch(error => error.name);
    controller.abort();
    const malformed = await BMOPFImporter.read(new File(['{'], 'invalid.json')).catch(error => error.message);
    const deep = await BMOPFImporter.read(new File(['{"a":'.repeat(102) + '0' + '}'.repeat(102)], 'deep.json')).catch(error => error.message);
    const nativeWorker = window.Worker;
    window.Worker = undefined;
    const fallback = await BMOPFImporter.read(new File(['{"name":"fallback","bus":{}}'], 'fallback.json'));
    window.Worker = nativeWorker;
    return {
      execution: imported.execution, equal: JSON.stringify(imported.raw) === JSON.stringify(raw),
      sourceIdentity: bus.sourceRecord === imported.raw.bus.__proto__,
      mapIdentity: imported.index.byBus.get('b')[0] === line,
      rawIdentity: imported.index.raw === imported.raw,
      componentCount: imported.index.componentCount,
      embeddedIdentity: embedded.index.raw === embedded.raw.case,
      embeddedSource: embedded.index.busById.get('b').sourceRecord === embedded.raw.case.bus.b,
      isResult: embedded.isResult, aborted: await cancelled, malformed, deep, fallback: fallback.execution
    };
  });
  assert.equal(result.execution, 'worker');
  for (const key of ['equal', 'sourceIdentity', 'mapIdentity', 'rawIdentity', 'embeddedIdentity', 'embeddedSource', 'isResult']) assert.equal(result[key], true, key);
  assert.equal(result.componentCount, 1);
  assert.equal(result.aborted, 'AbortError');
  assert.match(result.malformed, /not valid JSON/);
  assert.match(result.deep, /nesting limit/);
  assert.equal(result.fallback, 'main-thread fallback');

  // Two immediate imports: an old worker must never overwrite the newer case.
  await page.evaluate(() => {
    const input = document.querySelector('#file-input');
    for (const name of ['stale', 'latest']) {
      const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify({ name, bus: { b: { terminal_names: ['1'] } } })], `${name}.json`));
      input.files = transfer.files; input.dispatchEvent(new Event('change'));
    }
  });
  await page.locator('#import-progress').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#case-summary h2').textContent(), 'latest');
  await page.evaluate(() => {
    const input = document.querySelector('#file-input'), transfer = new DataTransfer();
    transfer.items.add(new File(['{"name":"cancelled","bus":{}}'], 'cancel.json'));
    input.files = transfer.files; input.dispatchEvent(new Event('change'));
    document.querySelector('#import-progress button').click();
  });
  assert.equal(await page.locator('#import-progress').count(), 0);
  assert.equal(await page.locator('#case-summary h2').textContent(), 'latest');

  // A whole region has bounded directory pages; every component is searchable.
  const networks = { name: 'directory', bus: Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`b${i}`, { terminal_names: ['1'] }])) };
  await page.locator('#file-input').setInputFiles({ name: 'directory.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(networks)) });
  await page.locator('#import-progress').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.network-grid article').count(), 25);
  await page.locator('#network-next').click();
  assert.match(await page.locator('.network-directory').innerText(), /showing 26–50/);
  await page.locator('#network-search').fill('b599');
  assert.equal(await page.locator('.network-grid article').count(), 1);
  await page.locator('[data-network-root="b599"]').click();
  await page.locator('#multi-detail-panel .model-sheet').waitFor();
  assert.match(await page.locator('#selection-label').textContent(), /b599/);
  await page.getByRole('button', { name: 'Apply force layout', exact: true }).click();
  assert.match(await page.locator('#view-status').textContent(), /applied to 1 buses/);
  await page.getByRole('button', { name: 'Show full overview', exact: true }).click();
  await page.locator('.network-directory').waitFor();

  await buildStatic({ outDir });
  await page.goto(pathToFileURL(resolve(outDir, 'index.html')).href);
  await page.locator('#case-summary h2').waitFor();
  assert.equal(await page.evaluate(async () => (await BMOPFImporter.read(new File(['{"bus":{}}'], 'offline.json'))).execution), 'worker');
  assert.deepEqual(errors, []);
} finally { await browser.close(); await rm(outDir, { recursive: true, force: true }); }
