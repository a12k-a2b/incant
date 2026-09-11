import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
try {
 const page=await browser.newPage({viewport:{width:1184,height:1584}});
 await page.goto('http://127.0.0.1:5173'); await page.locator('canvas').waitFor();
 const variants=[{name:'a-rich-frame',css:'.immersive-room .paper-wrap {background-image:url(/wizard-frame-v3.png)} .immersive-room .paper {inset:10% 14%}'},{name:'b-balanced',css:''},{name:'c-open',css:'.immersive-room .paper-wrap {background-size:108% 106%} .immersive-room .paper {inset:5% 6% 8%}'}];
 const measurements=[];
 for(const v of variants){const style=await page.addStyleTag({content:v.css||"/* default */"});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);await page.screenshot({path:`../docs/evidence/parchment-${v.name}.png`});measurements.push({variant:v.name,canvas:await page.locator('canvas').boundingBox()});await style.evaluate(e=>e.remove());}
 await writeFile('../docs/evidence/parchment-options.json',JSON.stringify({viewport:{width:1184,height:1584},selected:'b-balanced',measurements},null,2));
 await page.setViewportSize({width:1584,height:1184});await page.waitForTimeout(500);await page.screenshot({path:'../docs/evidence/parchment-balanced-landscape.png'});await page.setViewportSize({width:1184,height:1584});
 await page.getByRole('button',{name:'New spell — turn the moon'}).click();await page.screenshot({path:'../docs/evidence/moon-folder-setup.png'});
} finally {await browser.close();}
