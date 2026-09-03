// Registers the push-only service worker (public/sw.js -> served at /sw.js).
// No offline caching: this worker only exists to receive Web Push messages.

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(window.location.hostname)
);

export function registerPushServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Push needs a secure context; browsers treat localhost as secure.
  if (window.location.protocol !== 'https:' && !isLocalhost) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('[sw] registration failed:', err));
  });
}
