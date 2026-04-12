/**
 * sw.js — QLCV Web App Service Worker
 *
 * Handles background Web Push Notifications for both providers:
 *   - FCM  (Firebase Cloud Messaging): registered via Firebase SDK getToken()
 *   - VAPID (self-hosted):             registered via pushManager.subscribe()
 *
 * Both providers deliver via the Web Push Protocol. This SW handles the
 * `push` event identically regardless of which provider sent it.
 *
 * FCM data arrives in Firebase's format:
 *   { notification: { title, body }, data: { actionUrl, notificationId, ... } }
 *
 * VAPID data from our backend (VapidPushService.cs) arrives as:
 *   { title, body, actionUrl, notificationId, icon }
 *
 * The handler is resilient to both formats.
 *
 * ── Notification click ───────────────────────────────────────────────────────
 * Clicking the OS notification focuses an existing tab (if any) or opens
 * the app at actionUrl.
 */

'use strict';

/* ── Push event ─────────────────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    // Plain text fallback (shouldn't happen in production)
    data = { title: 'QLCV Y Khoa', body: event.data.text() };
  }

  // Normalise across FCM format and VAPID format
  const title = data.title
    || data.notification?.title
    || 'QLCV Y Khoa';

  const body = data.body
    || data.notification?.body
    || data.message
    || 'Bạn có thông báo mới';

  const actionUrl = data.actionUrl
    || data.data?.actionUrl
    || '/';

  const tag = data.notificationId
    || data.id
    || data.data?.notificationId
    || `notif-${Date.now()}`;

  const icon  = data.icon  || '/icons/logo.png';
  const badge = data.badge || '/icons/logo.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { actionUrl },
      requireInteraction: false,
      // vibrate: [200, 100, 200], // uncomment for mobile vibration
    })
  );
});

/* ── Notification click ─────────────────────────────────────────────────── */

/**
 * Resolve a relative actionUrl against the SW scope so it works correctly
 * regardless of the app's base path (e.g. /BVUB-NA.WebApp/ on GitHub Pages).
 *
 * Examples (scope = https://linm-soft.github.io/BVUB-NA.WebApp/):
 *   "/tasks/abc"   → "https://linm-soft.github.io/BVUB-NA.WebApp/tasks/abc"
 *   "/"            → "https://linm-soft.github.io/BVUB-NA.WebApp/"
 *   "https://..."  → unchanged (already absolute)
 */
function resolveActionUrl(actionUrl) {
  if (!actionUrl || actionUrl === '/') return self.registration.scope;
  // Already absolute — leave as-is
  if (/^https?:\/\//.test(actionUrl)) return actionUrl;
  // Relative path: strip leading slash then append to scope
  const scope = self.registration.scope.replace(/\/$/, '');
  return scope + '/' + actionUrl.replace(/^\/+/, '');
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = resolveActionUrl(event.notification.data?.actionUrl || '/');

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing tab if one is open
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            // Navigate the focused tab to the target URL
            if ('navigate' in client) {
              client.navigate(actionUrl);
            }
            return;
          }
        }
        // No open tab — open a new one
        if (clients.openWindow) {
          return clients.openWindow(actionUrl);
        }
      })
  );
});

/* ── Service Worker lifecycle ───────────────────────────────────────────── */
self.addEventListener('install', () => {
  // Skip waiting so the new SW activates immediately (no page reload needed)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all clients so the SW controls existing pages immediately
  event.waitUntil(clients.claim());
});
