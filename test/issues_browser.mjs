import { assertNoHorizontalOverflow } from './responsive_assertions.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve('frontend/index.html')).href);await page.locator('#case-summary h2').waitFor();
 const bus=Object.fromEntries(Array.from({length:60},(_,i)=>['b'+i,{terminal_names:['p'],v_min:[220],v_max:[240],...(i ? {longitude:-2.6,latitude:53.48} : {})}]));
 const raw={name:'issues',bus,line:{l:{bus_from:'b1',bus_to:'b2',terminal_map_from:['p'],terminal_map_to:['p'],i_max:[100]}}};
 async function upload(selector,name,data){await page.locator(selector).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#import-progress').waitFor({state:'detached'});}
 await upload('#file-input','case.json',raw);await page.locator('[data-view="geo"]').click();
 await upload('#result-input','results.json',{objective:0,bus:Object.fromEntries(Object.keys(bus).map(id=>[id,{p:{vm:200}}])),line:{l:{p:{cm_fr:150,cm_to:0}}}});
 assert.match(await page.locator('#region-issue-summary').innerText(),/Violated checks: 61/);
 await page.locator('[data-summary-category="violation"]').click();
 assert.equal(await page.locator('[data-issue-entry]').count(),50);
 assert.match(await page.locator('[data-issue-entry]').first().innerText(),/line l/);
 await page.locator('[data-issue-next]').click();assert.equal(await page.locator('[data-issue-entry]').count(),11);
 await page.locator('[data-issue-prev]').click();
 await page.locator('[data-issue-entry]').filter({hasText:'bus b0 ·'}).click();
 assert.match(await page.locator('#region-issue-location').innerText(),/no coordinates/);
 assert.equal(await page.locator('#region-voltage-terminal').inputValue(),JSON.stringify('p'));
 await page.locator('[data-summary-category="violation"]').click();
 await page.locator('[data-issue-entry]').filter({hasText:'bus b1 ·'}).click();
 assert.match(await page.locator('#region-issue-location').innerText(),/network fitted/);
 await page.setViewportSize({width:390,height:844});await assertNoHorizontalOverflow(page);
 await page.addStyleTag({content:'.view-tabs { font-size: 18px; }'});
 await assertNoHorizontalOverflow(page);
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
