/* 먼지 서비스 워커: 앱 셸 캐시 + 푸시 알림 */
const CACHE = 'meonji-v1';
const SHELL = ['/', '/app-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API 는 항상 네트워크 (오프라인 대응은 앱 내부 캐시가 담당)
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // 폰트 CDN: 캐시 우선 + 백그라운드 갱신
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(hit => {
          const fetched = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || fetched;
        })
      )
    );
    return;
  }
  if (url.origin !== location.origin) return;

  // 페이지 이동: 네트워크 우선, 실패하면 캐시된 앱
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return res; })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // 그 외 정적 파일: 캐시 우선
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: '먼지', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title || '먼지', {
      body: data.body || '',
      icon: '/app-icon.png',
      badge: '/app-icon.png',
      tag: data.tag || 'meonji-daily',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
