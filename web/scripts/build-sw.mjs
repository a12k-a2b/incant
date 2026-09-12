import { readdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets=(await readdir('dist/assets')).map(f=>'/assets/'+f);
const cache='incant-'+createHash('sha256').update(assets.join()).digest('hex').slice(0,12);
await writeFile('dist/sw.js',`const CACHE=${JSON.stringify(cache)},FILES=${JSON.stringify(['/',...assets,'/manifest.webmanifest','/icon-192.png','/icon-512.png','/wizard-frame-v3.png','/wizard-frame-v4.png','/wizard-frame-landscape.png','/wizard-frame-landscape-v2.png','/wizard-typewriter.png','/fonts/IMFellEnglish.ttf'])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('incant-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;if(r.mode==='navigate'){event.respondWith(fetch(r).catch(()=>caches.match('/')));return;}event.respondWith(caches.match(r).then(hit=>hit||fetch(r)));});`);
