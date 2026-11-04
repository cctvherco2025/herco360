import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Boxes, ArrowDownUp, ArrowRight, MapPin, Search, Lock, Upload, Loader2, FileDown, Image as ImageIcon, ImageOff,
  TrendingDown, TrendingUp, Plus, Minus, X, LayoutGrid, List, Download, ChevronLeft, ChevronRight, AlertTriangle,
  FileSpreadsheet, FileText,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessInventory, UBICACIONES_INVENTARIO as SUCURSALES } from '@/lib/constants';
import ArticleAutocomplete from '@/components/ArticleAutocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/* Inventarios Autoservicio: Inventario (lo que hay en cada ubicación, de 12 en
   12 desde el servidor), Movimientos (historial con "Ver más") e Importar
   (Excel de artículos y de fotos). Ingresar, sacar y trasladar se hacen en
   una sola ventana; la ficha de cada producto se abre al centro en PC y desde
   abajo en el teléfono. */
const POR_PAGINA = 12;
const VISTA_KEY = 'herco360_inventario_vista';
const corto = (a) => (a || '').split('\n')[0].replace(/\s+/g, ' ').trim();
const fmtN = (n) => (n || 0).toLocaleString('es-HN');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fechaCorta = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-HN', { hour: 'numeric', minute: '2-digit' });
function etiquetaDia(iso) {
  const d = new Date(iso); const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== hoy.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}
const tipoDe = (m) => (m.sucursal_destino ? 'traslado' : m.type === 'salida' ? 'salida' : 'entrada');
const TIPO = {
  entrada: { label: 'Entrada', cls: 'bg-[rgba(22,163,74,0.12)] text-[#16a34a]', signo: '+', color: 'text-[#16a34a]' },
  salida: { label: 'Salida', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]', signo: '−', color: 'text-[#dc2626]' },
  traslado: { label: 'Traslado', cls: 'bg-[rgba(109,40,217,0.1)] text-[#6d28d9] dark:text-[#c4b5fd]', signo: '', color: 'text-[#6d28d9] dark:text-[#c4b5fd]' },
};

function usePc() {
  const [pc, setPc] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)'); const f = () => setPc(m.matches);
    m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, []);
  return pc;
}
// Texto que se aplica un momento después de dejar de escribir (búsqueda en el servidor)
function useDiferido(valor, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

// Download a file from an authenticated API endpoint (JWT in header) as a blob.
async function downloadFile(url, fallbackName) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const disp = res.headers['content-disposition'] || '';
    const match = disp.match(/filename="?([^"]+)"?/);
    const name = match ? match[1] : fallbackName;
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); window.URL.revokeObjectURL(blobUrl);
    return true;
  } catch (e) { toast.error('No se pudo generar el archivo'); return false; }
}

function SucursalSelect({ value, onChange, testid, excluir }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11" data-testid={testid}>
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Selecciona" /></div>
      </SelectTrigger>
      <SelectContent>{SUCURSALES.filter((s) => s !== excluir).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
    </Select>
  );
}

// Las fotos que vinieron muy chicas en el Excel (algunas de 90 px) no se
// estiran más de 1.5 veces su tamaño: estiradas a todo el recuadro se pixelan.
function FotoProducto({ src, nombre, mini = false }) {
  const [nat, setNat] = useState(null);
  useEffect(() => { setNat(null); }, [src]);
  if (src) {
    return (
      <span className="grid h-full w-full place-items-center bg-white">
        <img src={src} alt={corto(nombre)} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="max-h-full max-w-full object-contain"
          style={nat && !mini ? { width: Math.round(nat.w * 1.5), height: 'auto' } : { width: '100%', height: '100%' }} />
      </span>
    );
  }
  return (
    <span className="flex flex-col items-center gap-1 text-muted-foreground/70">
      <ImageOff className={mini ? 'h-4 w-4' : 'h-6 w-6'} />
      {!mini && <span className="text-[11px]">Sin foto</span>}
    </span>
  );
}

// Ventana al centro en PC; desde abajo en el teléfono
function Ventana({ open, onClose, pc, ancho = 880, titulo, testid, children }) {
  if (pc) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent data-testid={testid} className="max-h-[90vh] grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto overflow-x-hidden rounded-[22px] p-0 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-card [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:shadow-card" style={{ maxWidth: `min(${ancho}px, calc(100vw - 2rem))` }}>
          <DialogTitle className="sr-only">{titulo}</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" data-testid={testid} className="max-h-[90vh] gap-0 overflow-y-auto overflow-x-hidden rounded-t-[22px] p-0 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-card [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:shadow-card">
        <SheetTitle className="sr-only">{titulo}</SheetTitle>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border" />
        {children}
      </SheetContent>
    </Sheet>
  );
}

