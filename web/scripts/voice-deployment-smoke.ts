import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true,executablePath:'/Users/anjan/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.goto('https://incant-web-production.up.railway.app/');
  await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);
  await page.getByRole('button',{name:'Open the room',exact:true}).click();
  const wand = page.getByRole('button',{name:/Tap or hold to speak/});
  await wand.waitFor();
  const suppressed = await wand.evaluate(el => !el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  const unselectable = await page.locator('.cast-button').evaluate(el => getComputedStyle(el).userSelect === 'none');
  if (!suppressed || !unselectable) throw new Error('Hosted gesture protections missing');
  const result = {date:new Date().toISOString(),deployment:'24f25168-0a02-4b6e-a2ef-59d2a4ebd98b',newVoiceControl:'PASS',contextMenuSuppression:'PASS',buttonTextSelectionDisabled:'PASS',physicalVoiceRetest:'BLOCKED: awaiting owner retry on updated page'};
  await writeFile('../docs/evidence/voice-deployment.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
} finally {await browser.close();}
