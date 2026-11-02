import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2, Repeat, ImagePlus, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import {
  TIPOS, CATEGORIAS, CON_OPCIONES, OPCIONES_FIJAS, PUNTUABLES, SIN_RESPUESTA, DE_ARCHIVOS, CON_VALIDACION, EVIDENCIAS,
  SEGUIMIENTO_OPCIONES, SEGUIMIENTO_NUMERO, EN_FILAS, SIN_EVIDENCIA, SIN_PREDETERMINADO, OPERACIONES, FORMATOS_CALCULO, CAMPOS_FILA,
  uid, maximoDe, cambiarTipo, nombreDe, nuevaColumna,
} from '@/lib/formularios';
import EditorCondicion from '@/components/formularios/Condicion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AuthedImg } from '@/components/customform/CustomFormHistorial';

export const Icono = ({ tipo, grande = false }) => (
  <span className={`${grande ? 'h-7 min-w-[32px] text-xs' : 'h-6 min-w-[30px] text-[11px]'} px-1 rounded-md bg-[#e8eef7] text-[#1e395e] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6] font-semibold grid place-items-center shrink-0`}
    aria-hidden="true">{TIPOS[tipo]?.[1]}</span>
);

const Campo = ({ label, children, nota }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
    {label}
    {children}
    {nota && <span className="font-normal">{nota}</span>}
  </label>
);

