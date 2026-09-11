import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {GeminiLiveTranscribe} from '../src/lib/gemini-live';
(globalThis as any).window=globalThis;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
const receipt:any={time:new Date().toISOString(),fixture:'synthetic cottage and speech',device:'not connected'};
try {
 const page=await browser.newPage();
 await page.goto('https://incant-web-production.up.railway.app/');
 await page.getByLabel('Room passphrase').fill((await readFile('.env.access','utf8')).trim().split('=')[1]);
 await page.getByRole('button',{name:'Open the room',exact:true}).click();
 await page.locator('canvas').waitFor();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1024;c.height=1536;const x=c.getContext('2d')!;x.scale(2,2);x.fillStyle='white';x.fillRect(0,0,512,768);x.strokeStyle='black';x.lineWidth=5;x.beginPath();x.moveTo(100,380);x.lineTo(256,180);x.lineTo(412,380);x.closePath();x.rect(130,380,250,230);x.stroke();return c.toDataURL();});
 await Promise.all([
 (async()=>{const start=Date.now();const r=await page.request.post('https://incant-web-production.up.railway.app/api/cast',{data:{sketchPngBase64:png,incantation:'A little wizard cottage. Preserve the triangular roof and rectangular house from the sketch.',quality:'medium',livePaper:true},timeout:190000});const b=await r.json();receipt.image={status:r.status(),ok:b.ok,elapsedMs:Date.now()-start,error:b.error};if(b.ok)await writeFile('../docs/evidence/cast-service-check-image.png',Buffer.from(b.imageBase64,'base64'));})(),
 (async()=>{const r=await page.request.post('https://incant-web-production.up.railway.app/api/gemini-token',{data:{}});const b=await r.json();if(!b.token){receipt.voice={status:r.status(),ok:false,error:b.error};return;}const live=new GeminiLiveTranscribe();try{await live.connect(b.token);live.startTurn();const pcm=await readFile('/private/tmp/incant-voice.pcm');for(let i=0;i<pcm.length;i+=3200){const chunk=pcm.subarray(i,i+3200);live.sendPcm16(new Int16Array(chunk.buffer,chunk.byteOffset,Math.floor(chunk.length/2)));await new Promise(r=>setTimeout(r,100));}const final=await live.endTurn();receipt.voice={ok:!!final.trim(),transcriptCharacters:final.length};}finally{live.disconnect();}})()
 ]);
} finally {await browser.close();await writeFile('../docs/evidence/cast-service-check.json',JSON.stringify(receipt,null,2)+'\n');console.log(receipt);}
