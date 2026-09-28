// Diagnóstico en el dispositivo: graba durante unos segundos qué pasa con cada
// toque (qué elemento lo recibe de verdad, si alguien le hace preventDefault,
// si hay algo encima del campo, estilos que bloquean) y el estado del entorno
// (navegador, versión de la app cargada, service worker). Se manda a
// /api/diagnostico para revisarlo desde la base de datos.
//
// Pensado para fallas que solo pasan en ciertos celulares, como "no abre el
// selector de fecha/hora", que no se reproducen desde una computadora.
import api from '@/lib/api';

const EVENTOS = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout', 'input', 'change'];
const MAX_EVENTOS = 250;

// "input#id.clase1.clase2[type=time]" — lo justo para reconocer el elemento
function describir(el) {
  if (!el || !el.tagName) return String(el);
  let s = el.tagName.toLowerCase();
  if (el.id) s += `#${el.id}`;
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
  if (cls) s += `.${cls}`;
  if (el.getAttribute) {
    ['type', 'data-testid', 'role', 'data-diag'].forEach((a) => { const v = el.getAttribute(a); if (v) s += `[${a}=${v}]`; });
  }
  return s.slice(0, 180);
}

function estilosBloqueo(el) {
  try {
    const cs = getComputedStyle(el);
    return {
      pointerEvents: cs.pointerEvents, userSelect: cs.userSelect || cs.webkitUserSelect,
      touchAction: cs.touchAction, visibility: cs.visibility, display: cs.display, opacity: cs.opacity,
    };
  } catch (e) { return null; }
}

// Estado de un campo de fecha/hora: ¿está habilitado?, ¿qué hay ENCIMA de su
// centro? (si no es el propio campo, algo lo tapa y se come el toque)
function estadoCampo(el) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const encima = document.elementFromPoint(cx, cy);
  let ancestroDeshabilitado = null;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.disabled || p.getAttribute?.('aria-hidden') === 'true' || p.inert) { ancestroDeshabilitado = describir(p); break; }
  }
  return {
    campo: describir(el), value: el.value, disabled: el.disabled, readOnly: el.readOnly,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    visibleEnPantalla: r.bottom > 0 && r.top < window.innerHeight && r.width > 0,
    elementoEncimaDelCentro: describir(encima),
    tapado: encima !== el && !el.contains(encima),
    ancestroDeshabilitado,
    estilos: estilosBloqueo(el),
    showPicker: typeof el.showPicker === 'function',
  };
}

function entorno() {
  const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.src.split('/').pop()).filter((n) => /main|chunk/.test(n)).slice(0, 5);
  return {
    userAgent: navigator.userAgent,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
    visualViewport: window.visualViewport ? { w: Math.round(window.visualViewport.width), h: Math.round(window.visualViewport.height), scale: window.visualViewport.scale } : null,
    pwaInstalada: window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
    url: window.location.pathname + window.location.search,
    scriptsCargados: scripts,
    serviceWorker: navigator.serviceWorker?.controller?.scriptURL || null,
    body: { style: document.body.getAttribute('style') || '', attrs: [...document.body.attributes].map((a) => `${a.name}=${a.value}`.slice(0, 80)), estilos: estilosBloqueo(document.body) },
    html: { style: document.documentElement.getAttribute('style') || '', estilos: estilosBloqueo(document.documentElement) },
    hora: new Date().toString(),
  };
}

/**
 * Empieza a grabar. Devuelve { detener } — detener() junta todo, lo envía y
 * resuelve con el código del reporte (o lanza si no se pudo enviar).
 * `campos` = función que devuelve los inputs a revisar (fecha/hora).
 */
export function iniciarDiagnostico({ contexto, campos }) {
  const t0 = performance.now();
  const eventos = [];
  const errores = [];

  const registrar = (fase) => (e) => {
    if (eventos.length >= MAX_EVENTOS) return;
    const pt = e.touches?.[0] || e.changedTouches?.[0] || e;
    const x = pt?.clientX, y = pt?.clientY;
    eventos.push({
      t: Math.round(performance.now() - t0), fase, tipo: e.type,
      target: describir(e.target),
      enPunto: Number.isFinite(x) ? describir(document.elementFromPoint(x, y)) : null,
      x: Number.isFinite(x) ? Math.round(x) : null, y: Number.isFinite(y) ? Math.round(y) : null,
      // en la fase "burbuja" en window: ¿alguien canceló el comportamiento por defecto?
      defaultPrevented: e.defaultPrevented, cancelable: e.cancelable,
      activo: describir(document.activeElement),
    });
  };
  const cap = registrar('captura');
  const bur = registrar('burbuja');
  EVENTOS.forEach((t) => {
    document.addEventListener(t, cap, { capture: true, passive: true });
    window.addEventListener(t, bur, { capture: false, passive: true });
  });
  const onErr = (e) => errores.push(String(e.message || e.reason || e).slice(0, 300));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);

  const antes = { entorno: entorno(), campos: (campos?.() || []).map(estadoCampo) };

  const detener = async () => {
    EVENTOS.forEach((t) => {
      document.removeEventListener(t, cap, { capture: true });
      window.removeEventListener(t, bur, { capture: false });
    });
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onErr);
    const reporte = {
      contexto, duracionMs: Math.round(performance.now() - t0),
      antes, despues: { campos: (campos?.() || []).map(estadoCampo), body: entorno().body },
      eventos, errores,
    };
    const { data } = await api.post('/diagnostico', reporte);
    return data.codigo;
  };
  return { detener };
}