const TABS = [['general', 'General'], ['validacion', 'Validación'], ['condiciones', 'Condiciones'], ['apariencia', 'Apariencia']];
const numeroOVacio = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export default function Propiedades({ it, formId, onCambio, anteriores = [], numericas = [], porId = {}, seguimientos, onConfig }) {
  const [tab, setTab] = useState('general');
  if (!it) {
    return (
      <div className="text-center py-10 px-4">
        <p className="font-heading font-semibold">Propiedades</p>
        <p className="text-sm text-muted-foreground mt-1">Toca una pregunta del lienzo para editarla.</p>
      </div>
    );
  }
  // clave: de qué campo es el cambio (los cambios seguidos del mismo campo se deshacen juntos)
  const set = (patch, clave) => onCambio({ ...it, ...patch }, clave || Object.keys(patch).join(','));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Icono tipo={it.tipo} grande />
        <div className="flex-1 min-w-0">
          <h2 className="font-heading font-semibold text-[15px] leading-tight">Propiedades</h2>
          <p className="text-xs text-muted-foreground truncate">{TIPOS[it.tipo][0]}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="h-8 px-2.5 rounded-lg border text-xs text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" /> Cambiar tipo
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto rounded-xl w-60">
            {CATEGORIAS.map(([cat, tipos], i) => (
              <React.Fragment key={cat}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">{cat}</DropdownMenuLabel>
                {tipos.map((t) => (
                  <DropdownMenuItem key={t} disabled={t === it.tipo} onSelect={() => onCambio(cambiarTipo(it, t), 'tipo')} className="gap-2 cursor-pointer">
                    <Icono tipo={t} /> {TIPOS[t][0]}
                  </DropdownMenuItem>
                ))}
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div role="tablist" aria-label="Propiedades" className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
        {TABS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex-1 h-8 rounded-lg text-xs ${tab === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
        ))}
      </div>

      {tab === 'general' && <General it={it} set={set} formId={formId} numericas={numericas} porId={porId} />}
      {tab === 'validacion' && <Validacion it={it} set={set} />}
      {tab === 'condiciones' && (
        <div className="flex flex-col gap-4">
          <EditorCondicion condicion={it.condicion || null} onCambio={(c, clave) => set({ condicion: c }, clave)}
            anteriores={anteriores} porId={porId} formId={formId}
            verbo={SIN_RESPUESTA.has(it.tipo) ? 'Mostrar este elemento' : 'Mostrar esta pregunta'} />
          {(SEGUIMIENTO_OPCIONES.has(it.tipo) || SEGUIMIENTO_NUMERO.has(it.tipo)) && (
            <Seguimiento it={it} set={set} cfg={seguimientos} onConfig={onConfig} />
          )}
          <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-1 border-t pt-2.5">
            <li>Si queda oculta no se exige, aunque sea obligatoria, y su respuesta no se guarda.</li>
            <li>Si borras o cambias una pregunta que usa una regla, te avisamos antes.</li>
          </ul>
        </div>
      )}
      {tab === 'apariencia' && <Apariencia it={it} set={set} />}
      <p className="text-[11px] text-muted-foreground border-t pt-2.5">ID interno: <span className="font-mono">{it.id.slice(0, 8)}</span> · se conserva al editar para no romper respuestas.</p>
    </div>
  );
}

const REVISA_TEXTO = { creador: 'quien creó el formulario', jefe: 'el jefe de quien llenó', persona: 'la persona elegida' };

// Esta pregunta abre un seguimiento (Formulario › Seguimientos) si se contesta así.
function Seguimiento({ it, set, cfg, onConfig }) {
  const s = it.seguimiento;
  const porOpciones = SEGUIMIENTO_OPCIONES.has(it.tipo);
  const activar = () => set({ seguimiento: s ? null : porOpciones
    ? { valores: [((it.opciones || []).find((o) => o.falla) || (it.opciones || [])[it.opciones.length - 1] || {}).id].filter(Boolean) }
    : { op: 'mayor', valor: '' } }, 'seg.on');
  return (
    <div className="flex flex-col gap-2.5 border-t pt-3">
      <Interruptor label="Abrir un seguimiento" nota="Va a Formulario › Seguimientos; lo corrige quien llenó" valor={!!s} onCambio={activar} />
      {s && porOpciones && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">cuando la respuesta sea:</span>
          <div role="group" aria-label="Respuestas que abren seguimiento" className="flex flex-wrap gap-1.5">
            {(it.opciones || []).map((o) => {
              const on = (s.valores || []).includes(o.id);
              const valores = on ? s.valores.filter((v) => v !== o.id) : [...(s.valores || []), o.id];
              return (
                <button key={o.id} type="button" role="checkbox" aria-checked={on} onClick={() => set({ seguimiento: valores.length ? { valores } : null }, 'seg.valores')}
                  className={`h-8 px-2.5 rounded-lg border text-xs ${on ? 'border-[#c2410c] bg-[#fff3e6] text-[#8a4b0f] font-semibold dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b]' : 'hover:bg-muted'}`}>
                  {on ? '✓ ' : ''}{o.label || 'Opción'}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {s && !porOpciones && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
          cuando la respuesta
          <select value={s.op} onChange={(e) => set({ seguimiento: { ...s, op: e.target.value } }, 'seg.op')} aria-label="Operador"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
            <option value="mayor">sea mayor que</option><option value="menor">sea menor que</option><option value="igual">sea igual a</option>
          </select>
          <Input type="number" value={s.valor ?? ''} onChange={(e) => set({ seguimiento: { ...s, valor: e.target.value } }, 'seg.valor')}
            aria-label="Límite" className="h-9 w-20 text-sm text-foreground" />
        </div>
      )}
      {s && (
        <p className="text-[11px] text-muted-foreground">
          Uno por respuesta, con todo lo que lo pidió. Lo revisa {REVISA_TEXTO[cfg?.revisa] || REVISA_TEXTO.creador}; plazo {cfg?.plazo_horas === 168 ? '1 semana' : `${cfg?.plazo_horas || 48} h`}.{' '}
          {onConfig && <button type="button" onClick={onConfig} className="underline text-[#1e395e] dark:text-[#3cbef6]">Cambiar</button>}
        </p>
      )}
    </div>
  );
}

function Apariencia({ it, set }) {
  const a = it.apariencia || {};
  const conOpciones = CON_OPCIONES.has(it.tipo) && it.tipo !== 'lista';
  const segmento = (label, valor, opciones, cambiar) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
        {opciones.map(([k, n]) => (
          <button key={k} type="button" role="radio" aria-checked={valor === k} onClick={() => cambiar(k)}
            className={`flex-1 h-8 rounded-lg text-xs ${valor === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {segmento('Ancho', a.ancho || 'auto', [['auto', 'Como el form'], ['completo', 'Completo'], ['mitad', 'Mitad'], ['tercio', 'Tercio']],
        (k) => set({ apariencia: { ...a, ancho: k } }, 'apariencia.ancho'))}
      {conOpciones && segmento('Opciones', a.opciones || 'lista', [['lista', 'En lista'], ['fila', 'En fila'], ['cuadricula', 'Cuadrícula']],
        (k) => set({ apariencia: { ...a, opciones: k } }, 'apariencia.opciones'))}
      {conOpciones && !OPCIONES_FIJAS.has(it.tipo) && <p className="text-[11px] text-muted-foreground">Para opciones con imagen, súbela en General › Opciones (se ve mejor en cuadrícula).</p>}
      <p className="text-[11px] text-muted-foreground">En teléfono todas las preguntas van a lo ancho. Los colores y letras se cambian en la pestaña Diseño.</p>
    </div>
  );
}

function General({ it, set, formId, numericas, porId }) {
  const conRespuesta = !SIN_RESPUESTA.has(it.tipo);
  const etiqueta = { encabezado: 'Texto del encabezado', instrucciones: 'Título (opcional)', imagen: 'Pie de imagen (opcional)' }[it.tipo] || 'Pregunta';
  if (it.tipo === 'separador') return <p className="text-sm text-muted-foreground">Una línea para separar bloques de preguntas. No tiene propiedades.</p>;
  return (
    <div className="flex flex-col gap-3">
      <Campo label={etiqueta}>
        <Input value={it.titulo} onChange={(e) => set({ titulo: e.target.value })} className="h-10 text-sm text-foreground" placeholder={conRespuesta ? 'Escribe la pregunta' : ''} />
      </Campo>
      {it.tipo === 'instrucciones' ? (
        <Campo label="Instrucciones">
          <Textarea rows={5} value={it.config?.texto || ''} onChange={(e) => set({ config: { ...it.config, texto: e.target.value } }, 'config.texto')} className="text-sm text-foreground" placeholder="Lo que la persona debe saber antes de seguir" />
        </Campo>
      ) : (
        <Campo label="Descripción">
          <Textarea rows={2} value={it.descripcion || ''} onChange={(e) => set({ descripcion: e.target.value })} className="text-sm text-foreground" placeholder="Opcional: qué se espera en esta pregunta" />
        </Campo>
      )}
      {it.tipo === 'imagen' && <ImagenInformativa it={it} set={set} formId={formId} />}
      {conRespuesta && (
        <Campo label="Texto de ayuda">
          <Input value={it.ayuda || ''} onChange={(e) => set({ ayuda: e.target.value })} className="h-10 text-sm text-foreground" placeholder="Se muestra debajo, en pequeño" />
        </Campo>
      )}
      {conRespuesta && it.tipo !== 'calculado' && (
        <Interruptor label="Obligatoria" valor={!!it.obligatoria} onCambio={(v) => set({ obligatoria: v })} />
      )}
      {PUNTUABLES.has(it.tipo) && (
        <Interruptor label="Con puntaje" nota={it.puntaje ? `Vale hasta ${maximoDe(it)} pts` : 'Suma al puntaje del formulario'}
          valor={!!it.puntaje} onCambio={(v) => set({ puntaje: v })} />
      )}
      {(it.tipo === 'escala' || it.tipo === 'estrellas') && (
        <Campo label={it.tipo === 'escala' ? 'Escala de 1 a' : 'Cantidad de estrellas'}>
          <select value={it.config?.max} onChange={(e) => set({ config: { ...it.config, max: Number(e.target.value) } }, 'config.max')}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground w-28">
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Campo>
      )}
      {CON_OPCIONES.has(it.tipo) && <Opciones it={it} set={set} formId={formId} />}
      {it.tipo === 'moneda' && <Simbolo it={it} set={set} />}
      {it.tipo === 'articulo' && <Articulos it={it} set={set} />}
      {it.tipo === 'matriz' && <ConfigMatriz it={it} set={set} />}
      {it.tipo === 'calculado' && <ConfigCalculado it={it} set={set} numericas={numericas} porId={porId} />}
      {EN_FILAS.has(it.tipo) && <ConfigFilas it={it} set={set} />}
      {['foto', 'camara', 'archivo'].includes(it.tipo) && (
        <Interruptor label={it.tipo === 'archivo' ? 'Permitir varios archivos' : 'Permitir varias fotos'} valor={!!it.config?.varios}
          onCambio={(v) => set({ config: { ...it.config, varios: v } }, 'config.varios')} />
      )}
      {conRespuesta && !DE_ARCHIVOS.has(it.tipo) && !SIN_EVIDENCIA.has(it.tipo) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Foto de evidencia</span>
          <div role="radiogroup" aria-label="Foto de evidencia" className="flex flex-wrap gap-1">
            {EVIDENCIAS.filter(([k]) => k !== 'si_no_cumple' || it.tipo === 'cumple').map(([k, n]) => (
              <button key={k} type="button" role="radio" aria-checked={(it.evidencia || 'no') === k} onClick={() => set({ evidencia: k })}
                className={`h-8 px-2.5 rounded-lg border text-xs ${(it.evidencia || 'no') === k ? 'border-[#1e395e] bg-[#1e395e] text-white dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0b1424] font-semibold' : 'hover:bg-muted'}`}>{n}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Interruptor({ label, nota, valor, onCambio }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[40px]">
      <span className="text-sm font-medium">{label}{nota && <span className="block text-xs font-normal text-muted-foreground">{nota}</span>}</span>
      <Switch checked={valor} onCheckedChange={onCambio} aria-label={label} />
    </div>
  );
}

function ImagenOpcion({ o, formId, onCambio }) {
  const ref = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Sube una imagen'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const { data } = await api.post(`/formularios-v2/${formId}/imagenes`, fd);
      onCambio(data.imagen_id);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo subir la imagen'); }
    finally { setSubiendo(false); }
  };
  return (
    <>
      {o.imagen_id ? (
        <button type="button" onClick={() => onCambio(null)} title="Quitar imagen" aria-label={`Quitar imagen de ${o.label}`} className="relative h-8 w-8 shrink-0">
          <AuthedImg url={`/formularios-v2/${formId}/imagenes/${o.imagen_id}`} className="h-8 w-8 rounded object-cover border" />
        </button>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={subiendo} title="Imagen de la opción" aria-label={`Imagen de ${o.label || 'la opción'}`}
          className="h-8 w-7 grid place-items-center rounded text-muted-foreground hover:bg-muted shrink-0">
          {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
}

function Opciones({ it, set, formId }) {
  const fijas = OPCIONES_FIJAS.has(it.tipo);
  const ops = it.opciones || [];
  const cambiar = (i, patch, clave) => set({ opciones: ops.map((o, j) => (j === i ? { ...o, ...patch } : o)) }, `op.${ops[i].id}.${clave}`);
  const mover = (i, d) => {
    const n = [...ops]; const [o] = n.splice(i, 1); n.splice(i + d, 0, o); set({ opciones: n }, 'op.orden');
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Opciones{fijas && ' (fijas)'}</span>
        {it.puntaje && <span>Puntos</span>}
      </div>
      {ops.map((o, i) => (
        <div key={o.id} className="flex gap-1.5 items-center">
          <Input value={o.label} readOnly={fijas} onChange={(e) => cambiar(i, { label: e.target.value }, 'label')} aria-label={`Opción ${i + 1}`}
            className={`h-9 flex-1 min-w-0 text-sm text-foreground ${fijas ? 'bg-muted' : ''}`} />
          {it.puntaje && (
            o.na ? <span className="w-14 text-center text-xs text-muted-foreground" title="No aplica no cuenta en el puntaje">—</span>
              : <Input type="number" inputMode="decimal" value={o.pts ?? ''} onChange={(e) => cambiar(i, { pts: numeroOVacio(e.target.value) }, 'pts')}
                aria-label={`Puntos de ${o.label || `la opción ${i + 1}`}`} className="h-9 w-14 px-2 text-right text-sm text-foreground" />
          )}
          {!fijas && it.tipo !== 'lista' && formId && (
            <ImagenOpcion o={o} formId={formId} onCambio={(imagen_id) => cambiar(i, { imagen_id }, 'imagen')} />
          )}
          {!fijas && (
            <div className="flex">
              <button type="button" aria-label="Subir opción" disabled={i === 0} onClick={() => mover(i, -1)} className="h-8 w-7 grid place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Bajar opción" disabled={i === ops.length - 1} onClick={() => mover(i, 1)} className="h-8 w-7 grid place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Quitar ${o.label || 'opción'}`} disabled={ops.length <= 1} onClick={() => set({ opciones: ops.filter((_, j) => j !== i) }, 'op.quitar')}
                className="h-8 w-7 grid place-items-center rounded text-[#dc2626] hover:bg-muted disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      ))}
      {!fijas && (
        <button type="button" onClick={() => set({ opciones: [...ops, { id: uid(), label: `Opción ${ops.length + 1}`, pts: null, na: false, falla: false }] }, 'op.agregar')}
          className="self-start h-8 px-2.5 rounded-lg border border-dashed text-xs text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Opción
        </button>
      )}
      {it.tipo === 'cumple' && <p className="text-[11px] text-muted-foreground">«No aplica» no cuenta para el puntaje.</p>}
    </div>
  );
}

function Simbolo({ it, set }) {
  return (
    <Campo label="Símbolo de la moneda">
      <Input value={it.config?.simbolo ?? ''} maxLength={5} onChange={(e) => set({ config: { ...it.config, simbolo: e.target.value } }, 'config.simbolo')} className="h-10 w-24 text-sm text-foreground" placeholder="L" />
    </Campo>
  );
}

// Lista propia del formulario: se pega de una vez, un artículo por línea.
function Articulos({ it, set }) {
  const lista = it.config?.lista || [];
  const cuantos = lista.filter((x) => x.trim()).length;
  return (
    <Campo label="Artículos, uno por línea" nota={`${cuantos} ${cuantos === 1 ? 'artículo' : 'artículos'}. Quien llena busca dentro de esta lista.`}>
      <Textarea rows={7} value={lista.join('\n')} onChange={(e) => set({ config: { ...it.config, lista: e.target.value.split('\n') } }, 'config.lista')}
        className="text-sm text-foreground" placeholder={'Aceite 1 litro\nArroz 5 libras\nAzúcar 2 libras'} />
    </Campo>
  );
}

const BOTON_MOVER = 'h-8 w-7 grid place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30';
const BOTON_QUITAR = 'h-8 w-7 grid place-items-center rounded text-[#dc2626] hover:bg-muted disabled:opacity-30';
const BOTON_AGREGAR = 'self-start h-8 px-2.5 rounded-lg border border-dashed text-xs text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center gap-1';
const mover = (lista, i, d) => { const n = [...lista]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; };

function ConfigMatriz({ it, set }) {
  const cfg = it.config || {};
  const lista = (clave, titulo, nuevo, conPuntos) => {
    const items = cfg[clave] || [];
    const cambiar = (n, parte) => set({ config: { ...cfg, [clave]: n } }, `matriz.${clave}.${parte}`);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{titulo}</span>{conPuntos && <span>Puntos</span>}
        </div>
        {items.map((x, i) => (
          <div key={x.id} className="flex gap-1 items-center">
            <Input value={x.label} aria-label={`${titulo} ${i + 1}`} onChange={(e) => cambiar(items.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)), `${x.id}.label`)}
              className="h-9 flex-1 min-w-0 text-sm text-foreground" />
            {conPuntos && (
              <Input type="number" inputMode="decimal" value={x.pts ?? ''} aria-label={`Puntos de ${x.label}`} className="h-9 w-14 px-2 text-right text-sm text-foreground"
                onChange={(e) => cambiar(items.map((y, j) => (j === i ? { ...y, pts: numeroOVacio(e.target.value) } : y)), `${x.id}.pts`)} />
            )}
            <button type="button" aria-label={`Subir ${x.label}`} disabled={i === 0} onClick={() => cambiar(mover(items, i, -1), 'orden')} className={BOTON_MOVER}><ChevronUp className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={`Bajar ${x.label}`} disabled={i === items.length - 1} onClick={() => cambiar(mover(items, i, 1), 'orden')} className={BOTON_MOVER}><ChevronDown className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={`Quitar ${x.label}`} disabled={items.length <= 1} onClick={() => cambiar(items.filter((_, j) => j !== i), 'quitar')} className={BOTON_QUITAR}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <button type="button" onClick={() => cambiar([...items, nuevo(items.length + 1)], 'agregar')} className={BOTON_AGREGAR}><Plus className="h-3.5 w-3.5" /> Agregar</button>
      </div>
    );
  };
  return (
    <>
      {lista('filas', 'Filas: lo que se evalúa', (n) => ({ id: uid(), label: `Punto ${n}` }), false)}
      {lista('columnas', 'Columnas: la nota', (n) => ({ id: uid(), label: `Nota ${n}`, pts: null }), !!it.puntaje)}
      {it.puntaje && <p className="text-[11px] text-muted-foreground">Cada fila vale lo que su mejor columna. Las filas sin contestar no cuentan.</p>}
    </>
  );
}

function ConfigCalculado({ it, set, numericas, porId }) {
  const cfg = it.config || {};
  const ids = cfg.preguntas || [];
  const op = OPERACIONES.find(([k]) => k === cfg.operacion) || OPERACIONES[0];
  const cambiar = (patch, clave) => set({ config: { ...cfg, ...patch } }, `calc.${clave}`);
  const nombres = ids.map((id) => (porId[id] ? nombreDe(porId[id]) : '(pregunta que ya no existe)'));
  const lejos = ids.filter((id) => !numericas.some((x) => x.id === id));
  return (
    <>
      <Campo label="Operación">
        <select value={op[0]} onChange={(e) => cambiar({ operacion: e.target.value }, 'op')} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
          {OPERACIONES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </Campo>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Preguntas, en este orden</span>
        {numericas.length === 0 && <p className="text-xs text-muted-foreground">Primero agrega, antes de este campo, preguntas de número, moneda o porcentaje.</p>}
        <div role="group" aria-label="Preguntas del cálculo" className="flex flex-wrap gap-1.5">
          {numericas.map((p) => {
            const on = ids.includes(p.id);
            return (
              <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={() => cambiar({ preguntas: on ? ids.filter((x) => x !== p.id) : [...ids, p.id] }, 'preguntas')}
                className={`h-8 px-2.5 rounded-lg border text-xs max-w-full truncate ${on ? 'border-[#1e395e] bg-[#1e395e] text-white dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0b1424] font-semibold' : 'hover:bg-muted'}`}>
                {on ? `${ids.indexOf(p.id) + 1}. ` : ''}{nombreDe(p)}
              </button>
            );
          })}
        </div>
        {lejos.length > 0 && (
          <p className="text-[11px] text-[#b45309] flex items-center gap-1 flex-wrap">
            <AlertTriangle className="h-3.5 w-3.5" /> Solo se pueden usar preguntas de número que vayan antes.
            <button type="button" className="underline" onClick={() => cambiar({ preguntas: ids.filter((id) => !lejos.includes(id)) }, 'preguntas')}>Quitar las demás</button>
          </p>
        )}
      </div>
      {ids.length >= 2 && (
        <p className="text-xs rounded-xl bg-[rgba(0,165,223,0.08)] p-2.5">
          {cfg.operacion === 'promedio' ? `Promedio de ${nombres.join(', ')}` : nombres.join(` ${op[2]} `)}
        </p>
      )}
      <Campo label="Mostrar como">
        <select value={cfg.formato || 'numero'} onChange={(e) => cambiar({ formato: e.target.value }, 'formato')} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
          {FORMATOS_CALCULO.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </Campo>
      {cfg.formato === 'moneda' && <Simbolo it={it} set={set} />}
      <p className="text-[11px] text-muted-foreground">
        Se llena solo y nadie lo puede cambiar. Si falta un dato: suma y promedio siguen con lo que haya; resta necesita la primera pregunta; multiplicación y división, todas.
      </p>
    </>
  );
}

// Tabla y grupo repetible: se configuran igual, columnas o campos.
function ConfigFilas({ it, set }) {
  const cfg = it.config || {};
  const tabla = it.tipo === 'tabla';
  const columnas = cfg.columnas || [];
  const cambiar = (n, parte) => set({ config: { ...cfg, columnas: n } }, `filas.${parte}`);
  const poner = (i, patch, parte) => cambiar(columnas.map((c, j) => (j === i ? { ...c, ...patch } : c)), `${columnas[i].id}.${parte}`);
  const quien = tabla ? 'Columna' : 'Campo';
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">{tabla ? 'Columnas' : 'Campos de cada bloque'}</span>
        {columnas.map((c, i) => (
          <div key={c.id} className="rounded-xl border p-2.5 flex flex-col gap-2">
            <div className="flex gap-1 items-center">
              <Input value={c.nombre} aria-label={`${quien} ${i + 1}`} placeholder={`Nombre ${tabla ? 'de la columna' : 'del campo'}`} onChange={(e) => poner(i, { nombre: e.target.value }, 'nombre')}
                className="h-9 flex-1 min-w-0 text-sm text-foreground" />
              <button type="button" aria-label={`Subir ${c.nombre}`} disabled={i === 0} onClick={() => cambiar(mover(columnas, i, -1), 'orden')} className={BOTON_MOVER}><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Bajar ${c.nombre}`} disabled={i === columnas.length - 1} onClick={() => cambiar(mover(columnas, i, 1), 'orden')} className={BOTON_MOVER}><ChevronDown className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={`Quitar ${c.nombre}`} disabled={columnas.length <= 1} onClick={() => cambiar(columnas.filter((_, j) => j !== i), 'quitar')} className={BOTON_QUITAR}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <select value={c.tipo} aria-label={`Tipo de ${c.nombre}`} onChange={(e) => poner(i, { tipo: e.target.value, ...(e.target.value === 'lista' ? { opciones: c.opciones || [] } : {}) }, 'tipo')}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                {CAMPOS_FILA[it.tipo].map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs">
                <Switch checked={!!c.obligatoria} onCheckedChange={(v) => poner(i, { obligatoria: v }, 'obligatoria')} aria-label={`${c.nombre} obligatoria`} /> Obligatoria
              </label>
            </div>
            {c.tipo === 'lista' && (
              <Textarea rows={3} value={(c.opciones || []).join('\n')} aria-label={`Opciones de ${c.nombre}`} placeholder="Opciones, una por línea"
                onChange={(e) => poner(i, { opciones: e.target.value.split('\n') }, 'opciones')} className="text-sm text-foreground" />
            )}
          </div>
        ))}
        {columnas.length < 12 && (
          <button type="button" onClick={() => cambiar([...columnas, nuevaColumna(`${quien} ${columnas.length + 1}`)], 'agregar')} className={BOTON_AGREGAR}>
            <Plus className="h-3.5 w-3.5" /> {tabla ? 'Columna' : 'Campo'}
          </button>
        )}
      </div>
      <Campo label="Máximo de filas" nota="Una fila que quede vacía no cuenta.">
        <Input type="number" min={1} max={100} value={cfg.max_filas ?? ''} onChange={(e) => set({ config: { ...cfg, max_filas: numeroOVacio(e.target.value) } }, 'filas.max')} className="h-10 w-24 text-sm text-foreground" />
      </Campo>
      {!tabla && (
        <Campo label="Texto del botón">
          <Input value={cfg.boton ?? ''} maxLength={40} onChange={(e) => set({ config: { ...cfg, boton: e.target.value } }, 'filas.boton')} className="h-10 text-sm text-foreground" placeholder="Agregar otro" />
        </Campo>
      )}
    </>
  );
}

function ImagenInformativa({ it, set, formId }) {
  const ref = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Sube una imagen (JPG, PNG o WEBP)'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const { data } = await api.post(`/formularios-v2/${formId}/imagenes`, fd);
      set({ config: { ...it.config, imagen_id: data.imagen_id } }, 'config.imagen');
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo subir la imagen'); }
    finally { setSubiendo(false); }
  };
  return (
    <div className="flex flex-col gap-2">
      {it.config?.imagen_id && <AuthedImg url={`/formularios-v2/${formId}/imagenes/${it.config.imagen_id}`} className="w-full max-h-48 object-contain rounded-xl border bg-muted" />}
      <button type="button" onClick={() => ref.current?.click()} disabled={subiendo}
        className="h-10 rounded-lg border border-dashed text-sm text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center justify-center gap-1.5">
        {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} {it.config?.imagen_id ? 'Cambiar imagen' : 'Subir imagen'}
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

function Validacion({ it, set }) {
  const v = it.validacion || { min: null, max: null, mensaje: '' };
  const conPred = !SIN_RESPUESTA.has(it.tipo) && !DE_ARCHIVOS.has(it.tipo) && !CON_OPCIONES.has(it.tipo) && !SIN_PREDETERMINADO.has(it.tipo)
    && !['colaborador', 'caja', 'escala', 'estrellas'].includes(it.tipo);
  const tipoPred = { numero: 'number', moneda: 'number', porcentaje: 'number', fecha: 'date', hora: 'time', fechahora: 'datetime-local' }[it.tipo] || 'text';
  if (!CON_VALIDACION.has(it.tipo) && !conPred) {
    return <p className="text-sm text-muted-foreground">Esta pregunta no tiene reglas extra. Si es obligatoria se marca en General; el servidor también lo revisa al enviar.</p>;
  }
  const esTexto = it.tipo === 'corto' || it.tipo === 'largo';
  return (
    <div className="flex flex-col gap-3">
      {conPred && (
        <Campo label="Valor predeterminado" nota="Aparece ya escrito; la persona lo puede cambiar.">
          {it.tipo === 'sucursal' ? (
            <select value={it.predeterminado || ''} onChange={(e) => set({ predeterminado: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
              <option value="">Ninguno</option>
              {['H1', 'H2', 'H4', 'H5', 'H6'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <Input type={tipoPred} value={it.predeterminado || ''} onChange={(e) => set({ predeterminado: e.target.value })} className="h-10 text-sm text-foreground" />
          )}
        </Campo>
      )}
      {CON_VALIDACION.has(it.tipo) && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Campo label={esTexto ? 'Mínimo de letras' : 'Mínimo'}>
              <Input type="number" value={v.min ?? ''} placeholder={it.tipo === 'porcentaje' ? '0' : undefined} onChange={(e) => set({ validacion: { ...v, min: numeroOVacio(e.target.value) } }, 'val.min')} className="h-10 text-sm text-foreground" />
            </Campo>
            <Campo label={esTexto ? 'Máximo de letras' : 'Máximo'}>
              <Input type="number" value={v.max ?? ''} placeholder={it.tipo === 'porcentaje' ? '100' : undefined} onChange={(e) => set({ validacion: { ...v, max: numeroOVacio(e.target.value) } }, 'val.max')} className="h-10 text-sm text-foreground" />
            </Campo>
          </div>
          <Campo label="Mensaje si no se cumple" nota="Se valida en la pantalla y también en el servidor al enviar.">
            <Input value={v.mensaje || ''} onChange={(e) => set({ validacion: { ...v, mensaje: e.target.value } }, 'val.mensaje')} className="h-10 text-sm text-foreground"
              placeholder={esTexto ? 'Ej.: Explica con al menos 20 letras' : 'Ej.: Debe estar entre 0 y 50'} />
          </Campo>
        </>
      )}
    </div>
  );
}
