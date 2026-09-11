import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true,executablePath:'/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try {
 const page=await browser.newPage({viewport:{width:1200,height:1600}});page.setDefaultTimeout(15000);
 await page.goto('https://incant-web-production.up.railway.app/');
 await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);
 await page.getByRole('button',{name:'Open the room',exact:true}).click();
 await page.locator('.immersive-room').waitFor();
 console.log(await page.locator('.paper-wrap').evaluate(el => {const a=getComputedStyle(el),b=getComputedStyle(el,'::after');return {rect:el.getBoundingClientRect().toJSON(),base:a.background,overlay:b.background,overlayWidth:b.width,overlayHeight:b.height};}));
 await page.locator('.typewriter-key img').evaluate(async (img:HTMLImageElement)=>{await img.decode();});
 if(await page.locator('.voice-wand').innerText()) throw new Error('Voice label is still visible');
 await page.evaluate(async () => { const frame=new Image();frame.src='/wizard-frame-v3.png';await frame.decode(); });
 await page.screenshot({path:'../docs/evidence/immersive-hosted.png'});
 await page.getByRole('button',{name:'Type a spell',exact:true}).click();
 if(!await page.getByRole('textbox',{name:'Type your spell',exact:true}).evaluate(el=>el===document.activeElement)) throw new Error('Typewriter did not focus field');
 await page.screenshot({path:'../docs/evidence/immersive-hosted-bubble.png'});
 const result={date:new Date().toISOString(),deployment:'739e3765-d65a-44d6-95be-0cdddf8f244e',immersivePage:'PASS',typewriterAsset:'PASS',typedBubbleFocus:'PASS',physicalKeyboardAndAnimations:'BLOCKED: needs DC-1 trial of updated interface'};
 await writeFile('../docs/evidence/immersive-deployment.json',JSON.stringify(result,null,2)+'\n');console.log(result);
} finally {await browser.close();}
