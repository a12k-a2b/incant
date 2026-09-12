import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
const results=[];
try{
 const page=await browser.newPage();await page.addInitScript(()=>{localStorage.setItem('incant-introduction-v1','seen');Object.defineProperty(navigator,'share',{value:async()=>{window.testShared=true}});Object.defineProperty(navigator,'canShare',{value:()=>true});});
 await page.route('**/api/owl',r=>r.fulfill({status:503,json:{error:'Synthetic cloud outage'}}));await page.goto('http://127.0.0.1:5173');
 const b=await page.locator('canvas').boundingBox();await page.mouse.move(b.x+b.width*.4,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.6,b.y+b.height*.4);await page.mouse.up();const image=await page.locator('canvas').evaluate(c=>c.toDataURL());await page.route('**/api/cast',r=>r.fulfill({json:{ok:true,imageBase64:image.split(',')[1]}}));await page.getByRole('button',{name:'Type a spell',exact:true}).click();await page.getByLabel('Type your spell',{exact:true}).fill('Synthetic keeper cottage');await page.getByRole('button',{name:'Cast typed spell'}).click();await page.locator('.manifestation.image-ready').waitFor();await page.waitForTimeout(1000);await page.getByRole('button',{name:'Owl post',exact:true}).click();await page.waitForTimeout(250);
 results.push({id:'K1',check:'Native share with locally available images while owl cloud returns 503',shared:await page.evaluate(()=>!!window.testShared),tray:await page.getByRole('dialog',{name:'Owl post'}).innerText(),expected:'Local native sharing remains available independently of cloud post links'});
 await page.getByRole('button',{name:'Close owl post'}).click();await page.evaluate(()=>document.querySelector('.voice-wand').click());await page.waitForTimeout(50);
 results.push({id:'K2',check:'Semantic click activation of wand',phase:await page.locator('main').getAttribute('class'),expected:'Accessible click should start talking like a tap'});
 const race=await page.evaluate(async()=>{
  const {RealtimeVoice}=await import('/src/lib/realtime-voice.ts');let didRemote=false;
  window.Audio=class{play(){return Promise.resolve()}pause(){}};
  const track={stop(){this.readyState='ended'},readyState:'live'};
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getTracks:()=>[track]})});
  window.RTCPeerConnection=class{addTrack(){}createDataChannel(){return{readyState:'connecting',close(){}}}createOffer(){return Promise.resolve({sdp:'synthetic'})}setLocalDescription(){return Promise.resolve()}setRemoteDescription(){didRemote=true;return Promise.resolve()}close(){}};
  window.fetch=async(url)=>url==='/api/realtime-token'?new Response(JSON.stringify({value:'synthetic'})):new Response('synthetic SDP');
  let settled=false;const voice=new RealtimeVoice(()=>{},()=>{},()=>{});voice.connect('',null).then(()=>settled=true,()=>settled=true);
  for(let i=0;i<50&&!didRemote;i++)await new Promise(r=>setTimeout(r,5));voice.close();await new Promise(r=>setTimeout(r,100));return{didRemote,settled,trackState:track.readyState};
 });results.push({id:'K3',check:'Cancellation while data channel is connecting',...race,expected:'connect promise settles on cancellation and tracks stop'});
 await writeFile('../docs/adversarial-2026-09-12/keeper-baseline.json',JSON.stringify(results,null,2));console.log(results);
}finally{await browser.close()}
