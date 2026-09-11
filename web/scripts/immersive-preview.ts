import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try {
 const page=await browser.newPage({viewport:{width:1200,height:1600}});
 const result=(await readFile('../docs/prompt-tournament/screen/P04-cottage-1/result.png')).toString('base64');
 await page.route('**/api/cast',async r=>{await new Promise(resolve=>setTimeout(resolve,2000));await r.fulfill({json:{ok:true,imageBase64:result,mime:'image/png'}});});
 await page.goto('http://127.0.0.1:5173');
 const box=(await page.locator('canvas').boundingBox())!;
 await page.mouse.move(box.x+box.width*.3,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.3);await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6);await page.mouse.up();
 await page.getByRole('button',{name:'Open desk tools',exact:true}).click();
 await page.getByLabel('THE INCANTATION',{exact:true}).fill('Synthetic animation preview using a previously generated cottage');
 await page.getByRole('button',{name:'Cast spell',exact:true}).click();
 await page.waitForTimeout(1200);
 await page.screenshot({path:'../docs/evidence/immersive-fog.png'});
 await page.locator('.image-ready').waitFor();await page.waitForTimeout(900);
 await page.screenshot({path:'../docs/evidence/immersive-reveal.png'});
 await page.waitForTimeout(2000);
 await page.screenshot({path:'../docs/evidence/immersive-result.png'});
 await page.setViewportSize({width:1600,height:1200});
 await page.screenshot({path:'../docs/evidence/immersive-result-landscape.png'});
} finally {await browser.close();}