/* ----------------- Import articles via Excel ----------------- */
function ImportCard({ onImported }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) { toast.error('El archivo debe ser .xlsx'); return; }
    setUploading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post('/inventory/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
      toast.success(`Importado: ${data.added_to_catalog} al catálogo, ${data.stock_entries} con stock`);
      onImported?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al importar'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}
      className="rounded-[18px] bg-card border shadow-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Upload className="h-5 w-5 text-[#ec9032]" />
        <h3 className="font-heading font-semibold">Importar artículos (Excel)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Sube un archivo .xlsx para agregar varios artículos al catálogo (y stock opcional).</p>

      <div className="rounded-xl border bg-muted/40 p-4 mb-4">
        <p className="text-xs font-semibold text-foreground mb-2">El Excel debe llevar estas columnas:</p>
        <div className="overflow-hidden rounded-lg border bg-card text-xs">
          <div className="grid grid-cols-3 bg-[#1e395e] text-white font-semibold">
            <span className="px-3 py-1.5">Articulo</span>
            <span className="px-3 py-1.5 border-l border-white/20">Cantidad</span>
            <span className="px-3 py-1.5 border-l border-white/20">Sucursal</span>
          </div>
          <div className="grid grid-cols-3 border-t">
            <span className="px-3 py-1.5 truncate">Dual hook</span>
            <span className="px-3 py-1.5 border-l">100</span>
            <span className="px-3 py-1.5 border-l">H1</span>
          </div>
          <div className="grid grid-cols-3 border-t">
            <span className="px-3 py-1.5 truncate">Wire basket, 1000mm*470*250mm</span>
            <span className="px-3 py-1.5 border-l">25</span>
            <span className="px-3 py-1.5 border-l">H2</span>
          </div>
          <div className="grid grid-cols-3 border-t">
            <span className="px-3 py-1.5 truncate">Nuevo artículo</span>
            <span className="px-3 py-1.5 border-l text-muted-foreground">(vacío)</span>
            <span className="px-3 py-1.5 border-l text-muted-foreground">(vacío)</span>
          </div>
        </div>
        <ul className="text-[11px] text-muted-foreground mt-2 space-y-0.5 list-disc pl-4">
          <li><b>Articulo</b>: obligatorio. Si no existe, se agrega al catálogo.</li>
          <li><b>Cantidad</b> y <b>Sucursal</b>: opcionales. Si los pones, se suma al inventario (Sucursal: {SUCURSALES.join(', ')}).</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-xl" data-testid="inv-download-template"
          onClick={() => downloadFile('/inventory/template', 'plantilla_articulos_herco_ops.xlsx')}>
          <FileDown className="h-4 w-4 mr-1.5" /> Descargar plantilla
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onPick} data-testid="inv-import-file" />
        <Button className="rounded-xl bg-[#ec9032] hover:bg-[#d97f24] text-white" disabled={uploading}
          onClick={() => fileRef.current?.click()} data-testid="inv-import-button">
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
          {uploading ? 'Subiendo…' : 'Subir Excel'}
        </Button>
      </div>

      {result && (
        <div className="mt-4 rounded-xl border bg-[rgba(22,163,74,0.06)] p-3 text-sm">
          <p className="font-medium text-[#16a34a]">Importación completada</p>
          <p className="text-muted-foreground text-xs mt-1">{result.added_to_catalog} agregados al catálogo · {result.stock_entries} con stock</p>
          {result.errors?.length > 0 && (
            <div className="mt-2 text-xs text-[#dc2626]">
              <p className="font-medium">Avisos:</p>
              <ul className="list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ----------------- Import product images via Excel ----------------- */
function ImageImportCard({ onImported }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) { toast.error('El archivo debe ser .xlsx'); return; }
    setUploading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const { data } = await api.post('/inventory/import-images', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data);
      toast.success(`Imágenes guardadas: ${data.images_saved} de ${data.images_found}`);
      onImported?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al importar imágenes'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.14 }}
      className="rounded-[18px] bg-card border shadow-card p-5" data-testid="image-import-card">
      <div className="flex items-center gap-2 mb-1">
        <ImageIcon className="h-5 w-5 text-[#00a5df]" />
        <h3 className="font-heading font-semibold">Subir imágenes (Excel)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Sube un .xlsx con el nombre del artículo y su foto en la misma fila. El sistema coloca cada imagen en su artículo.</p>

      <div className="rounded-xl border bg-muted/40 p-4 mb-4">
        <p className="text-xs font-semibold text-foreground mb-2">Cómo preparar el archivo:</p>
        <div className="overflow-hidden rounded-lg border bg-card text-xs">
          <div className="grid grid-cols-2 bg-[#00a5df] text-white font-semibold">
            <span className="px-3 py-1.5">Articulo</span>
            <span className="px-3 py-1.5 border-l border-white/20">Imagen</span>
          </div>
          <div className="grid grid-cols-2 border-t">
            <span className="px-3 py-1.5 truncate">Dual hook</span>
            <span className="px-3 py-1.5 border-l flex items-center gap-1 text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" /> foto pegada</span>
          </div>
          <div className="grid grid-cols-2 border-t">
            <span className="px-3 py-1.5 truncate">Wire basket, 1000mm*470*250mm</span>
            <span className="px-3 py-1.5 border-l flex items-center gap-1 text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" /> foto pegada</span>
          </div>
        </div>
        <ul className="text-[11px] text-muted-foreground mt-2 space-y-0.5 list-disc pl-4">
          <li><b>Articulo</b>: nombre exacto del artículo (columna A).</li>
          <li><b>Imagen</b>: inserta la foto en Excel (Insertar &gt; Imágenes) en la <b>misma fila</b>.</li>
          <li>Una imagen por fila · formatos PNG/JPG · si el artículo ya tenía foto, se reemplaza.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-xl" data-testid="img-download-template"
          onClick={() => downloadFile('/inventory/images-template', 'plantilla_imagenes_herco_ops.xlsx')}>
          <FileDown className="h-4 w-4 mr-1.5" /> Descargar plantilla
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={onPick} data-testid="img-import-file" />
        <Button className="rounded-xl bg-[#00a5df] hover:bg-[#0090c4] text-white" disabled={uploading}
          onClick={() => fileRef.current?.click()} data-testid="img-import-button">
          {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
          {uploading ? 'Subiendo…' : 'Subir imágenes'}
        </Button>
      </div>

      {result && (
        <div className="mt-4 rounded-xl border bg-[rgba(0,165,223,0.06)] p-3 text-sm">
          <p className="font-medium text-[#00a5df]">Imágenes importadas</p>
          <p className="text-muted-foreground text-xs mt-1">{result.images_saved} guardadas · {result.images_found} encontradas en el archivo</p>
          {result.errors?.length > 0 && (
            <div className="mt-2 text-xs text-[#dc2626]">
              <p className="font-medium">Avisos:</p>
              <ul className="list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}



/* ----------------- Ficha del producto ----------------- */
function FichaProducto({ prod, pc, onClose, onAccion, onVerMovs }) {
  const [foto, setFoto] = useState(null);
  const [movs, setMovs] = useState(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!prod) return;
    setFoto(null); setMovs(null); setZoom(false);
    api.get(`/inventory/image?article=${encodeURIComponent(prod.nombre)}`).then(({ data }) => setFoto(data?.data || null)).catch(() => {});
    api.get(`/inventory/movimientos?article=${encodeURIComponent(prod.nombre)}&limit=5`)
      .then(({ data }) => setMovs(data)).catch(() => setMovs({ items: [], total: 0 }));
  }, [prod]);
  const src = foto || prod?.thumb;
  const maxU = prod ? Math.max(1, ...Object.values(prod.por)) : 1;
  const principal = prod ? Object.entries(prod.por).sort((a, b) => b[1] - a[1])[0]?.[0] : null;
  return (
    <Ventana open={!!prod} onClose={onClose} pc={pc} titulo="Ficha del producto" testid="inv-ficha">
      {prod && (
        <div className="relative grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="grid place-items-center border-b bg-muted/40 p-4 lg:border-b-0 lg:border-r lg:p-6">
            <div className="w-full">
              <button type="button" onClick={() => src && setZoom(true)} data-testid="inv-ficha-foto"
                className={`grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border bg-white lg:aspect-square ${src ? 'cursor-zoom-in' : 'cursor-default'}`}>
                <FotoProducto src={src} nombre={prod.nombre} />
              </button>
              <p className="mt-2 text-center text-[11.5px] text-muted-foreground">{src ? 'Toca la foto para ampliarla' : 'Sin foto · súbela en Importar'}</p>
            </div>
          </div>
          <div className="space-y-4 p-4 lg:p-6">
            <div className="pr-8">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ficha del producto</p>
              <h3 className="mt-1 font-heading text-[18px] font-semibold leading-snug whitespace-pre-line break-words">{prod.nombre}</h3>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Existencias por ubicación · {fmtN(prod.total)} u.</p>
              <div className="space-y-2">
                {SUCURSALES.filter((u) => prod.por[u]).map((u) => (
                  <div key={u} className="grid grid-cols-[52px_minmax(0,1fr)_56px] items-center gap-2.5 text-sm">
                    <span className="w-fit rounded-full bg-[rgba(0,165,223,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#1e395e] dark:text-[#3cbef6]">{u}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-[#00a5df]" style={{ width: `${(prod.por[u] / maxU) * 100}%` }} /></span>
                    <span className="text-right font-semibold tabular-nums">{fmtN(prod.por[u])}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Últimos movimientos</p>
              {movs === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : movs.items.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos.</p> : (
                <div className="space-y-2.5">
                  {movs.items.map((m) => {
                    const t = TIPO[tipoDe(m)];
                    return (
                      <div key={m.id} className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
                        <span className={`grid h-[26px] w-[26px] place-items-center rounded-full ${t.cls}`}>
                          {tipoDe(m) === 'entrada' ? <TrendingUp className="h-3.5 w-3.5" /> : tipoDe(m) === 'salida' ? <TrendingDown className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{m.description || t.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{m.sucursal}{m.sucursal_destino ? ` → ${m.sucursal_destino}` : ''} · {fechaCorta(m.created_at)} · {m.registered_by_name}</span>
                        </span>
                        <span className={`font-semibold tabular-nums ${t.color}`}>{t.signo}{fmtN(m.quantity)}</span>
                      </div>
                    );
                  })}
                  {movs.total > movs.items.length && (
                    <button type="button" onClick={() => onVerMovs(prod.nombre)} className="text-[12.5px] font-semibold text-[#00a5df] hover:underline" data-testid="inv-ficha-vertodos">
                      Ver todos sus movimientos ({movs.total}) →
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Button className="rounded-xl bg-[#1e395e] px-2 text-white hover:bg-[#162c49]" onClick={() => onAccion('ingresar', prod, principal)} data-testid="inv-ficha-ingresar"><Plus className="mr-1 h-4 w-4" /> Ingresar</Button>
              <Button variant="outline" className="rounded-xl px-2" onClick={() => onAccion('sacar', prod, principal)} data-testid="inv-ficha-sacar"><Minus className="mr-1 h-4 w-4" /> Sacar</Button>
              <Button variant="outline" className="rounded-xl px-2" onClick={() => onAccion('trasladar', prod, principal)} data-testid="inv-ficha-trasladar"><ArrowRight className="mr-1 h-4 w-4" /> Trasladar</Button>
            </div>
          </div>
          {zoom && src && (
            <button type="button" onClick={() => setZoom(false)} aria-label="Cerrar foto"
              className="absolute inset-0 z-10 grid cursor-zoom-out place-items-center bg-[rgba(10,18,32,0.88)] p-4">
              <img src={src} alt={corto(prod.nombre)} className="max-h-full max-w-full rounded-xl bg-white" />
            </button>
          )}
        </div>
      )}
    </Ventana>
  );
}

/* ----------------- Ingresar / sacar / trasladar (una sola ventana) ----------------- */
const MODOS = [['ingresar', 'Ingresar'], ['sacar', 'Sacar'], ['trasladar', 'Trasladar']];
function VentanaMovimiento({ form, pc, onClose, onHecho }) {
  const [modo, setModo] = useState('ingresar');
  const [article, setArticle] = useState('');
  const [sucursal, setSucursal] = useState('H1');
  const [destino, setDestino] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [disp, setDisp] = useState(null);
  const [foto, setFoto] = useState(undefined); // undefined: sin artículo · null: no tiene foto
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!form) return;
    setModo(form.modo); setArticle(form.article || ''); setSucursal(form.sucursal || 'H1');
    setCantidad(''); setMotivo(''); setSolicitante(''); setError('');
  }, [form]);
  useEffect(() => { if (modo === 'trasladar') setDestino((d) => (d && d !== sucursal ? d : SUCURSALES.find((s) => s !== sucursal))); }, [modo, sucursal]);
  // cuánto hay del artículo en la ubicación elegida (para sacar o trasladar)
  useEffect(() => {
    setDisp(null);
    if (!form || modo === 'ingresar' || !article.trim()) return undefined;
    const t = setTimeout(() => {
      api.get(`/inventory/stock?sucursal=${sucursal}&q=${encodeURIComponent(article.trim())}`)
        .then(({ data }) => setDisp(data.find((s) => s.article_key === article.trim().toLowerCase())?.quantity || 0)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [form, modo, article, sucursal]);
  // la foto del artículo elegido, para confirmar que es el correcto
  useEffect(() => {
    const nombre = article.trim();
    if (!form || !nombre) { setFoto(undefined); return undefined; }
    const t = setTimeout(() => {
      api.post('/inventory/miniaturas', { articles: [nombre] })
        .then(({ data }) => setFoto(data[nombre.toLowerCase()] || null)).catch(() => setFoto(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form, article]);
  const buscarCatalogo = useCallback(async (q) => (await api.get(`/inventory/catalog?q=${encodeURIComponent(q)}`)).data.map((n) => ({ name: n })), []);
  const buscarEnUbicacion = useCallback(async (q) => (await api.get(`/inventory/stock?sucursal=${sucursal}&q=${encodeURIComponent(q)}`)).data
    .map((s) => ({ name: s.article, hint: `Disp: ${s.quantity}` })), [sucursal]);

  const guardar = async () => {
    const qty = parseInt(cantidad, 10);
    if (!article.trim()) { setError('Elige el artículo.'); return; }
    if (!qty || qty <= 0) { setError('La cantidad debe ser mayor a 0.'); return; }
    if (modo !== 'ingresar') {
      if (disp !== null && qty > disp) { setError(`Solo hay ${fmtN(disp)} en ${sucursal}.`); return; }
      if (!motivo.trim()) { setError('Escribe el motivo del movimiento.'); return; }
    }
    setGuardando(true); setError('');
    try {
      if (modo === 'ingresar') {
        await api.post('/inventory/intake', { article: article.trim(), quantity: qty, sucursal });
        toast.success(`Ingresado: ${qty} en ${sucursal}`);
      } else {
        await api.post('/inventory/movement', {
          article: article.trim(), quantity: qty, sucursal, description: motivo.trim(), solicitante: solicitante.trim(),
          sucursal_destino: modo === 'trasladar' ? destino : null,
        });
        toast.success(modo === 'trasladar' ? `Trasladado: ${qty} de ${sucursal} a ${destino}` : `Salida registrada: ${qty} de ${sucursal}`);
      }
      onHecho();
    } catch (e) { setError(e?.response?.data?.detail || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const titulo = modo === 'ingresar' ? 'Ingresar al inventario' : modo === 'sacar' ? 'Sacar del inventario' : 'Trasladar entre ubicaciones';
  return (
    <Ventana open={!!form} onClose={onClose} pc={pc} ancho={540} titulo={titulo} testid="inv-movimiento">
      {form && (
        <div className="min-w-0 space-y-4 p-5 sm:p-6">
          <div className="pr-8">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Registrar</p>
            <h3 className="mt-1 font-heading text-[19px] font-semibold">{titulo}</h3>
          </div>
          <div className="grid grid-cols-3 rounded-xl bg-muted p-1" role="group" aria-label="Tipo de movimiento">
            {MODOS.map(([k, t]) => (
              <button key={k} type="button" onClick={() => { setModo(k); setError(''); }} aria-pressed={modo === k} data-testid={`inv-modo-${k}`}
                className={`rounded-lg py-2 text-[13.5px] font-medium ${modo === k ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground'}`}>{t}</button>
            ))}
          </div>
          <div className={modo === 'trasladar' ? 'grid grid-cols-2 gap-3' : ''}>
            <div className="space-y-1.5">
              <Label>{modo === 'ingresar' ? 'Ubicación' : modo === 'sacar' ? 'Sacar de' : 'Desde'}</Label>
              <SucursalSelect value={sucursal} onChange={setSucursal} testid="inv-mov-origen" />
            </div>
            {modo === 'trasladar' && (
              <div className="space-y-1.5">
                <Label>Hacia</Label>
                <SucursalSelect value={destino} onChange={setDestino} excluir={sucursal} testid="inv-mov-destino" />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Artículo</Label>
            <ArticleAutocomplete key={`${modo}-${sucursal}`} value={article} onChange={setArticle} onSelect={setArticle}
              fetchSuggestions={modo === 'ingresar' ? buscarCatalogo : buscarEnUbicacion}
              placeholder={modo === 'ingresar' ? 'Buscar artículo o escribir uno nuevo…' : `Buscar en ${sucursal}…`} testid="inv-mov-articulo" />
            {modo !== 'ingresar' && disp !== null && <p className="text-xs text-muted-foreground" data-testid="inv-mov-disponible">Disponible en {sucursal}: <b className="text-foreground">{fmtN(disp)}</b></p>}
            {foto !== undefined && (
              <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/40 p-2.5" data-testid="inv-mov-foto">
                <span className="grid h-20 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white">
                  <FotoProducto src={foto} nombre={article} />
                </span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  <span className="block truncate text-[13px] font-medium text-foreground">{corto(article)}</span>
                  {foto ? 'Revisa que sea el artículo correcto' : 'Este artículo no tiene foto · súbela en Importar'}
                </span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{modo === 'ingresar' ? 'Cantidad a ingresar' : modo === 'sacar' ? 'Cantidad a sacar' : 'Cantidad a trasladar'}</Label>
            <Input type="number" min="1" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" className="h-11" data-testid="inv-mov-cantidad" />
          </div>
          {modo !== 'ingresar' && (
            <>
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ej. Entrega de material para mantenimiento…" data-testid="inv-mov-motivo" />
              </div>
              <div className="space-y-1.5">
                <Label>Quién lo solicita <span className="font-normal text-muted-foreground">· opcional</span></Label>
                <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nombre" className="h-11" data-testid="inv-mov-solicitante" />
              </div>
            </>
          )}
          {error && <p className="text-sm text-[#dc2626]" data-testid="inv-mov-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={onClose}>Cancelar</Button>
            <Button className="rounded-xl bg-[#1e395e] text-white hover:bg-[#162c49]" disabled={guardando} onClick={guardar} data-testid="inv-mov-guardar">
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{modo === 'ingresar' ? 'Ingresar' : modo === 'sacar' ? 'Sacar' : 'Trasladar'}
            </Button>
          </div>
        </div>
      )}
    </Ventana>
  );
}

/* ----------------- Paginación ----------------- */
function Paginas({ page, pages, total, desde, hasta, onPage }) {
  if (total === 0) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground" data-testid="inv-paginas">
      <span>Mostrando <b className="text-foreground">{desde}–{hasta}</b> de <b className="text-foreground">{fmtN(total)}</b> artículos</span>
      {pages > 1 && (
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior" className="grid h-9 w-9 place-items-center rounded-xl border bg-card disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          {nums.map((n, i) => (
            <React.Fragment key={n}>
              {i > 0 && n - nums[i - 1] > 1 && <span className="px-1">…</span>}
              <button type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
                className={`h-9 min-w-[36px] rounded-xl border px-2 font-medium tabular-nums ${n === page ? 'border-[#1e395e] bg-[#1e395e] text-white dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0a1220]' : 'bg-card text-foreground'}`}>{n}</button>
            </React.Fragment>
          ))}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Página siguiente" className="grid h-9 w-9 place-items-center rounded-xl border bg-card disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </span>
      )}
    </div>
  );
}

/* ----------------- Inventario (lo que hay en cada ubicación) ----------------- */
function InventarioTab({ refreshKey, onAbrir }) {
  const [summary, setSummary] = useState([]);
  const [ubi, setUbi] = useState('');
  const [q, setQ] = useState('');
  const qDif = useDiferido(q);
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);
  const [vista, setVista] = useState(() => { try { return localStorage.getItem(VISTA_KEY) || 'grid'; } catch (e) { return 'grid'; } });
  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem(VISTA_KEY, v); } catch (e) { /* sin almacenamiento */ } };
  const arriba = useRef(null);

  useEffect(() => { api.get('/inventory/summary').then(({ data }) => setSummary(data)).catch(() => {}); }, [refreshKey]);
  useEffect(() => { setPage(1); }, [ubi, qDif]);
  useEffect(() => {
    let vivo = true;
    const p = new URLSearchParams({ page: String(page), per_page: String(POR_PAGINA) });
    if (ubi) p.set('ubicacion', ubi);
    if (qDif.trim()) p.set('q', qDif.trim());
    api.get(`/inventory/productos?${p}`).then(({ data }) => { if (vivo) setRes(data); }).catch(() => { if (vivo) setRes({ items: [], total: 0, page: 1, pages: 1 }); });
    return () => { vivo = false; };
  }, [ubi, qDif, page, refreshKey]);
  const irA = (n) => { setPage(n); arriba.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const resumenDe = (u) => summary.find((x) => x.sucursal === u) || { items_count: 0, total_qty: 0 };
  const total = { total_qty: summary.reduce((a, x) => a + x.total_qty, 0), items_count: null };
  const ubis = [...SUCURSALES].sort((a, b) => (resumenDe(b).total_qty > 0) - (resumenDe(a).total_qty > 0));
  const cant = (p) => (ubi ? p.por[ubi] || 0 : p.total);
  const etiqueta = (p) => (ubi || Object.keys(p.por).join(' · '));
  const items = res?.items || [];
  const desde = res && res.total ? (res.page - 1) * POR_PAGINA + 1 : 0;

  const Chip = ({ id, titulo, d }) => {
    const on = ubi === id;
    return (
      <button type="button" onClick={() => setUbi(id)} data-testid={`tienda-card-${id || 'todas'}`} aria-pressed={on}
        className={`flex min-w-[104px] shrink-0 flex-col rounded-[14px] border px-3.5 py-2.5 text-left transition-colors ${on ? 'border-[#1e395e] bg-[#1e395e] text-white dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0a1220]' : 'bg-card shadow-card hover:border-[#1e395e] dark:hover:border-[#3cbef6]'} ${!on && id && !d.total_qty ? 'opacity-55 shadow-none' : ''}`}>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${on ? 'opacity-80' : 'text-muted-foreground'}`}>{titulo}</span>
        <span className="font-heading text-xl font-semibold leading-tight tabular-nums">{fmtN(d.total_qty)}</span>
        <span className={`text-[11px] ${on ? 'opacity-80' : 'text-muted-foreground'}`}>{d.items_count === null ? 'unidades' : `${d.items_count} artículos`}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4" ref={arriba}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="inv-ubicaciones">
        <Chip id="" titulo="Todas" d={total} />
        {ubis.map((u) => <Chip key={u} id={u} titulo={u} d={resumenDe(u)} />)}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar artículo…" className="h-10 pl-9" data-testid="tienda-search" />
        </div>
        <div className="inline-flex rounded-xl border bg-card p-1" role="group" aria-label="Vista">
          {[['grid', 'Cuadrícula', LayoutGrid], ['lista', 'Lista', List]].map(([v, t, Ic]) => (
            <button key={v} type="button" onClick={() => cambiarVista(v)} aria-pressed={vista === v} data-testid={`inv-vista-${v}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${vista === v ? 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]' : 'text-muted-foreground hover:text-foreground'}`}>
              <Ic className="h-3.5 w-3.5" /><span className="hidden sm:inline">{t}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{ubi ? `Inventario de ${ubi}` : 'Todas las ubicaciones'}</span>
        {res && <> · {fmtN(res.total)} artículos{ubi ? ` · ${fmtN(resumenDe(ubi).total_qty)} unidades` : ''}</>}
      </p>

      {res === null ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        : items.length === 0 ? <p className="rounded-[18px] border bg-card py-10 text-center text-sm text-muted-foreground">{qDif.trim() ? 'No hay artículos con ese nombre' : 'No hay inventario en esta ubicación'}</p>
        : vista === 'grid' ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-6">
            {items.map((p) => (
              <button key={p.key} type="button" onClick={() => onAbrir(p)} data-testid="stock-row"
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-card transition-colors hover:border-[#1e395e] dark:hover:border-[#3cbef6]">
                <span className="grid aspect-[4/3] w-full place-items-center overflow-hidden bg-muted"><FotoProducto src={p.thumb} nombre={p.nombre} /></span>
                <span className="grid gap-1.5 p-3">
                  <span className="line-clamp-2 min-h-[34px] text-[13px] font-medium leading-snug">{corto(p.nombre)}</span>
                  <span className="flex items-center justify-between gap-1.5">
                    <span className={`font-heading text-lg font-semibold tabular-nums ${cant(p) < 10 ? 'text-[#ec9032]' : ''}`}>{fmtN(cant(p))}<span className="ml-1 font-sans text-[11px] font-normal text-muted-foreground">u.</span></span>
                    <span className="truncate rounded-full bg-[rgba(0,165,223,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#1e395e] dark:text-[#3cbef6]">{etiqueta(p)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
            {items.map((p) => (
              <button key={p.key} type="button" onClick={() => onAbrir(p)} data-testid="stock-row"
                className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-t px-3.5 py-2 text-left first:border-t-0 hover:bg-muted/60 sm:grid-cols-[48px_minmax(0,1fr)_auto_auto]">
                <span className="grid h-10 w-12 place-items-center overflow-hidden rounded-lg bg-muted"><FotoProducto src={p.thumb} nombre={p.nombre} mini /></span>
                <span className="truncate text-sm font-medium">{corto(p.nombre)}</span>
                <span className="hidden rounded-full bg-[rgba(0,165,223,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#1e395e] dark:text-[#3cbef6] sm:inline">{etiqueta(p)}</span>
                <span className={`font-heading font-semibold tabular-nums ${cant(p) < 10 ? 'text-[#ec9032]' : ''}`}>{fmtN(cant(p))}</span>
              </button>
            ))}
          </div>
        )}
      {res && <Paginas page={res.page} pages={res.pages} total={res.total} desde={desde} hasta={desde + items.length - 1} onPage={irA} />}
    </div>
  );
}

/* ----------------- Movimientos (historial, de 12 en 12) ----------------- */
const FILTROS = [['', 'Todos'], ['entrada', 'Entradas'], ['salida', 'Salidas'], ['traslado', 'Traslados']];
function MovimientosTab({ refreshKey, articulo, onQuitarArticulo }) {
  const [tipo, setTipo] = useState('');
  const [ubi, setUbi] = useState('todas');
  const [q, setQ] = useState('');
  const qDif = useDiferido(q);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const params = useCallback((skip) => {
    const p = new URLSearchParams({ skip: String(skip), limit: String(POR_PAGINA) });
    if (tipo) p.set('tipo', tipo);
    if (ubi !== 'todas') p.set('ubicacion', ubi);
    if (articulo) p.set('article', articulo); else if (qDif.trim()) p.set('q', qDif.trim());
    return p;
  }, [tipo, ubi, qDif, articulo]);
  useEffect(() => {
    let vivo = true;
    setItems(null);
    api.get(`/inventory/movimientos?${params(0)}`).then(({ data }) => { if (vivo) { setItems(data.items); setTotal(data.total); setHayMas(data.hay_mas); } })
      .catch(() => { if (vivo) { setItems([]); setTotal(0); setHayMas(false); } });
    return () => { vivo = false; };
  }, [params, refreshKey]);
  const verMas = async () => {
    setCargando(true);
    try { const { data } = await api.get(`/inventory/movimientos?${params(items.length)}`); setItems((l) => [...l, ...data.items]); setHayMas(data.hay_mas); }
    catch (e) { toast.error('No se pudieron cargar más movimientos'); }
    finally { setCargando(false); }
  };
  const grupos = [];
  (items || []).forEach((m) => {
    const k = etiquetaDia(m.created_at);
    const g = grupos[grupos.length - 1];
    if (g && g.k === k) g.l.push(m); else grupos.push({ k, l: [m] });
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {articulo ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-[#1e395e] bg-[rgba(0,165,223,0.08)] px-3 py-2 text-sm dark:border-[#3cbef6]" data-testid="mov-articulo">
            <span className="truncate">Movimientos de <b>{corto(articulo)}</b></span>
            <button type="button" onClick={onQuitarArticulo} aria-label="Ver todos los artículos" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </span>
        ) : (
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar artículo…" className="h-10 pl-9" data-testid="mov-filter-search" />
          </div>
        )}
        <Select value={ubi} onValueChange={setUbi}>
          <SelectTrigger className="h-10 w-[190px]" data-testid="mov-filter-ubicacion"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><SelectValue /></div></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas las ubicaciones</SelectItem>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setTipo(k)} aria-pressed={tipo === k} data-testid={`mov-tipo-${k || 'todos'}`}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${tipo === k ? 'border-[#1e395e] bg-[#1e395e] text-white dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0a1220]' : 'bg-card text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>
      {items === null ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        : items.length === 0 ? <p className="rounded-[18px] border bg-card py-10 text-center text-sm text-muted-foreground">No hay movimientos con estos filtros</p>
        : (
          <div data-testid="mov-lista">
            {grupos.map((g) => (
              <div key={g.k}>
                <p className="mb-1.5 mt-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{g.k}</p>
                <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
                  {g.l.map((m) => {
                    const tp = tipoDe(m); const t = TIPO[tp];
                    return (
                      <div key={m.id} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t px-3.5 py-2.5 first:border-t-0" data-testid="mov-row">
                        <span className="grid h-9 w-11 place-items-center overflow-hidden rounded-lg bg-muted"><FotoProducto src={m.thumb} nombre={m.article} mini /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium">{corto(m.article)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            <span className={`mr-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold ${t.cls}`}>{t.label}</span>
                            {m.sucursal}{m.sucursal_destino ? ` → ${m.sucursal_destino}` : ''}{m.description ? ` · ${m.description}` : ''}{m.solicitante ? ` · Solicita: ${m.solicitante}` : ''} · {m.registered_by_name}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className={`block font-heading font-semibold tabular-nums ${t.color}`}>{t.signo}{fmtN(m.quantity)}</span>
                          <span className="block text-[11px] text-muted-foreground">{horaDe(m.created_at)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {hayMas ? (
              <button type="button" onClick={verMas} disabled={cargando} data-testid="mov-ver-mas"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed bg-card py-3 text-sm font-medium text-[#1e395e] hover:border-[#1e395e] dark:text-[#3cbef6]">
                {cargando && <Loader2 className="h-4 w-4 animate-spin" />} Ver más movimientos · van {items.length} de {fmtN(total)}
              </button>
            ) : <p className="mt-3 text-center text-sm text-muted-foreground">Son todos los movimientos ({fmtN(total)}).</p>}
          </div>
        )}
    </div>
  );
}

/* ----------------- Importar ----------------- */
function ImportarTab({ onChanged, refreshKey }) {
  const [fotos, setFotos] = useState(null);
  useEffect(() => { api.get('/inventory/fotos-faltantes').then(({ data }) => setFotos(data)).catch(() => {}); }, [refreshKey]);
  return (
    <div className="space-y-4">
      {fotos && fotos.sin_foto > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#ec9032]/40 bg-[rgba(236,144,50,0.08)] px-4 py-3 text-sm" data-testid="inv-sin-foto">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#ec9032]" />
          <span><b>{fotos.sin_foto} de {fotos.total} artículos no tienen foto.</b> Súbelas con el Excel de fotos para que se vean en el inventario.</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ImportCard onImported={onChanged} />
        <ImageImportCard onImported={onChanged} />
      </div>
    </div>
  );
}

/* ----------------- Page ----------------- */
export default function Inventario() {
  const { user } = useAuth();
  const pc = usePc();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  const [tab, setTab] = useState('inventario');
  const [ficha, setFicha] = useState(null);
  const [form, setForm] = useState(null);
  const [movArticulo, setMovArticulo] = useState('');

  if (!canAccessInventory(user)) return <Navigate to="/" replace />;

  const abrirForm = (modo, prod, sucursal) => { setFicha(null); setForm({ modo, article: prod?.nombre || '', sucursal: sucursal || 'H1', n: Date.now() }); };
  const exportar = (tipo, formato) => downloadFile(`/inventory/export/${tipo}?format=${formato}`, `${tipo === 'stock' ? 'inventario' : 'movimientos'}.${formato}`);
  const TABS = [['inventario', 'Inventario', Boxes], ['movimientos', 'Movimientos', ArrowDownUp], ['importar', 'Importar', Upload]];

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Boxes className="h-7 w-7 text-[#00a5df]" /> Inventarios Autoservicio
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 flex flex-wrap items-center gap-2">
            Lo que hay en cada ubicación, lo que entra y lo que sale
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,165,223,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#00a5df]"><Lock className="h-3 w-3" /> Restringido</span>
          </p>
        </div>
        <div className="grid w-full grid-cols-[1fr_1fr_auto] gap-2 sm:flex sm:w-auto">
          <Button className="h-11 rounded-xl bg-[#1e395e] text-white hover:bg-[#162c49] sm:h-10" onClick={() => abrirForm('ingresar')} data-testid="inv-ingresar"><Plus className="mr-1 h-4 w-4" /> Ingresar</Button>
          <Button variant="outline" className="h-11 rounded-xl sm:h-10" onClick={() => abrirForm('sacar')} data-testid="inv-sacar"><ArrowRight className="mr-1 h-4 w-4" /> <span className="sm:hidden">Sacar</span><span className="hidden sm:inline">Sacar o trasladar</span></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 rounded-xl px-3 sm:h-10" data-testid="inv-exportar" aria-label="Exportar"><Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Exportar</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel>Inventario</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportar('stock', 'xlsx')}><FileSpreadsheet className="mr-2 h-4 w-4 text-[#16a34a]" /> Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportar('stock', 'pdf')}><FileText className="mr-2 h-4 w-4 text-[#dc2626]" /> PDF</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Movimientos</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportar('movements', 'xlsx')}><FileSpreadsheet className="mr-2 h-4 w-4 text-[#16a34a]" /> Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportar('movements', 'pdf')}><FileText className="mr-2 h-4 w-4 text-[#dc2626]" /> PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 rounded-xl border bg-card p-1 sm:inline-grid sm:w-auto" role="tablist">
        {TABS.map(([k, t, Ic]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`inv-tab-${k}`}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium sm:px-4 sm:text-sm ${tab === k ? 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]' : 'text-muted-foreground hover:text-foreground'}`}>
            <Ic className="h-4 w-4" /> {t}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === 'inventario' && <InventarioTab refreshKey={refreshKey} onAbrir={setFicha} />}
        {tab === 'movimientos' && <MovimientosTab refreshKey={refreshKey} articulo={movArticulo} onQuitarArticulo={() => setMovArticulo('')} />}
        {tab === 'importar' && <ImportarTab onChanged={bump} refreshKey={refreshKey} />}
      </motion.div>

      <FichaProducto prod={ficha} pc={pc} onClose={() => setFicha(null)} onAccion={abrirForm}
        onVerMovs={(nombre) => { setFicha(null); setMovArticulo(nombre); setTab('movimientos'); }} />
      <VentanaMovimiento form={form} pc={pc} onClose={() => setForm(null)} onHecho={() => { setForm(null); bump(); }} />
    </div>
  );
}
