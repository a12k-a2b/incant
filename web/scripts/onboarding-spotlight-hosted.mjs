import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base = 'https://incant-web-production.up.railway.app';
const report = {time:new Date().toISOString(),kind:'Isolated browser; cloud and owl requests intercepted; no real artwork or provider calls',checks:{}};
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
try {
 const page=await browser.newPage({viewport:{width:1184,height:1584}});
 for(const url of ['**/api/backup/**','**/api/owl**','**/api/cast','**/api/gemini-token']) await page.route(url,r=>r.fulfill({status:503,json:{error:'Isolated onboarding verification'}}));
 await page.goto(base+'/?view=spellbook');
 const guide=page.getByRole('dialog',{name:'A little guide to Incant'});
 await expect(guide).toBeVisible();
 await expect(page.locator('.desk-drawer')).not.toBeVisible();
 await expect(page).not.toHaveURL(/view=spellbook/);
 report.checks.legacyLinkOpensGuide=true;
 await guide.getByRole('button',{name:'Next'}).click();
 await expect(guide.locator('[data-tour-target=".wand-rest"]')).toHaveCount(1);
 await guide.getByRole('button',{name:'Next'}).click();
 await expect(guide.locator('[data-tour-target=".typewriter-key"]')).toHaveCount(1);
 await expect(guide.locator('.introduction-page')).toHaveCSS('opacity','1');
 await page.evaluate(async()=>{
  await document.fonts.ready;
  await Promise.all(['/wizard-frame-v4.png','/wizard-typewriter.png'].map(src=>new Promise(resolve=>{const i=new Image();i.src=src;i.decode().then(resolve,resolve)})));
 });
 await page.screenshot({path:'../docs/onboarding-2026-09-22/hosted-typewriter.png'});
 await guide.getByRole('button',{name:'Next'}).click();
 await expect(guide.locator('[data-tour-target=".moon-key"]')).toHaveCount(1);
 report.checks.actualObjectsHighlighted=true;
 await guide.getByRole('button',{name:'Skip',exact:true}).click();
 await page.reload();
 await expect(page.getByRole('button',{name:'Show introduction'})).toBeVisible();
 await expect(guide).toHaveCount(0);
 await expect(page.locator('.desk-drawer')).not.toBeVisible();
 report.checks.dismissalPersists=true;
 const html=await (await page.request.get(base)).text();
 const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 const localHtml=await readFile('dist/index.html','utf8');
 const localAsset=localHtml.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 const live=await (await page.request.get(base+asset)).body();
 report.checks.testedJavaScript=live.equals(await readFile('dist'+localAsset));
 report.javascriptSha256=createHash('sha256').update(live).digest('hex');
 report.status=Object.values(report.checks).every(Boolean)?'PASS':'FAIL';
 if(report.status!=='PASS')process.exitCode=1;
} catch(e) {report.status='FAIL';report.error=String(e);process.exitCode=1;}
finally {await browser.close();await writeFile('../docs/onboarding-2026-09-22/hosted-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
