import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH});
try {
  const page = await browser.newPage({viewport:{width:1184,height:1584}});
  let providerRequests=0;
  await page.addInitScript(() => {
    localStorage.setItem('incant-introduction-v1','seen');
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>new Promise(()=>{})});
  });
  await page.route('**/api/backup/**',r=>r.fulfill({status:503,json:{ok:false}}));
  await page.route(/\/api\/(cast|gemini-token)$/,r=>{providerRequests++;return r.fulfill({status:503,json:{ok:false}})});
  await page.goto('https://incant-web-production.up.railway.app/');
  await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);
  await page.getByRole('button',{name:'Open the room',exact:true}).click();
  const canvas=page.locator('canvas'); await expect(canvas).toBeVisible();
  const prevented=await canvas.evaluate(el=>!el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  expect(prevented).toBe(true);
  const box=(await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.45);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.55);await page.mouse.up();
  const wand=page.locator('.voice-wand');await wand.hover();await page.mouse.down();
  await expect(page.locator('main')).toHaveClass(/phase-connecting/);
  await expect(page.locator('.wand-feedback')).toHaveCSS('opacity','1');
  await expect(page.locator('#wand-status')).toHaveText('Waking the wand…');
  await expect(page.locator('#wand-status')).toHaveCSS('clip-path','none');
  await expect(page.locator('.wand-wave-one')).toHaveCSS('animation-name','wand-press-ripple');
  await page.screenshot({path:'../docs/evidence/wand-feedback-hosted.png'});
  expect(providerRequests).toBe(0);
  const result={time:new Date().toISOString(),deployment:process.env.INCANT_DEPLOYMENT,contextMenuGuard:'PASS',immediatePressFeedback:'PASS',providerRequests,archive:'mocked; no production archive writes',physicalDevice:'BLOCKED: not connected'};
  await writeFile('../docs/evidence/native-input-hosted.json',JSON.stringify(result,null,2)+'\n');console.log(result);
} finally {await browser.close();}
