import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try {
 const page=await browser.newPage({viewport:{width:1200,height:1600}});page.setDefaultTimeout(15000);
 await page.goto('https://incant-web-production.up.railway.app/');
 await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);
 await page.getByRole('button',{name:'Open the room',exact:true}).click();
 await page.locator('.immersive-mode').waitFor();
 if(await page.locator('main').getAttribute('data-frame-layer')!=='see-through')throw new Error('Frame rollback not active');
 if(await page.getByRole('button').count()!==4)throw new Error('Unexpected visible controls');
 if(!await page.locator('.typewriter-key').isVisible() || await page.locator('.desk-latch').isVisible())throw new Error('Extra UI visible');
 await page.locator('.typewriter-key img').evaluate(async (img: HTMLImageElement) => img.decode());
 await page.screenshot({path:'../docs/evidence/immersive-mode-hosted.png'});
 await page.goto('https://incant-web-production.up.railway.app/?frame=big');await page.locator('main[data-frame=big]').waitFor();
 await page.goto('https://incant-web-production.up.railway.app/?frame=balanced');await page.locator('main[data-frame=balanced]').waitFor();
 await page.evaluate(()=>{(window as any).focusTrail=[];document.addEventListener('focusin',e=>{const t=e.target as HTMLElement;if(t.closest('.type-bubble'))(window as any).focusTrail.push(t.getAttribute('aria-label'));});});
 await page.getByRole('button',{name:'Type a spell',exact:true}).click();
 const focus=await page.evaluate(()=>(window as any).focusTrail);
 if(JSON.stringify(focus)!==JSON.stringify(['Type your spell']))throw new Error('Unexpected focus sequence: '+JSON.stringify(focus));
 await page.getByRole('button',{name:'Close typed spell'}).click();
 await page.goto('https://incant-web-production.up.railway.app/?layer=foreground');await page.locator('main[data-frame-layer=foreground]').waitFor();
 if(await page.locator('.paper-wrap').evaluate(e=>getComputedStyle(e,'::after').opacity)!=='0.9')throw new Error('Foreground opacity mismatch');
 await page.getByRole('button',{name:'New spell — turn the moon'}).click();await page.locator('.turning-moon').waitFor();
 if(await page.getByRole('dialog',{name:'Keep your spell pairs'}).isVisible())throw new Error('Unexpected save popup');
 const result={seeThroughDefault:'PASS',automaticMoon:'PASS',foregroundOpacity:'PASS',singleTypewriterFocus:'PASS',namedFrameSwitch:'PASS',date:new Date().toISOString(),mode:'immersive',visibleControls:4,frameParchmentWandAndTypewriter:'PASS'};
 await writeFile('../docs/evidence/immersive-mode-hosted.json',JSON.stringify(result,null,2)+'\n');console.log(result);
} finally {await browser.close();}
