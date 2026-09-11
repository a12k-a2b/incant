import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try {
 const page=await browser.newPage({viewport:{width:1200,height:1600}});page.setDefaultTimeout(15000);
 await page.goto('https://incant-web-production.up.railway.app/');
 await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);
 await page.getByRole('button',{name:'Open the room',exact:true}).click();
 await page.locator('.immersive-mode').waitFor();
 if(await page.getByRole('button').count()!==1)throw new Error('Unexpected visible controls');
 if(await page.locator('.typewriter-key').isVisible() || await page.locator('.desk-latch').isVisible())throw new Error('Extra UI visible');
 await page.screenshot({path:'../docs/evidence/immersive-mode-hosted.png'});
 const result={date:new Date().toISOString(),mode:'immersive',visibleControls:1,frameParchmentWandOnly:'PASS'};
 await writeFile('../docs/evidence/immersive-mode-hosted.json',JSON.stringify(result,null,2)+'\n');console.log(result);
} finally {await browser.close();}
