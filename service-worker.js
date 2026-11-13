const V='goner-pack-009',SHELL=['./','index.html','style.css','app.js','parser.js','core.js','db.js','imgproc.js','pipeline.js','ocr.js','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url),same=u.origin===location.origin,cdn=/(^|\.)(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|tessdata\.projectnaptha\.com)$/.test(u.host);if(!same&&!cdn)return;
 const keep=x=>{if(x.ok||x.type==='opaque'){const c=x.clone();caches.open(V).then(h=>h.put(r,c))}return x};
 /* свои файлы: сеть → кэш (обновления подтягиваются при наличии интернета); библиотеки CDN: кэш → сеть */
 e.respondWith(same?fetch(r).then(keep).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))):caches.match(r).then(m=>m||fetch(r).then(keep)))});
