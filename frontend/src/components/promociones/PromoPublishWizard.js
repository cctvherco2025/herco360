import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  UploadCloud, FileSpreadsheet, X, ChevronLeft, ChevronRight, ListChecks,
  Trash2, Plus, ArrowUp, ArrowDown, Check, Users as UsersIcon, Building2,
  Briefcase, Rocket, Loader2, FileDown, Layers,
} from 'lucide-react';
import api from '@/lib/api';
import { AREAS, CARGOS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { periodoLabel } from '@/pages/PromocionesHome';

const STEP_LABELS = ['Cargar Excel', 'Detectar columnas', 'Categorizar', 'Configurar', 'Publicar'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const OPCIONES_BASE = [{ label: 'Sí' }, { label: 'No' }, { label: 'No aplica' }];
const newItemId = () => `${Date.now()}-${Math.random()}`;

// Respaldo si /promociones/meta no responde; la lista oficial vive en el backend.
const CATEGORIAS_DEFAULT = ['Herramientas', 'Hogar', 'Ferretería', 'Iluminación', 'Pinturas', 'Revestimiento'];
const SIN_CATEGORIA = '__none';
// De dónde salió la categoría de cada línea (se muestra junto a la línea para
// saber cuáles conviene revisar: las "sugeridas" nunca las confirmó nadie).
const ORIGEN_LABEL = { excel: 'del Excel', memoria: 'recordada', sugerida: 'sugerida — revisar' };

// minúsculas, sin tildes, sin espacios dobles — para buscar y comparar
const normTxt = (v) => (v ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Sugerencia de categoría por palabras clave del nombre de la línea. Solo es
// un punto de partida: el administrador revisa y corrige cada línea antes de
// publicar. El orden importa (p. ej. "Electrodomésticos Black & Decker" es
// Hogar aunque "black & decker" también sea marca de herramientas).
const CATEGORIA_REGLAS = [
  ['Pinturas', /pintura|tapagotera|barniz|corex|impermeabiliz/],
  ['Hogar', /electrodomestico|decoracion|espejo|esoejo|bicicleta|gimnasio|televisor|aire acondicionado|lavatrastos|macetera|sankey|klipxtreme|xtech|nexxt|tapo/],
  ['Revestimiento', /ceramica|porcelanato|laticrete|quindeca|fraguador|moldura|tablilla|cielo|panel|wpc|nomastyl|incesa|unicesa|hispacensa|duela/],
  ['Ferreteria', /ferreteria/],
  ['Iluminacion', /ilumin|bombillo|lampara|linterna|equinox|kasalight|luzmas|ventilador|electricidad|steren|avtek/],
  ['Herramientas', /herramienta|dewalt|stanley|sbd|truper|bombeo|bomba|generador|combustion|hidrolavadora|karcher|electrodo|workpro|sweiss|geotul|dica|urrea|escalera|abrasivo|accessmatic|macrovic|yoohak|automotriz|anauger|chevron|castrol|proteccion|elite|ingco/],
  ['Ferreteria', /cerraj|herraje|kwikset|fanal|brown|bisman|dap|adhesivo|alambre|malla|valvula|coflex|canal|puerta|ventana|plywood|madera|riego|manguera|rotoplas|griferia|pfister|dyllu/],
];

// "DYLLU - ESCALERAS" -> { marca: 'DYLLU', sub: 'ESCALERAS' }. Solo reconoce
// el formato "MARCA - línea" del consolidado; sin guion no hay marca.
function partirMarca(titulo) {
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec((titulo || '').trim());
  return m ? { marca: m[1].trim(), sub: m[2].trim() } : null;
}

// Convierte las líneas incluidas en las preguntas que se publican. Con
// `agrupar`, las líneas de la misma marca Y la misma categoría (2 o más) se
// vuelven UNA pregunta de casillas: "DYLLU" con Escaleras, Herramientas
// manuales, etc. como opciones — se marcan las que están rotuladas. Una línea
// suelta, sin marca o sola en su categoría sigue siendo Sí / No / No aplica.
//
// Grupos manuales: `it.grupo` = nombre que el administrador le puso a un grupo
// (manda sobre la marca automática y funciona aunque el interruptor esté
// apagado); `it.grupo === SOLO` = línea separada a mano, nunca se agrupa. Un
// grupo manual con el mismo nombre que una marca se une a esa marca.
const SOLO = '__solo';
function armarPreguntas(lineas, agrupar) {
  const grupos = new Map();
  lineas.forEach((it) => {
    const manual = it.grupo && it.grupo !== SOLO ? it.grupo.trim() : '';
    const p = partirMarca(it.titulo);
    let nombre = '';
    if (manual) nombre = manual;
    else if (agrupar && it.grupo !== SOLO && p) nombre = p.marca;
    // dentro del grupo, la línea se nombra sin el prefijo de la marca si lo trae
    const sub = nombre && p && normTxt(p.marca) === normTxt(nombre) ? p.sub : it.titulo.trim();
    const key = nombre ? `${it.categoria}|${normTxt(nombre)}` : `solo|${it.localId}`;
    // el grupo conserva el nombre de su primera línea ("DYLLU" aunque se escriba "dyllu")
    if (!grupos.has(key)) grupos.set(key, { nombre, miembros: [] });
    grupos.get(key).miembros.push({ it, sub });
  });
  return [...grupos.values()].map(({ nombre, miembros: g }) => {
    if (g.length === 1) {
      const { it } = g[0];
      return {
        seccion: it.categoria, titulo: it.titulo.trim(),
        pregunta: it.pregunta || '¿La promoción está visible en tienda?',
        tipo: 'opcion_unica', scored: false, permite_foto: true,
        opciones: it.opciones, lineas_origen: [it.nombreOriginal || it.titulo.trim()],
        localIds: [it.localId],
      };
    }
    const vistos = new Set();
    const opciones = g.map(({ it, sub }) => {
      let label = it.descuento ? `${sub} — ${it.descuento}` : sub;
      for (let n = 2; vistos.has(label); n += 1) label = `${sub} (${n})`;
      vistos.add(label);
      return { label };
    });
    const vences = [...new Set(g.map(({ it }) => it.vence).filter(Boolean))];
    return {
      localIds: g.map(({ it }) => it.localId),
      seccion: g[0].it.categoria, titulo: nombre,
      pregunta: `Marca las líneas que están rotuladas en tienda (${g.length} líneas)${vences.length === 1 ? ` · Vence: ${vences[0]}` : ''}`,
      tipo: 'checklist', scored: false, permite_foto: true,
      opciones, lineas_origen: g.map(({ it }) => it.nombreOriginal || it.titulo.trim()),
    };
  });
}

function sugerirCategoria(texto, categorias) {
  const t = normTxt(texto);
  for (const [cat, re] of CATEGORIA_REGLAS) {
    if (re.test(t)) return categorias.find((c) => normTxt(c) === normTxt(cat)) || '';
  }
  return '';
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadTemplate() {
  try {
    const res = await api.get('/formularios-custom/promociones/plantilla', { responseType: 'blob' });
    const disp = res.headers['content-disposition'] || '';
    const m = disp.match(/filename="?([^"]+)"?/);
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl; a.download = m ? m[1] : 'plantilla_promociones_herco360.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) { toast.error('No se pudo descargar la plantilla'); }
}

// ---------------------------------------------------------------------------
// Popover de selección múltiple genérico (áreas / cargos): checkboxes + chips
// ---------------------------------------------------------------------------
function MultiPickerPopover({ icon: Icon, placeholder, options, selected, onChange, disabled }) {
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled}
          className="w-full min-h-11 flex items-center gap-2 flex-wrap rounded-xl border bg-card px-3 py-2 text-sm text-left hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
          {selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.12)] text-[#16a34a] px-2 py-0.5 text-xs">{v}</span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={6}
        className="w-[--radix-popover-trigger-width] max-h-[280px] overflow-y-auto p-1.5 rounded-2xl">
        {options.map((v) => {
          const active = selected.includes(v);
          return (
            <button key={v} type="button" onClick={() => toggle(v)}
              className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted text-left">
              <span className={`h-4 w-4 rounded-md border-2 shrink-0 grid place-items-center ${active ? 'border-[#16a34a] bg-[#16a34a]' : 'border-muted-foreground/40'}`}>
                {active && <Check className="h-3 w-3 text-white" />}
              </span>
              <span className="text-sm">{v}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// Popover de usuarios individuales, agrupados por área (mismo patrón que el
// selector de participantes de actividades).
function UsersPickerPopover({ selected, onChange, disabled }) {
  const [users, setUsers] = useState(null);
  const load = () => {
    if (users !== null) return;
    api.get('/users?status=approved').then(({ data }) => setUsers(data)).catch(() => setUsers([]));
  };
  const list = users || [];
  const grouped = list.reduce((acc, u) => {
    const area = (u.area || '').trim() || 'Sin área';
    (acc[area] = acc[area] || []).push(u);
    return acc;
  }, {});
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectedUsers = list.filter((u) => selected.includes(u.id));

  return (
    <Popover onOpenChange={(o) => o && load()}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled}
          className="w-full min-h-11 flex items-center gap-2 flex-wrap rounded-xl border bg-card px-3 py-2 text-sm text-left hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed">
          <UsersIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          {selectedUsers.length === 0 && <span className="text-muted-foreground">Usuarios específicos (opcional)</span>}
          {selectedUsers.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.12)] text-[#16a34a] px-2 py-0.5 text-xs">{u.name}</span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={6} onWheel={(e) => e.stopPropagation()}
        className="w-[--radix-popover-trigger-width] max-h-[300px] overflow-y-auto overscroll-contain touch-pan-y p-1.5 rounded-2xl">
        {users === null && <p className="text-sm text-muted-foreground text-center py-4">Cargando…</p>}
        {Object.keys(grouped).sort((a, b) => a.localeCompare(b)).map((area) => (
          <div key={area} className="mb-1.5 last:mb-0">
            <div className="px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{area}</span>
            </div>
            {grouped[area].map((u) => {
              const active = selected.includes(u.id);
              return (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted text-left">
                  <Avatar className="h-7 w-7"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{u.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{u.position}</span>
                  </span>
                  {active && <Check className="h-4 w-4 text-[#16a34a]" />}
                </button>
              );
            })}
          </div>
        ))}
        {users !== null && list.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin usuarios</p>}
      </PopoverContent>
    </Popover>
  );
}

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`h-6 w-6 rounded-full grid place-items-center text-[11px] font-bold ${
              i < step ? 'bg-[#16a34a] text-white' : i === step ? 'bg-[#1e395e] text-white' : 'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`text-xs font-medium whitespace-nowrap ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && <span className="h-px w-4 sm:w-8 bg-border shrink-0" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function PromoPublishWizard() {
  const navigate = useNavigate();
  const now = new Date();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Paso 1
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [excelData, setExcelData] = useState(null); // { headers, rows, suggested_main_column, ... }
  const fileInputRef = useRef(null);

  // Paso 2
  const [mainColumn, setMainColumn] = useState('');
  const [refColumns, setRefColumns] = useState([]);

  // Paso 3
  const [items, setItems] = useState([]);
  const [categorias, setCategorias] = useState(CATEGORIAS_DEFAULT);
  const [busqueda, setBusqueda] = useState('');
  const [catFiltro, setCatFiltro] = useState(''); // '' = todas | SIN_CATEGORIA | categoría
  const [seleccion, setSeleccion] = useState(new Set());
  const [agruparMarca, setAgruparMarca] = useState(true);

  useEffect(() => {
    api.get('/formularios-custom/promociones/meta')
      .then(({ data }) => { if (data.categorias?.length) setCategorias(data.categorias); })
      .catch(() => {});
  }, []);

  // Paso 4
  const [titulo, setTitulo] = useState('Promociones del mes');
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [descripcion, setDescripcion] = useState('');
  const [todos, setTodos] = useState(false);
  const [areas, setAreas] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [userIds, setUserIds] = useState([]);

  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

  const pickFile = (f) => {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      toast.error('El archivo debe ser .xlsx o .xls');
      return;
    }
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const inspectAndAdvance = async () => {
    if (!file) { toast.error('Selecciona un archivo de Excel'); return; }
    setInspecting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/formularios-custom/inspeccionar-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setExcelData(data);
      setMainColumn(data.suggested_main_column || data.headers[0] || '');
      setRefColumns(data.headers.filter((h) => h !== data.suggested_main_column));
      setStep(1);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo leer el archivo');
    } finally { setInspecting(false); }
  };

  const generateQuestions = async () => {
    if (!mainColumn) { toast.error('Selecciona la columna principal'); return; }
    const cols = refColumns.filter((c) => c !== mainColumn);
    const catCol = excelData.headers.find((h) => normTxt(h) === 'categoria');
    const descCol = excelData.headers.find((h) => normTxt(h) === 'descuento');
    const venceCol = excelData.headers.find((h) => normTxt(h) === 'vencimiento');
    const nombres = excelData.rows.map((row) => (row[mainColumn] ?? '').toString().trim() || 'Promoción sin nombre');

    // Categorías que el administrador ya asignó en publicaciones anteriores.
    let aprendidas = [];
    try {
      const { data } = await api.post('/formularios-custom/promociones/categorias-aprendidas', { titulos: nombres });
      aprendidas = data.categorias || [];
    } catch (e) { /* sin memoria: se cae a la sugerencia por palabras clave */ }

    const generated = excelData.rows.map((row, i) => {
      const nombre = nombres[i];
      const hint = cols.map((c) => (row[c] ?? '') !== '' ? `${c}: ${row[c]}` : null).filter(Boolean).join(' · ');
      // Prioridad: la columna Categoría del Excel (si es una de las oficiales),
      // luego lo que se asignó en meses anteriores, luego palabras clave.
      const catExcel = catCol ? categorias.find((c) => normTxt(c) === normTxt(row[catCol])) : null;
      const catMemoria = categorias.includes(aprendidas[i]) ? aprendidas[i] : null;
      const catSugerida = sugerirCategoria(nombre, categorias);
      const [categoria, origen] = catExcel ? [catExcel, 'excel']
        : catMemoria ? [catMemoria, 'memoria']
        : catSugerida ? [catSugerida, 'sugerida'] : ['', ''];
      return {
        localId: newItemId(), titulo: nombre, pregunta: hint, incluida: true, categoria, origen,
        nombreOriginal: nombre,
        descuento: descCol ? (row[descCol] ?? '') : '', vence: venceCol ? (row[venceCol] ?? '') : '',
        opciones: OPCIONES_BASE.map((o) => ({ ...o })),
      };
    });
    const recordadas = generated.filter((it) => it.origen === 'memoria').length;
    if (recordadas) toast.success(`${recordadas} línea(s) tomaron la categoría de meses anteriores`);
    setItems(generated);
    setBusqueda(''); setCatFiltro(''); setSeleccion(new Set());
    setStep(2);
  };

  const updateItem = (id, patch) => setItems((its) => its.map((it) => (it.localId === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems((its) => its.filter((it) => it.localId !== id));
  const moveItem = (id, dir) => setItems((its) => {
    const idx = its.findIndex((it) => it.localId === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= its.length) return its;
    const copy = [...its];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    return copy;
  });
  // Línea creada a mano: entra ARRIBA de la lista (con 150 líneas, al final no
  // se vería) y con la categoría del filtro activo si hay uno.
  const listaRef = useRef(null);
  const addManualItem = () => {
    const categoria = catFiltro && catFiltro !== SIN_CATEGORIA ? catFiltro : '';
    setItems((its) => [{
      localId: newItemId(), titulo: '', pregunta: '', incluida: true, manual: true,
      categoria, origen: categoria ? 'manual' : '', descuento: '', vence: '',
      opciones: OPCIONES_BASE.map((o) => ({ ...o })),
    }, ...its]);
    setBusqueda('');
    if (catFiltro === SIN_CATEGORIA) setCatFiltro('');
    setTimeout(() => {
      listaRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      listaRef.current?.querySelector('[data-testid="promo-item-titulo"]')?.focus();
    }, 50);
  };

  // --- Agrupar a mano ---
  const [grupoDialog, setGrupoDialog] = useState(null); // { nombre } | null
  const abrirAgrupar = () => {
    const sel = items.filter((it) => seleccion.has(it.localId));
    if (sel.length < 2) { toast.error('Selecciona al menos 2 líneas para agruparlas'); return; }
    const cats = new Set(sel.map((it) => it.categoria));
    if (cats.size > 1 || !sel[0].categoria) {
      toast.error('Las líneas a agrupar deben tener la misma categoría — asígnales primero la misma');
      return;
    }
    // nombre sugerido: la marca en común, o el grupo que ya tenga alguna
    const marcas = new Set(sel.map((it) => normTxt(partirMarca(it.titulo)?.marca || '')));
    const existente = sel.find((it) => it.grupo && it.grupo !== SOLO)?.grupo;
    const sugerido = existente || (marcas.size === 1 && partirMarca(sel[0].titulo)?.marca) || '';
    setGrupoDialog({ nombre: sugerido });
  };
  const confirmarAgrupar = () => {
    const nombre = (grupoDialog?.nombre || '').trim();
    if (!nombre) { toast.error('Ponle un nombre al grupo'); return; }
    setItems((its) => its.map((it) => (seleccion.has(it.localId) ? { ...it, grupo: nombre } : it)));
    toast.success(`${seleccion.size} líneas agrupadas en "${nombre}"`);
    setSeleccion(new Set());
    setGrupoDialog(null);
  };

  const includedItems = items.filter((it) => it.incluida);
  const sinCategoria = includedItems.filter((it) => !it.categoria).length;

  const conteoCategorias = {};
  includedItems.forEach((it) => { const k = it.categoria || SIN_CATEGORIA; conteoCategorias[k] = (conteoCategorias[k] || 0) + 1; });

  // Preguntas finales (con o sin agrupar por marca) — lo que se publica.
  const preguntas = useMemo(() => armarPreguntas(includedItems.filter((it) => it.categoria), agruparMarca),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, agruparMarca]);
  const gruposMarca = preguntas.filter((q) => q.tipo === 'checklist');
  const grupoDeLinea = {}; // localId -> { nombre, n } del grupo en que terminó
  gruposMarca.forEach((q) => q.localIds.forEach((id) => { grupoDeLinea[id] = { nombre: q.titulo, n: q.localIds.length }; }));
  const preguntasPorCategoria = {};
  preguntas.forEach((q) => { preguntasPorCategoria[q.seccion] = (preguntasPorCategoria[q.seccion] || 0) + 1; });

  const itemsFiltrados = useMemo(() => {
    const q = normTxt(busqueda);
    return items.filter((it) => {
      if (catFiltro === SIN_CATEGORIA ? it.categoria : (catFiltro && it.categoria !== catFiltro)) return false;
      return !q || normTxt(`${it.titulo} ${it.pregunta}`).includes(q);
    });
  }, [items, busqueda, catFiltro]);

  const toggleSel = (id) => setSeleccion((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosFiltradosSel = itemsFiltrados.length > 0 && itemsFiltrados.every((it) => seleccion.has(it.localId));
  const toggleSelFiltrados = () => setSeleccion((s) => {
    const n = new Set(s);
    itemsFiltrados.forEach((it) => (todosFiltradosSel ? n.delete(it.localId) : n.add(it.localId)));
    return n;
  });
  const asignarSeleccion = (cat) => {
    setItems((its) => its.map((it) => (seleccion.has(it.localId) ? { ...it, categoria: cat, origen: 'manual' } : it)));
    toast.success(`${seleccion.size} línea(s) asignadas a ${cat}`);
    setSeleccion(new Set());
  };

  const irAConfigurar = () => {
    if (sinCategoria > 0) {
      toast.error(`Faltan ${sinCategoria} línea(s) por asignar a una categoría`);
      setCatFiltro(SIN_CATEGORIA);
      return;
    }
    setStep(3);
  };

  const publish = async () => {
    if (!titulo.trim()) { toast.error('Ponle un título al formulario'); return; }
    if (includedItems.length === 0) { toast.error('Agrega al menos una promoción'); return; }
    if (includedItems.some((it) => !it.titulo.trim())) { toast.error('Cada promoción necesita un nombre'); return; }
    if (sinCategoria > 0) { toast.error('Hay líneas sin categoría'); setStep(2); return; }
    if (!(todos || areas.length || cargos.length || userIds.length)) {
      toast.error('Indica a quién va dirigido el formulario'); return;
    }
    setSaving(true);
    try {
      const payload = {
        titulo: titulo.trim(), descripcion: descripcion.trim(),
        kind: 'promociones', periodo, serie_key: 'promociones-mes', status: 'publicado',
        audiencia: { todos, areas: todos ? [] : areas, cargos: todos ? [] : cargos, user_ids: todos ? [] : userIds },
        items: preguntas.map(({ localIds, ...q }) => q),
      };
      const { data } = await api.post('/formularios-custom', payload);
      toast.success('Formulario publicado correctamente');
      navigate(`/formularios/custom/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo publicar el formulario');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-[820px] mx-auto">
      <Stepper step={step} />

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>

          {/* Paso 1: Cargar Excel */}
          {step === 0 && (
            <div className="rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="font-heading text-lg font-semibold mb-1">Cargar Excel</h2>
                  <p className="text-sm text-muted-foreground">Sube el archivo con la lista de promociones del mes. Puedes traerlo con cualquier estructura de columnas.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="rounded-xl shrink-0" data-testid="promo-download-template">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" /> Descargar plantilla
                </Button>
              </div>

              {!file ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="promo-dropzone"
                  className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-[#16a34a] bg-[rgba(22,163,74,0.06)]' : 'border-border hover:bg-muted/40'}`}>
                  <UploadCloud className="h-9 w-9 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Arrastra tu archivo aquí</p>
                  <p className="text-xs text-muted-foreground mt-1">o haz clic para seleccionar · .xlsx / .xls</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0])} data-testid="promo-file-input" />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-4">
                  <FileSpreadsheet className="h-8 w-8 text-[#16a34a] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
                  </div>
                  <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-[#dc2626] shrink-0" aria-label="Quitar archivo" data-testid="promo-remove-file">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <Button onClick={inspectAndAdvance} disabled={!file || inspecting} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="promo-step1-next">
                  {inspecting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  {inspecting ? 'Leyendo…' : 'Siguiente'} {!inspecting && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>
          )}

          {/* Paso 2: Detectar columnas */}
          {step === 1 && excelData && (
            <div className="rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
              <h2 className="font-heading text-lg font-semibold mb-1">Detectar columnas</h2>
              <p className="text-sm text-muted-foreground mb-5">Se encontraron {excelData.total_rows} fila(s). Indica cuál columna trae el nombre de la promoción y cuáles quieres mostrar como referencia.</p>

              <div className="space-y-1.5 mb-5">
                <Label>Columna principal (nombre de la promoción/producto)</Label>
                <Select value={mainColumn} onValueChange={setMainColumn}>
                  <SelectTrigger className="h-11" data-testid="promo-main-column"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {excelData.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <Label className="mb-2 block">Columnas de referencia (opcional, se muestran junto a cada pregunta)</Label>
              <div className="space-y-1 mb-6 max-h-[220px] overflow-y-auto rounded-xl border p-2">
                {excelData.headers.filter((h) => h !== mainColumn).map((h) => (
                  <label key={h} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                    <Checkbox checked={refColumns.includes(h)}
                      onCheckedChange={(v) => setRefColumns((rc) => v ? [...rc, h] : rc.filter((x) => x !== h))} />
                    <span className="text-sm">{h}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(0)} className="rounded-xl"><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                <Button onClick={generateQuestions} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="promo-step2-next">
                  Generar preguntas <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 3: Generar / revisar preguntas */}
          {step === 2 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-[#16a34a]" /> Categorizar líneas ({includedItems.length})
                </h2>
                {sinCategoria > 0 ? (
                  <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-[rgba(220,38,38,0.1)] text-[#dc2626]" data-testid="promo-sin-categoria">
                    {sinCategoria} sin categoría
                  </span>
                ) : (
                  <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-[rgba(22,163,74,0.12)] text-[#16a34a]">Todas categorizadas</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Verifica a qué categoría va cada línea. Quien llene el formulario elige su categoría y solo ve esas líneas. La categoría viene sugerida — corrígela donde haga falta.
              </p>

              {/* Agrupar por marca: DYLLU - Escaleras + DYLLU - Herramientas… = 1 pregunta */}
              <div className="rounded-[14px] border bg-muted/30 p-3.5 mb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Agrupar líneas de la misma marca en una sola pregunta</p>
                    <p className="text-xs text-muted-foreground">
                      Solo si comparten marca («MARCA - línea») y categoría.{' '}
                      <span className="font-medium text-foreground">{includedItems.length} líneas → {preguntas.length} preguntas</span>
                      {sinCategoria > 0 && ' (sin contar las que faltan por categorizar)'}
                    </p>
                  </div>
                  <Switch checked={agruparMarca} onCheckedChange={setAgruparMarca} data-testid="promo-agrupar-marca" />
                </div>
                {agruparMarca && gruposMarca.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {gruposMarca.map((g) => (
                      <span key={`${g.seccion}|${g.titulo}`} title={g.opciones.map((o) => o.label).join('\n')}
                        className="text-[11px] rounded-full border bg-card px-2 py-0.5">
                        <span className="font-semibold">{g.titulo}</span> · {g.opciones.length} líneas · {g.seccion}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Filtro por categoría con conteos */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[['', 'Todas', includedItems.length], ...categorias.map((c) => [c, c, conteoCategorias[c] || 0]), [SIN_CATEGORIA, 'Sin categoría', conteoCategorias[SIN_CATEGORIA] || 0]].map(([val, label, n]) => (
                  <button key={label} type="button" onClick={() => setCatFiltro(val)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${catFiltro === val ? 'bg-[#1e395e] border-[#1e395e] text-white' : 'hover:bg-muted'} ${val === SIN_CATEGORIA && n > 0 && catFiltro !== val ? 'border-[#dc2626] text-[#dc2626]' : ''}`}
                    data-testid={`promo-cat-filter-${label}`}>
                    {label} <span className="opacity-70">{n}</span>
                  </button>
                ))}
              </div>

              {/* Buscar + asignación masiva */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 cursor-pointer">
                  <Checkbox checked={todosFiltradosSel} onCheckedChange={toggleSelFiltrados} data-testid="promo-select-filtered" />
                  Seleccionar {itemsFiltrados.length}
                </label>
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar (ignora mayúsculas y tildes)…"
                  className="h-9 flex-1 min-w-[180px]" data-testid="promo-item-search" />
                <Select value="" onValueChange={asignarSeleccion} disabled={seleccion.size === 0}>
                  <SelectTrigger className="h-9 w-[210px]" data-testid="promo-bulk-categoria">
                    <SelectValue placeholder={seleccion.size ? `Asignar ${seleccion.size} a…` : 'Asignar seleccionadas a…'} />
                  </SelectTrigger>
                  <SelectContent>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={abrirAgrupar}
                  disabled={seleccion.size < 2} data-testid="promo-agrupar-seleccion">
                  <Layers className="h-4 w-4 mr-1.5" /> Agrupar {seleccion.size >= 2 ? seleccion.size : ''}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={addManualItem} data-testid="promo-add-item-top">
                  <Plus className="h-4 w-4 mr-1.5" /> Crear línea
                </Button>
              </div>

              <div ref={listaRef} className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1 mb-4">
                {itemsFiltrados.map((it) => {
                  const idx = items.indexOf(it);
                  return (
                  <div key={it.localId} className={`rounded-[14px] border bg-card p-3.5 ${!it.incluida ? 'opacity-50' : ''} ${it.incluida && !it.categoria ? 'border-[#dc2626]/60' : ''}`} data-testid="promo-item-row">
                    <div className="flex items-start gap-2.5">
                      <div className="pt-2 shrink-0">
                        <Checkbox checked={seleccion.has(it.localId)} onCheckedChange={() => toggleSel(it.localId)} />
                      </div>
                      <div className="flex flex-col gap-1 pt-1 shrink-0">
                        <button onClick={() => moveItem(it.localId, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => moveItem(it.localId, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-col sm:flex-row gap-1.5">
                          <Input value={it.titulo} onChange={(e) => updateItem(it.localId, { titulo: e.target.value })}
                            placeholder="Nombre de la promoción" className="h-9 flex-1" data-testid="promo-item-titulo" />
                          <Select value={it.categoria || ''} onValueChange={(v) => updateItem(it.localId, { categoria: v, origen: 'manual' })}>
                            <SelectTrigger className={`h-9 sm:w-[160px] ${!it.categoria ? 'text-[#dc2626]' : ''}`} data-testid="promo-item-categoria">
                              <SelectValue placeholder="Categoría…" />
                            </SelectTrigger>
                            <SelectContent>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {it.manual ? (
                          <div className="flex gap-1.5">
                            <Input value={it.descuento || ''} onChange={(e) => updateItem(it.localId, { descuento: e.target.value, pregunta: e.target.value ? `Descuento: ${e.target.value}` : '' })}
                              placeholder="Descuento (ej. 15%)" className="h-8 text-xs w-[150px]" data-testid="promo-item-descuento" />
                            <Input value={it.vence || ''} onChange={(e) => updateItem(it.localId, { vence: e.target.value })}
                              placeholder="Vence (ej. 30/09/2026)" className="h-8 text-xs flex-1" />
                          </div>
                        ) : it.pregunta !== undefined && (
                          <Input value={it.pregunta} onChange={(e) => updateItem(it.localId, { pregunta: e.target.value })}
                            placeholder="Referencia (opcional)" className="h-8 text-xs text-muted-foreground" />
                        )}
                        <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-y-1">
                          {grupoDeLinea[it.localId] ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(30,57,94,0.1)] text-[#1e395e] dark:text-[#3cbef6] px-2 py-0.5 font-medium" data-testid="promo-item-grupo">
                              <Layers className="h-3 w-3" /> {grupoDeLinea[it.localId].nombre} · {grupoDeLinea[it.localId].n} líneas
                              {it.grupo && it.grupo !== SOLO ? (
                                <button type="button" onClick={() => updateItem(it.localId, { grupo: '' })} className="ml-1 underline hover:no-underline">quitar</button>
                              ) : (
                                <button type="button" onClick={() => updateItem(it.localId, { grupo: SOLO })} className="ml-1 underline hover:no-underline">separar</button>
                              )}
                            </span>
                          ) : it.grupo === SOLO ? (
                            <span>
                              Sí / No / No aplica · separada de su marca{' '}
                              <button type="button" onClick={() => updateItem(it.localId, { grupo: '' })} className="underline hover:no-underline">reagrupar</button>
                            </span>
                          ) : 'Sí / No / No aplica + Observaciones'}
                          {it.categoria && ORIGEN_LABEL[it.origen] && (
                            <span className={`ml-2 rounded-full px-1.5 py-0.5 ${it.origen === 'sugerida' ? 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]' : 'bg-muted'}`}>
                              {ORIGEN_LABEL[it.origen]}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Switch checked={it.incluida} onCheckedChange={(v) => updateItem(it.localId, { incluida: v })} data-testid="promo-item-toggle" />
                        <button onClick={() => removeItem(it.localId)} className="text-muted-foreground hover:text-[#dc2626]" data-testid="promo-item-remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
                {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay preguntas todavía.</p>}
                {items.length > 0 && itemsFiltrados.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ninguna línea con este filtro.</p>}
              </div>
              <Button type="button" variant="outline" onClick={addManualItem} className="w-full rounded-xl mb-6" data-testid="promo-add-item">
                <Plus className="h-4 w-4 mr-1.5" /> Crear línea manual
              </Button>

              <Dialog open={!!grupoDialog} onOpenChange={(o) => !o && setGrupoDialog(null)}>
                <DialogContent className="sm:max-w-[420px] rounded-[22px]">
                  <DialogHeader><DialogTitle className="font-heading">Agrupar {seleccion.size} líneas</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground -mt-1">
                    Se preguntarán juntas en una sola pregunta de casillas. Si usas el nombre de una marca que ya se agrupa (ej. DYLLU), se suman a ese grupo.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Nombre del grupo</Label>
                    <Input autoFocus value={grupoDialog?.nombre || ''} placeholder="Ej. Iluminación decorativa"
                      onChange={(e) => setGrupoDialog({ nombre: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmarAgrupar(); }} className="h-11" data-testid="promo-grupo-nombre" />
                    {gruposMarca.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {[...new Set(gruposMarca.map((g) => g.titulo))].map((n) => (
                          <button key={n} type="button" onClick={() => setGrupoDialog({ nombre: n })}
                            className="text-[11px] rounded-full border px-2 py-0.5 hover:bg-muted">{n}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" className="rounded-xl" onClick={() => setGrupoDialog(null)}>Cancelar</Button>
                    <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={confirmarAgrupar} data-testid="promo-grupo-confirmar">
                      <Layers className="h-4 w-4 mr-1.5" /> Agrupar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl"><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                <Button onClick={irAConfigurar} disabled={includedItems.length === 0} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="promo-step3-next">
                  Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 4: Configurar formulario + Asignar responsables */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-[18px] bg-card border shadow-card p-6 sm:p-8 space-y-4">
                <h2 className="font-heading text-lg font-semibold">Configuración del formulario</h2>
                <div className="space-y-1.5">
                  <Label>Título</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-11" data-testid="promo-titulo-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Mes</Label>
                    <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                      <SelectTrigger className="h-11" data-testid="promo-mes-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Año</Label>
                    <Input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value) || now.getFullYear())} className="h-11" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Período: <span className="font-medium text-foreground">{periodoLabel(periodo)}</span></p>
                <div className="space-y-1.5">
                  <Label>Descripción (opcional)</Label>
                  <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Notas para quienes lo van a llenar…" />
                </div>
              </div>

              <div className="rounded-[18px] bg-card border shadow-card p-6 sm:p-8 space-y-4">
                <h2 className="font-heading text-lg font-semibold">Asignar responsables</h2>
                <p className="text-sm text-muted-foreground -mt-2">Selecciona los usuarios que deberán completar el formulario</p>

                <div className="flex items-center justify-between rounded-xl border px-3.5 py-2.5">
                  <span className="text-sm">Todos en la empresa</span>
                  <Switch checked={todos} onCheckedChange={setTodos} data-testid="promo-audiencia-todos" />
                </div>

                {!todos && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Por área</Label>
                      <MultiPickerPopover icon={Building2} placeholder="Áreas (opcional)" options={AREAS} selected={areas} onChange={setAreas} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Por cargo</Label>
                      <MultiPickerPopover icon={Briefcase} placeholder="Cargos (opcional)" options={CARGOS} selected={cargos} onChange={setCargos} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Usuarios específicos</Label>
                      <UsersPickerPopover selected={userIds} onChange={setUserIds} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} className="rounded-xl"><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                <Button onClick={() => setStep(4)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="promo-step4-next">
                  Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 5: Publicar */}
          {step === 4 && (
            <div className="rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
              <h2 className="font-heading text-lg font-semibold mb-4">Publicar</h2>
              <div className="space-y-2.5 text-sm mb-6">
                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Título</span><span className="font-medium text-right">{titulo}</span></div>
                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Período</span><span className="font-medium">{periodoLabel(periodo)}</span></div>
                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Promociones</span><span className="font-medium">{includedItems.length} líneas → {preguntas.length} preguntas</span></div>
                <div className="border-b pb-2">
                  <span className="text-muted-foreground">Preguntas por categoría</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {categorias.filter((c) => preguntasPorCategoria[c]).map((c) => (
                      <span key={c} className="text-xs rounded-full bg-muted px-2.5 py-1">
                        {c} <span className="font-semibold">{preguntasPorCategoria[c]}</span>
                        {preguntasPorCategoria[c] !== conteoCategorias[c] && <span className="text-muted-foreground"> ({conteoCategorias[c]} líneas)</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Audiencia</span>
                  <span className="font-medium text-right">
                    {todos ? 'Todos en la empresa' : [
                      areas.length ? `${areas.length} área(s)` : null,
                      cargos.length ? `${cargos.length} cargo(s)` : null,
                      userIds.length ? `${userIds.length} usuario(s)` : null,
                    ].filter(Boolean).join(' · ') || 'Sin definir'}
                  </span>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)} className="rounded-xl" disabled={saving}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                <Button onClick={publish} disabled={saving} className="rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" data-testid="promo-publish-button">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Rocket className="h-4 w-4 mr-1.5" />}
                  {saving ? 'Publicando…' : 'Publicar'}
                </Button>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
