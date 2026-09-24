import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try{
 const page=await browser.newPage({viewport:{width:1184,height:1584}});let paidCalls=0;page.on('request',r=>{if(/\/api\/(cast|gemini-token)$/.test(r.url()))paidCalls++;});
 await page.goto('https://anjan.app/incant');await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);await page.getByRole('button',{name:'Open the room',exact:true}).click();
 const guide=page.getByRole('dialog',{name:'A little guide to Sketch Magic'});await expect(guide).toBeVisible();
 await page.screenshot({path:'../docs/evidence/introduction-hosted.png'});
 for(let step=0;step<3;step++){await guide.getByRole('button',{name:'Next'}).click();await page.screenshot({path:`../docs/evidence/introduction-hosted-step-${step+2}.png`});}
 await guide.getByRole('button',{name:'Let’s make magic'}).click();await page.reload();await expect(page.getByRole('button',{name:'Show introduction'})).toBeVisible();await expect(guide).toHaveCount(0);
 await page.getByRole('button',{name:'Show introduction'}).click();await expect(guide).toBeVisible();await guide.getByRole('button',{name:'Skip',exact:true}).click();await expect(guide).toHaveCount(0);expect(paidCalls).toBe(0);
 const result={time:new Date().toISOString(),firstVisit:'PASS',fourSteps:'PASS',completionPersists:'PASS',helpReplay:'PASS',skip:'PASS',providerRequests:paidCalls};await writeFile('../docs/evidence/onboarding-hosted.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();}
