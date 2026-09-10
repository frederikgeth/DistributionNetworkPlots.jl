import { chromium } from 'playwright';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Supply case paths or a directory of extracted JSON cases.');
const files=[];
for(const p of paths) { if(p.endsWith('.json')) files.push(resolve(p)); else for(const name of await readdir(p)) if(name.endsWith('.json')) files.push(resolve(p,name)); }
const b=await chromium.launch({headless:true});
try {
 const page=await b.newPage({viewport:{width:1440,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve('frontend/index.html')).href);
 await page.locator('#case-summary h2').waitFor();
 const reports=[];
 for(const file of files){
  const raw=JSON.parse(await readFile(file,'utf8')),start=performance.now();
  await page.locator('#file-input').setInputFiles(file);
  await page.locator('#import-progress').waitFor({state:'detached'});
  await page.locator('[data-view="geo"]').click();
  await page.locator('#region-evidence').waitFor();
  const stats=await page.locator('#region-map').evaluate(el=>({nodes:el.querySelectorAll('*').length,circles:[...el.querySelectorAll('circle')].map(c=>[+c.getAttribute('cx'),+c.getAttribute('cy')])}));
  assert.ok(stats.nodes<3000);assert.ok(stats.circles.length>0);
  assert.ok(stats.circles.every(p=>p.every(Number.isFinite)));
  assert.ok(Math.max(...stats.circles.map(p=>p[0]))-Math.min(...stats.circles.map(p=>p[0]))>30);
  if(files.indexOf(file)===0) await page.screenshot({path:'/tmp/regional-springfield.png'});
  if(file.includes('network_5__Feeder_3'))await page.screenshot({path:'/tmp/regional-enwl.png'});
  if(await page.locator('[data-region-cell]').count()) {
   await page.locator('[data-region-cell]').first().click();
   assert.ok(await page.locator('[data-region-bus]').count()>0);
   await page.locator('[data-region-bus]').first().click();
   await page.locator('#region-network').click();
   await page.locator('#region-reset').click();
  }
  reports.push({case:raw.name,buses:Object.keys(raw.bus).length,nodes:stats.nodes,ms:Math.round(performance.now()-start)});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:reports.length,reports,errors},null,2));
}finally{await b.close();}
