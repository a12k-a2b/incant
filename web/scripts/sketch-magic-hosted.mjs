import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base='https://incant-web-production.up.railway.app';
const report={time:new Date().toISOString(),scope:'Isolated hosted browser; cloud, owl and provider writes blocked',checks:{}};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
try {
 const page=await browser.newPage({viewport:{width:1184,height:1584}});
 for(const url of ['**/api/backup/**','**/api/owl**','**/api/cast','**/api/gemini-token']) await page.route(url,r=>r.fulfill({status:503,json:{error:'Isolated branding verification'}}));
 await page.goto(base+'/?view=spellbook');
 await expect(page).toHaveTitle(/Sketch Magic/);
 await expect(page.getByRole('dialog',{name:'A little guide to Sketch Magic'})).toBeVisible();
 report.checks.titleAndOnboarding=true;
 const manifest=await (await page.request.get(base+'/manifest.webmanifest')).json();
 report.checks.manifestName=manifest.name.includes('Sketch Magic')&&manifest.short_name==='Sketch Magic';
 const localManifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
 report.checks.manifestIdentity=manifest.id===localManifest.id&&manifest.start_url===localManifest.start_url;
 const html=await(await page.request.get(base)).text();
 const localHtml=await readFile('dist/index.html','utf8');
 const asset=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 const localAsset=localHtml.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
 const bytes=await(await page.request.get(base+asset)).body();
 report.checks.testedJavaScript=bytes.equals(await readFile('dist'+localAsset));
 report.javascriptSha256=createHash('sha256').update(bytes).digest('hex');
 report.status=Object.values(report.checks).every(Boolean)?'PASS':'FAIL';
 if(report.status!=='PASS')process.exitCode=1;
} catch(e){report.status='FAIL';report.error=String(e);process.exitCode=1;}
finally{await browser.close();await writeFile('../docs/evidence/sketch-magic-hosted.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
