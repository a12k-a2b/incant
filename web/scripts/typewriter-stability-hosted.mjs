import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const base='https://incant-web-production.up.railway.app';
const report={time:new Date().toISOString(),kind:'Synthetic isolated hosted keyboard viewport; no Android IME or provider call',checks:{}};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{
  localStorage.setItem('incant-introduction-v1','seen');
  let height=innerHeight;
  const viewport=new EventTarget();
  Object.defineProperties(viewport,{height:{get:()=>height},offsetTop:{value:0},scale:{value:1}});
  Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  window.keyboardHeight=h=>{height=h;viewport.dispatchEvent(new Event('resize'));};
 });
 for(const url of ['**/api/backup/**','**/api/owl**','**/api/cast','**/api/gemini-token']) await page.route(url,r=>r.fulfill({status:503,json:{error:'Isolated verification'}}));
 await page.goto(base);
 await expect(page.getByRole('button',{name:'Dragon settings'})).toBeEnabled();
 await page.getByRole('button',{name:'Type a spell',exact:true}).click();
 const field=page.getByRole('textbox',{name:'Type your spell',exact:true}), bubble=page.locator('.type-bubble');
 await expect(field).toBeFocused();
 const initial=await bubble.boundingBox();
 for(const h of [600,450,330,200,844]) {
  await page.evaluate(h=>window.keyboardHeight(h),h);
  await expect.poll(async()=>{const b=await bubble.boundingBox();return b.y+b.height;}).toBeLessThanOrEqual(h);
  const b=await bubble.boundingBox();
  expect(Math.abs(b.y-initial.y)).toBeLessThanOrEqual(1);
 }
 report.checks.stableTopAndVisibleHeight=true;
 await page.getByRole('button',{name:'Close typed spell'}).click();
 await page.getByRole('button',{name:'Type a spell',exact:true}).click();
 await expect(field).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(bubble).not.toBeVisible();
 report.checks.reopenFocusAndEscape=true;
 const html=await (await page.request.get(base)).text();
 const path=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 const localHtml=await readFile('dist/index.html','utf8');
 const localPath=localHtml.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 report.checks.testedJavaScript=(await (await page.request.get(base+path)).body()).equals(await readFile('dist'+localPath));
 report.status=Object.values(report.checks).every(Boolean)?'PASS':'FAIL';
 if(report.status!=='PASS')process.exitCode=1;
} catch(e) {report.status='FAIL';report.error=String(e);process.exitCode=1;}
finally {await browser.close();await writeFile('../docs/typewriter-stability-2026-09-23/hosted-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
