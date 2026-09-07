import React from 'react';
import { Logo } from '@/components/Logo';

const RELOAD_TS = 'app-error-reload-ts';
const RELOAD_COOLDOWN_MS = 15000;

// Un import() de chunk que falla (deploy nuevo, red intermitente, service worker
// viejo) tira un error con alguno de estos textos según el navegador.
function isChunkLoadError(error) {
  const msg = `${(error && (error.message || error.name)) || ''}`;
  return (
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /is not a valid JavaScript MIME type/i.test(msg) ||
    (error && error.name === 'ChunkLoadError')
  );
}

function recentlyReloaded() {
  try {
    const ts = Number(sessionStorage.getItem(RELOAD_TS) || 0);
    return ts && Date.now() - ts < RELOAD_COOLDOWN_MS;
  } catch (e) {
    return false;
  }
}

/**
 * Atrapa cualquier error de render de la app. Sin esto, un error en cualquier
 * componente desmontaba TODO el árbol de React y la pantalla quedaba en blanco
 * hasta refrescar a mano.
 *
 * - Error de carga de un chunk (típico tras un deploy) y no se recargó recién:
 *   recarga una vez para traer la versión nueva.
 * - Cualquier otro caso: muestra una tarjeta con "Recargar" y el detalle
 *   técnico del error (plegable) para poder diagnosticarlo.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
    if (isChunkLoadError(error) && !recentlyReloaded()) {
      try { sessionStorage.setItem(RELOAD_TS, String(Date.now())); } catch (e) { /* modo privado */ }
      window.location.reload();
    }
  }

  handleReload = () => {
    try { sessionStorage.removeItem(RELOAD_TS); } catch (e) { /* noop */ }
    window.location.reload();
  };

  detailText() {
    const { error, info } = this.state;
    const parts = [
      `Ruta: ${typeof window !== 'undefined' ? window.location.pathname : ''}`,
      `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      `Error: ${(error && (error.stack || error.message)) || String(error)}`,
    ];
    if (info && info.componentStack) parts.push(`Component stack:${info.componentStack}`);
    return parts.join('\n');
  }

  handleCopy = () => {
    const text = this.detailText();
    const done = () => { this.setState({ copied: true }); setTimeout(() => this.setState({ copied: false }), 2000); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {});
        return;
      }
    } catch (e) { /* noop */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta); done();
    } catch (e) { /* noop */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Si es error de chunk y estamos por recargar, no muestres nada (evita el flash).
    if (isChunkLoadError(this.state.error) && !recentlyReloaded()) return null;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-center auth-bg">
        <Logo size="lg" />
        <div className="max-w-md">
          <h1 className="font-heading text-xl font-semibold text-[#1e395e]">Algo no cargó bien</h1>
          <p className="text-sm text-[#5b667a] mt-1.5">
            Puede ser una actualización reciente o una conexión inestable. Recargá la página para continuar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={this.handleReload}
            className="h-11 px-6 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white font-medium"
            data-testid="error-boundary-reload"
          >
            Recargar
          </button>
          <button
            onClick={this.handleCopy}
            className="h-11 px-4 rounded-xl border border-[#1e395e]/25 text-[#1e395e] hover:bg-[#1e395e]/5 text-sm font-medium"
          >
            {this.state.copied ? 'Copiado ✓' : 'Copiar detalle'}
          </button>
        </div>
        <details className="max-w-lg w-full text-left mt-1">
          <summary className="text-xs text-[#8a8b8b] cursor-pointer select-none">Ver detalle técnico</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-white/70 border border-white/60 p-3 text-[11px] leading-relaxed text-[#5b667a] whitespace-pre-wrap break-words">
            {this.detailText()}
          </pre>
        </details>
      </div>
    );
  }
}
