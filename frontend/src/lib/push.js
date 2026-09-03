// Web Push (VAPID) client helpers for HERCO360.
// Pairs with public/sw.js (delivery) and backend routes_push.py (subscription store).

import api from '@/lib/api';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// 'unsupported' | 'denied' | 'granted-off' | 'granted-on' | 'default'
export async function getPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (Notification.permission === 'granted') return sub ? 'granted-on' : 'granted-off';
  return 'default';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readyRegistration() {
  // Ensure the SW registered in index.js is active before subscribing.
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Este navegador no soporta notificaciones push');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const err = new Error('Permiso de notificaciones no concedido');
    err.code = permission; // 'denied' | 'default'
    throw err;
  }

  const { data } = await api.get('/push/vapid-public-key');
  const reg = await readyRegistration();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key),
    });
  }

  const json = sub.toJSON();
  await api.post('/push/subscribe', {
    endpoint: sub.endpoint,
    keys: json.keys,
    user_agent: navigator.userAgent,
  });
  return 'granted-on';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    try {
      await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
    } catch (e) {
      /* best effort — still unsubscribe locally */
    }
    await sub.unsubscribe();
  }
  return 'granted-off';
}
