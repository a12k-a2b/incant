import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH});
try {
 for (const [name,width,height] of [['portrait',1184,1584],['landscape',1584,1184],['phone',390,844]]) {
  const page=await browser.newPage({viewport:{width,height}});
  await page.addInitScript(()=>localStorage.setItem('incant-introduction-v1','seen'));
  await page.route('**/api/session',r=>r.fulfill({json:{unlocked:true,imageReady:true,voiceReady:true}}));
  await page.route('**/api/backup/**',r=>r.fulfill({status:503,json:{error:'Synthetic preview'}}));
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.getByRole('button',{name:'Dragon settings'})).toBeEnabled();
  await page.evaluate(async()=>{
   await document.fonts.ready;
   const urls=[...document.querySelectorAll('*')].flatMap(n=>[...getComputedStyle(n).backgroundImage.matchAll(/url\("?([^"\)]+)"?\)/g)].map(m=>m[1]));
   await Promise.all(urls.map(src=>new Promise(resolve=>{const i=new Image();i.src=src;i.decode().then(resolve,resolve);})));
  });
  await page.screenshot({path:`../docs/wand-2026-09-22/${name}.png`});
  await page.close();
 }
} finally {await browser.close();}
