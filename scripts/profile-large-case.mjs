// Local-only browser probe. Usage: node scripts/profile-large-case.mjs /path/to/case.json
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const path = process.argv[2];
if (!path) throw new Error('Supply a local BMOPF case path. No case data is uploaded.');
const bytes = await readFile(path);
const raw = JSON.parse(bytes);
const root = resolve('frontend');
const server = createServer(async (req, res) => {
  try {
    const p = resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url));
    if (!p.startsWith(root + '/')) throw new Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[extname(p)] || 'application/octet-stream');
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#case-summary h2').waitFor();
  await page.evaluate(() => {
    window.profile = { longTasks: [] };
    new PerformanceObserver(list => window.profile.longTasks.push(...list.getEntries().map(e => Math.round(e.duration)))).observe({ type: 'longtask' });
    const build = BMOPFModel.buildCaseIndex;
    BMOPFModel.buildCaseIndex = doc => { const t = performance.now(); const i = build(doc); window.profile.indexMs = performance.now() - t; window.profile.assets = i.assets.length; window.profile.warnings = i.warnings; return i; };
  });
  const start = performance.now();
  await page.locator('#file-input').setInputFiles(resolve(path));
  await page.waitForFunction(name => document.querySelector('#case-summary h2')?.textContent === name, raw.name, { timeout: 30000 });
  const loadMs = performance.now() - start;
  await page.locator('#large-case-focused').click();
  const searchStart = performance.now();
  await page.locator('#search').fill('bus');
  await page.locator('#search-next').waitFor();
  assert.equal(await page.locator('#inventory-list [data-id]').count(), 100);
  const searchMs = performance.now() - searchStart;
  await page.locator('#search-next').click();
  assert.match(await page.locator('.search-meta').innerText(), /Showing 101–200/);
  const firstBus = Object.keys(raw.bus)[0];
  await page.locator('#search').fill(firstBus);
  const selectionStart = performance.now();
  await page.locator('#search').press('Enter');
  await page.locator('#multi-detail-panel .model-sheet').waitFor();
  const selectionMs = performance.now() - selectionStart;
  await page.locator('[data-view="multi"]').click();
  await page.locator('#canvas .model-sheet').waitFor();
  const line = Object.keys(raw.line)[0];
  await page.locator('#search').fill(line);
  await page.locator('#search').press('Enter');
  await page.waitForFunction(id => document.querySelector('#canvas .model-sheet')?.textContent.includes(id), line);
  await page.screenshot({ path: '/tmp/bmopf-large-case.png', fullPage: false });
  const profile = await page.evaluate(() => ({ ...window.profile, domNodes: document.querySelectorAll('*').length, svgNodes: document.querySelectorAll('svg *').length }));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ bytes: bytes.length, loadMs, searchMs, selectionMs, ...profile, errors }, null, 2));
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
