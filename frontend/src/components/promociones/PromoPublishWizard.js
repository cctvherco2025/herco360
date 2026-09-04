import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  UploadCloud, FileSpreadsheet, X, ChevronLeft, ChevronRight, ListChecks,
  Trash2, Plus, ArrowUp, ArrowDown, Check, Users as UsersIcon, Building2,
  Briefcase, Rocket, Loader2,
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
import { periodoLabel } from '@/pages/PromocionesHome';

const STEP_LABELS = ['Cargar Excel', 'Detectar columnas', 'Generar preguntas', 'Configurar', 'Publicar'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const OPCIONES_BASE = [{ label: 'Sí' }, { label: 'No' }, { label: 'No aplica' }];
const newItemId = () => `${Date.now()}-${Math.random()}`;

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const generateQuestions = () => {
    if (!mainColumn) { toast.error('Selecciona la columna principal'); return; }
    const cols = refColumns.filter((c) => c !== mainColumn);
    const generated = excelData.rows.map((row) => {
      const nombre = (row[mainColumn] ?? '').toString().trim() || 'Promoción sin nombre';
      const hint = cols.map((c) => (row[c] ?? '') !== '' ? `${c}: ${row[c]}` : null).filter(Boolean).join(' · ');
      return {
        localId: newItemId(), titulo: nombre, pregunta: hint, incluida: true,
        opciones: OPCIONES_BASE.map((o) => ({ ...o })),
      };
    });
    setItems(generated);
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
  const addManualItem = () => setItems((its) => [...its, {
    localId: newItemId(), titulo: '', pregunta: '', incluida: true, opciones: OPCIONES_BASE.map((o) => ({ ...o })),
  }]);

  const includedItems = items.filter((it) => it.incluida);

  const publish = async () => {
    if (!titulo.trim()) { toast.error('Ponle un título al formulario'); return; }
    if (includedItems.length === 0) { toast.error('Agrega al menos una promoción'); return; }
    if (includedItems.some((it) => !it.titulo.trim())) { toast.error('Cada promoción necesita un nombre'); return; }
    if (!(todos || areas.length || cargos.length || userIds.length)) {
      toast.error('Indica a quién va dirigido el formulario'); return;
    }
    setSaving(true);
    try {
      const payload = {
        titulo: titulo.trim(), descripcion: descripcion.trim(),
        kind: 'promociones', periodo, serie_key: 'promociones-mes', status: 'publicado',
        audiencia: { todos, areas: todos ? [] : areas, cargos: todos ? [] : cargos, user_ids: todos ? [] : userIds },
        items: includedItems.map((it) => ({
          seccion: 'Promociones', titulo: it.titulo.trim(),
          pregunta: it.pregunta || '¿La promoción está visible en tienda?',
          tipo: 'opcion_unica', scored: false, permite_foto: true,
          opciones: it.opciones,
        })),
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
              <h2 className="font-heading text-lg font-semibold mb-1">Cargar Excel</h2>
              <p className="text-sm text-muted-foreground mb-5">Sube el archivo con la lista de promociones del mes. Puedes traerlo con cualquier estructura de columnas.</p>

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
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-[#16a34a]" /> Preguntas generadas ({includedItems.length})
                </h2>
              </div>
              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1 mb-4">
                {items.map((it, idx) => (
                  <div key={it.localId} className={`rounded-[14px] border bg-card p-3.5 ${!it.incluida ? 'opacity-50' : ''}`} data-testid="promo-item-row">
                    <div className="flex items-start gap-2.5">
                      <div className="flex flex-col gap-1 pt-1 shrink-0">
                        <button onClick={() => moveItem(it.localId, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button onClick={() => moveItem(it.localId, 1)} disabled={idx === items.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <Input value={it.titulo} onChange={(e) => updateItem(it.localId, { titulo: e.target.value })}
                          placeholder="Nombre de la promoción" className="h-9" data-testid="promo-item-titulo" />
                        {it.pregunta !== undefined && (
                          <Input value={it.pregunta} onChange={(e) => updateItem(it.localId, { pregunta: e.target.value })}
                            placeholder="Referencia (opcional)" className="h-8 text-xs text-muted-foreground" />
                        )}
                        <p className="text-[11px] text-muted-foreground">Sí / No / No aplica + Observaciones</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Switch checked={it.incluida} onCheckedChange={(v) => updateItem(it.localId, { incluida: v })} data-testid="promo-item-toggle" />
                        <button onClick={() => removeItem(it.localId)} className="text-muted-foreground hover:text-[#dc2626]" data-testid="promo-item-remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay preguntas todavía.</p>}
              </div>
              <Button type="button" variant="outline" onClick={addManualItem} className="w-full rounded-xl mb-6" data-testid="promo-add-item">
                <Plus className="h-4 w-4 mr-1.5" /> Agregar pregunta
              </Button>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-xl"><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
                <Button onClick={() => setStep(3)} disabled={includedItems.length === 0} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="promo-step3-next">
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
                <div className="flex justify-between border-b pb-2"><span className="text-muted-foreground">Promociones</span><span className="font-medium">{includedItems.length}</span></div>
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
