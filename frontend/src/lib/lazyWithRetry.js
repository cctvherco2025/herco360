import { lazy } from 'react';

/**
 * React.lazy() que sobrevive a un deploy.
 *
 * Cuando se publica una versión nueva del front, los archivos JS quedan con
 * otro hash: una pestaña ya abierta (o un navegador que cacheó el index.html
 * viejo) pide un chunk que ya no existe y el import() se rechaza. Sin manejo,
 * eso tira todo el árbol de React y la pantalla queda en blanco hasta que el
 * usuario refresca a mano.
 *
 * Acá, ante un fallo de carga del chunk se recarga la página UNA vez (marcado
 * en sessionStorage por chunk). Si el import vuelve a fallar, se deja propagar
 * el error para que lo muestre el ErrorBoundary, sin entrar en bucle. Un
 * import exitoso limpia la marca, así que el mecanismo se auto-repara.
 */
export function lazyWithRetry(factory, key) {
  const flag = `chunk-retry:${key || 'anon'}`;
  return lazy(() =>
    factory()
      .then((mod) => {
        try { sessionStorage.removeItem(flag); } catch (e) { /* modo privado */ }
        return mod;
      })
      .catch((err) => {
        let already = false;
        try { already = !!sessionStorage.getItem(flag); } catch (e) { /* noop */ }
        if (!already) {
          try { sessionStorage.setItem(flag, '1'); } catch (e) { /* noop */ }
          window.location.reload();
          // Promesa que nunca resuelve: la página se está recargando.
          return new Promise(() => {});
        }
        try { sessionStorage.removeItem(flag); } catch (e) { /* noop */ }
        throw err;
      }),
  );
}
