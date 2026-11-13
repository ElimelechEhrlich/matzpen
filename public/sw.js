// Shows phone notifications and opens the app when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'מצפן', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'מצפן', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, requireInteraction: d.tag?.startsWith('otp'),
    dir: 'rtl', lang: 'he', icon: '/icon.svg', badge: '/icon.svg', data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) { await open.focus(); open.postMessage({ type: 'open', url }); return; }
    await self.clients.openWindow(url);
  })());
});
