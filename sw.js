const APP_ORIGIN = self.location.origin;

// ── Push received ──────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Dog Feed Tracker', {
      body:     data.body  ?? '',
      icon:     `${APP_ORIGIN}/icon-192.png`,
      badge:    `${APP_ORIGIN}/icon-72.png`,
      data:     { url: data.url ?? APP_ORIGIN },
      tag:      'feed',
      renotify: true,
      vibrate:  [150, 80, 150],
    })
  );
});

// ── Notification tapped ────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url ?? APP_ORIGIN;
  const tab    = new URL(target, APP_ORIGIN).hash.slice(1) || 'feed';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).origin === new URL(target).origin && 'focus' in c) {
          // App already open — focus it and tell it which tab to show
          c.postMessage({ type: 'SWITCH_TAB', tab });
          return c.focus();
        }
      }
      // App not open — open it with the hash so it can read the tab on load
      return clients.openWindow(target);
    })
  );
});
