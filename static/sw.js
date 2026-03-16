const CACHE='medquiz-v3';
const OFFLINE=['/','/prompt/','/css/style.css','/js/app.js','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(OFFLINE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(cached=>{
    const live=fetch(e.request).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res}).catch(()=>cached);
    return cached||live;
  }));
});
