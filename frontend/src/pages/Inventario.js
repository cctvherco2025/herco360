import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Boxes, PackagePlus, Store, ArrowDownUp, Save, MapPin, Search, Lock,
  TrendingDown, TrendingUp, Package, ClipboardList, FileSpreadsheet, FileText,
  Download, Upload, Loader2, FileDown, Image as ImageIcon, ImageOff,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessInventory, SUCURSALES } from '@/lib/constants';
import { timeAgoEs } from '@/lib/time';
import ArticleAutocomplete from '@/components/ArticleAutocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

/* ----------------- Product image for a selected article (uploaded via Excel) ----------------- */
function ArticleImage({ article }) {
  const [loading, setLoading] = useState(false);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!article) { setSrc(null); setFailed(false); return; }
    let active = true;
    setLoading(true); setFailed(false); setSrc(null);
    api.get(`/inventory/image?article=${encodeURIComponent(article)}`)
      .then(({ data }) => {
        if (!active) return;
        if (data?.data) { setSrc(data.data); setFailed(false); }
        else { setSrc(null); setFailed(true); }
      })
      .catch(() => { if (active) { setSrc(null); setFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [article]);

  if (!article) return null;

  return (
    <div className="rounded-xl border bg-muted/30 p-3" data-testid="article-image-card">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5 text-[#00a5df]" /> Imagen del artículo
        </span>
      </div>
      <div className="relative aspect-square w-full max-w-[220px] mx-auto overflow-hidden rounded-lg border bg-card grid place-items-center">
        {loading && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-[#00a5df]" />
            <span className="text-[11px]">Cargando…</span>
          </div>
        )}
        {!loading && src && (
          <img src={src} alt={article} className="h-full w-full object-cover" data-testid="article-image-img" />
        )}
        {!loading && !src && failed && (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground px-3 text-center">
            <ImageOff className="h-6 w-6" />
            <span className="text-[11px]">Sin imagen · súbela por Excel</span>
          </div>
        )}
      </div>
      <p className="text-xs text-center text-muted-foreground mt-2 truncate" title={article}>{article}</p>
    </div>
  );
}

function SucursalSelect({ value, onChange, testid }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11" data-testid={testid}>
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Selecciona" /></div>
      </SelectTrigger>
      <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
    </Select>
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
          onClick={() => downloadFile('/inventory/template', 'plantilla_articulos_herco360.xlsx')}>
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
          onClick={() => downloadFile('/inventory/images-template', 'plantilla_imagenes_herco360.xlsx')}>
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


/* ----------------- Productos (intake) ----------------- */
function ProductosTab({ onChanged }) {
  const [article, setArticle] = useState('');
  const [preview, setPreview] = useState('');
  const [quantity, setQuantity] = useState('');
  const [sucursal, setSucursal] = useState('H1');
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);

  const loadRecent = useCallback(async () => {
    try { const { data } = await api.get('/inventory/movements?type=entrada'); setRecent(data.slice(0, 8)); } catch (e) {}
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  const catalogFetcher = useCallback(async (q) => {
    const { data } = await api.get(`/inventory/catalog?q=${encodeURIComponent(q)}`);
    return data.map((n) => ({ name: n }));
  }, []);

  const save = async () => {
    if (!article.trim()) { toast.error('Indica el artículo'); return; }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/inventory/intake', { article: article.trim(), quantity: qty, sucursal });
      toast.success(`Inventariado: ${data.article} (${sucursal}) · Stock ${data.stock}`);
      setArticle(''); setQuantity(''); setPreview('');
      loadRecent(); onChanged?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="lg:col-span-3 rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <PackagePlus className="h-5 w-5 text-[#00a5df]" />
          <h3 className="font-heading font-semibold">Inventariar artículo</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Escribe el artículo y selecciónalo de la lista, indica cantidad y sucursal.</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Artículo</Label>
            <ArticleAutocomplete value={article} onChange={setArticle} onSelect={setPreview} fetchSuggestions={catalogFetcher}
              placeholder="Buscar artículo…" testid="inv-article-input" />
          </div>
          {preview && <ArticleImage article={preview} />}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="h-11" data-testid="inv-quantity-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Ubicación (Sucursal)</Label>
              <SucursalSelect value={sucursal} onChange={setSucursal} testid="inv-sucursal-select" />
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="inv-save-button">
            <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar artículo'}
          </Button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}
        className="lg:col-span-2 rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-[#16a34a]" />
          <h3 className="font-heading font-semibold">Ingresos recientes</h3>
        </div>
        <div className="space-y-2">
          {recent.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aún no hay ingresos</p>}
          {recent.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl border p-3">
              <span className="h-9 w-9 rounded-full grid place-items-center bg-[rgba(22,163,74,0.12)] text-[#16a34a] shrink-0"><TrendingUp className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{m.article}</p>
                <p className="text-xs text-muted-foreground">{timeAgoEs(m.created_at)} · {m.registered_by_name}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-semibold text-[#16a34a]">+{m.quantity}</span>
                <span className="block text-[11px] rounded-full bg-muted px-2 py-0.5 mt-0.5">{m.sucursal}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ImportCard onImported={onChanged} />
        <ImageImportCard onImported={onChanged} />
      </div>
    </div>
  );
}

/* ----------------- Tiendas (stock per branch) ----------------- */
function TiendasTab({ refreshKey }) {
  const [summary, setSummary] = useState([]);
  const [sucursal, setSucursal] = useState('H1');
  const [stock, setStock] = useState([]);
  const [q, setQ] = useState('');

  const loadSummary = useCallback(async () => {
    try { const { data } = await api.get('/inventory/summary'); setSummary(data); } catch (e) {}
  }, []);
  const loadStock = useCallback(async () => {
    try { const { data } = await api.get(`/inventory/stock?sucursal=${sucursal}`); setStock(data); } catch (e) {}
  }, [sucursal]);

  useEffect(() => { loadSummary(); }, [loadSummary, refreshKey]);
  useEffect(() => { loadStock(); }, [loadStock, refreshKey]);

  const filtered = stock.filter((s) => s.article.toLowerCase().includes(q.trim().toLowerCase()));
  const sucTotal = summary.find((s) => s.sucursal === sucursal) || { items_count: 0, total_qty: 0 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SUCURSALES.map((s) => {
          const data = summary.find((x) => x.sucursal === s) || { items_count: 0, total_qty: 0 };
          const active = sucursal === s;
          return (
            <button key={s} onClick={() => setSucursal(s)} data-testid={`tienda-card-${s}`}
              className={`rounded-[16px] border p-4 text-left transition-all hover:-translate-y-0.5 ${active ? 'bg-[#1e395e] text-white border-transparent shadow-cardmd' : 'bg-card hover:shadow-card'}`}>
              <div className="flex items-center justify-between">
                <Store className={`h-5 w-5 ${active ? 'text-white' : 'text-[#00a5df]'}`} />
                <span className={`text-xs font-semibold ${active ? 'text-white/80' : 'text-muted-foreground'}`}>{s}</span>
              </div>
              <p className={`font-heading text-2xl font-semibold mt-2 ${active ? 'text-white' : 'text-foreground'}`}>{data.total_qty}</p>
              <p className={`text-xs ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{data.items_count} artículos</p>
            </button>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#1e395e] dark:text-[#3cbef6]" />
            <h3 className="font-heading font-semibold">Inventario sucursal {sucursal}</h3>
            <span className="text-xs text-muted-foreground">· {sucTotal.items_count} artículos · {sucTotal.total_qty} unidades</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar artículo…" className="pl-9 h-10 w-[220px]" data-testid="tienda-search" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-12 bg-muted/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
            <span className="col-span-8">Artículo</span>
            <span className="col-span-2 text-center">Sucursal</span>
            <span className="col-span-2 text-right">Cantidad</span>
          </div>
          <div className="divide-y">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No hay inventario en esta sucursal</p>}
            {filtered.map((s) => (
              <div key={s.id} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-muted/40 transition-colors" data-testid="stock-row">
                <span className="col-span-8 text-sm font-medium truncate">{s.article}</span>
                <span className="col-span-2 text-center"><span className="text-[11px] rounded-full bg-muted px-2 py-0.5">{s.sucursal}</span></span>
                <span className="col-span-2 text-right font-semibold">{s.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ----------------- Movimientos (rebajas / salidas) ----------------- */
function MovimientosTab({ onChanged, refreshKey }) {
  const [sucursal, setSucursal] = useState('H1');
  const [article, setArticle] = useState('');
  const [preview, setPreview] = useState('');
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [saving, setSaving] = useState(false);
  const [movs, setMovs] = useState([]);

  const loadMovs = useCallback(async () => {
    try { const { data } = await api.get('/inventory/movements'); setMovs(data); } catch (e) {}
  }, []);
  useEffect(() => { loadMovs(); }, [loadMovs, refreshKey]);

  const stockFetcher = useCallback(async (qq) => {
    if (!sucursal) return [];
    const { data } = await api.get(`/inventory/stock?sucursal=${sucursal}&q=${encodeURIComponent(qq)}`);
    return data.map((s) => ({ name: s.article, hint: `Disp: ${s.quantity}` }));
  }, [sucursal]);

  const save = async () => {
    if (!article.trim()) { toast.error('Indica el artículo'); return; }
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }
    if (!description.trim()) { toast.error('La descripción es obligatoria'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/inventory/movement', {
        article: article.trim(), quantity: qty, sucursal, description: description.trim(), solicitante: solicitante.trim(),
      });
      toast.success(`Rebaja registrada en ${sucursal} · Stock ${data.stock}`);
      setArticle(''); setQuantity(''); setDescription(''); setSolicitante(''); setPreview('');
      loadMovs(); onChanged?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al registrar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="lg:col-span-2 rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="h-5 w-5 text-[#dc2626]" />
          <h3 className="font-heading font-semibold">Registrar rebaja</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Descuenta del inventario de la sucursal de origen.</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sucursal de origen</Label>
            <SucursalSelect value={sucursal} onChange={(v) => { setSucursal(v); setArticle(''); setPreview(''); }} testid="mov-sucursal-select" />
          </div>
          <div className="space-y-1.5">
            <Label>Artículo</Label>
            <ArticleAutocomplete value={article} onChange={setArticle} onSelect={setPreview} fetchSuggestions={stockFetcher}
              placeholder={`Buscar en ${sucursal}…`} testid="mov-article-input" />
          </div>
          {preview && <ArticleImage article={preview} />}
          <div className="space-y-1.5">
            <Label>Cantidad a rebajar</Label>
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="h-11" data-testid="mov-quantity-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción del movimiento *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Ej. Entrega de material para mantenimiento…" data-testid="mov-description-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Solicitante / Responsable</Label>
            <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="¿Quién lo solicita?" className="h-11" data-testid="mov-solicitante-input" />
          </div>
          <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white" data-testid="mov-save-button">
            <ArrowDownUp className="h-4 w-4 mr-1.5" /> {saving ? 'Registrando…' : 'Registrar rebaja'}
          </Button>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}
        className="lg:col-span-3 rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownUp className="h-5 w-5 text-[#1e395e] dark:text-[#3cbef6]" />
          <h3 className="font-heading font-semibold">Historial de movimientos</h3>
        </div>
        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {movs.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Sin movimientos</p>}
          {movs.map((m) => {
            const isOut = m.type === 'salida';
            return (
              <div key={m.id} className="flex items-start gap-3 rounded-xl border p-3.5" data-testid="movement-row">
                <span className={`h-9 w-9 rounded-full grid place-items-center shrink-0 ${isOut ? 'bg-[rgba(220,38,38,0.12)] text-[#dc2626]' : 'bg-[rgba(22,163,74,0.12)] text-[#16a34a]'}`}>
                  {isOut ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.article}</span>
                    <span className="text-[11px] rounded-full bg-muted px-2 py-0.5">{m.sucursal}</span>
                    <span className={`text-[11px] rounded-full px-2 py-0.5 font-semibold ${isOut ? 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' : 'bg-[rgba(22,163,74,0.1)] text-[#16a34a]'}`}>{isOut ? 'Salida' : 'Entrada'}</span>
                  </div>
                  {m.description && <p className="text-sm text-muted-foreground mt-1">{m.description}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.solicitante ? `Solicitante: ${m.solicitante} · ` : ''}{m.registered_by_name} · {timeAgoEs(m.created_at)}
                  </p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${isOut ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>{isOut ? '-' : '+'}{m.quantity}</span>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

/* ----------------- Page ----------------- */
export default function Inventario() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  if (!canAccessInventory(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Boxes className="h-7 w-7 text-[#00a5df]" /> Inventario
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gestión de inventario por sucursal</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5">
          <Lock className="h-3.5 w-3.5" /> Módulo restringido
        </span>
      </div>

      <Tabs defaultValue="productos">
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="productos" className="rounded-lg" data-testid="inv-tab-productos"><PackagePlus className="h-4 w-4 mr-1.5" /> Productos</TabsTrigger>
          <TabsTrigger value="tiendas" className="rounded-lg" data-testid="inv-tab-tiendas"><Store className="h-4 w-4 mr-1.5" /> Tiendas</TabsTrigger>
          <TabsTrigger value="movimientos" className="rounded-lg" data-testid="inv-tab-movimientos"><ArrowDownUp className="h-4 w-4 mr-1.5" /> Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="productos"><ProductosTab onChanged={bump} /></TabsContent>
        <TabsContent value="tiendas"><TiendasTab refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="movimientos"><MovimientosTab onChanged={bump} refreshKey={refreshKey} /></TabsContent>
      </Tabs>
    </div>
  );
}
