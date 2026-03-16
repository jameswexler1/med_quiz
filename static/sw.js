const CACHE   = 'medquiz-v4';
const OFFLINE = ['/', '/prompt/', '/css/style.css', '/js/app.js', '/js/i18n.js', '/js/sync.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(OFFLINE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Never intercept Supabase API calls — let them go straight to network
  if (url.hostname.endsWith('.supabase.co')) return;

  // Never intercept livereload (dev)
  if (url.pathname.includes('livereload')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const live = fetch(e.request).then(res => {
        if (res.ok) {
          // Clone BEFORE reading body
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || live;
    })
  );
});
