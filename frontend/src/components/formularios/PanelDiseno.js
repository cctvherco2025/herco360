import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import api from '@/lib/api';
import { DISENO_BASE, FUENTES, cargarFuente } from '@/lib/formularios';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AuthedImg } from '@/components/customform/CustomFormHistorial';
import FormRenderer from '@/components/formularios/FormRenderer';

/* Pestaña Diseño del constructor: el tema del formulario (colores, letras,
   forma, encabezado y pantallas) con vista previa en vivo. Se guarda con el
   borrador y entra en vigor al publicar. */

export const Grupo = ({ titulo, children }) => (
  <div className="flex flex-col gap-2.5 border-t pt-3.5 first:border-0 first:pt-0">
    <h3 className="font-heading font-semibold text-[15px]">{titulo}</h3>
    {children}
  </div>
);

export const Segmento = ({ label, valor, opciones, onCambio }) => (
  <div className="flex items-center justify-between gap-2 flex-wrap">
    <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
      {opciones.map(([k, n]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={valor === k} onClick={() => onCambio(k)}
          className={`h-8 px-2.5 rounded-lg text-xs ${valor === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
      ))}
    </div>
  </div>
);

export const Interruptor = ({ label, nota, valor, onCambio }) => (
  <div className="flex items-center justify-between gap-3 min-h-[40px]">
    <span className="text-[13px] font-medium">{label}{nota && <span className="block text-xs font-normal text-muted-foreground">{nota}</span>}</span>
    <Switch checked={!!valor} onCheckedChange={onCambio} aria-label={label} />
  </div>
);

const Radios = ({ label, valor, opciones, onCambio }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-0.5 p-[3px] bg-muted rounded-[10px]">
    {opciones.map(([k, n]) => (
      <button key={String(k)} type="button" role="radio" aria-checked={valor === k} onClick={() => onCambio(k)}
        className={`h-8 px-3 rounded-lg text-xs ${valor === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
    ))}
  </div>
);

const ANCHO = { pc: 'max-w-[880px]', tableta: 'max-w-[640px]', telefono: 'max-w-[390px]' };

// Marco de vista previa: qué pantalla, en qué dispositivo y claro u oscuro.
export function Vista({ vistas, vista, setVista, disp, setDisp, oscuro, setOscuro, nota, children }) {
  return (
    <section aria-label="Vista previa" className="min-w-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {vistas && <Radios label="Qué ver" valor={vista} opciones={vistas} onCambio={setVista} />}
        <span className="flex-1" />
        {setDisp && <Radios label="Dispositivo" valor={disp} opciones={[['pc', 'PC'], ['tableta', 'Tableta'], ['telefono', 'Teléfono']]} onCambio={setDisp} />}
        <Radios label="Modo" valor={oscuro ? 'oscuro' : 'claro'} opciones={[['claro', 'Claro'], ['oscuro', 'Oscuro']]} onCambio={(v) => setOscuro(v === 'oscuro')} />
      </div>
      <div className="rounded-2xl border bg-muted/50 px-3 py-5">
        <div className={`mx-auto ${ANCHO[disp] || ANCHO.pc} ${disp === 'telefono' ? 'rounded-[30px] border-[6px] border-foreground/80 p-1.5 min-h-[640px] bg-background' : ''}`}>
          {children}
        </div>
      </div>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </section>
  );
}

function BotonImagen({ formId, imagenId, etiqueta, onCambio }) {
  const ref = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Sube una imagen (JPG, PNG o WEBP)'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData(); fd.append('archivo', file);
      const { data } = await api.post(`/formularios-v2/${formId}/imagenes`, fd);
      onCambio(data.imagen_id);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo subir la imagen'); }
    finally { setSubiendo(false); }
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => ref.current?.click()} disabled={subiendo}
        className="w-full min-h-[72px] rounded-[10px] border border-dashed bg-muted/40 text-xs text-muted-foreground hover:bg-muted flex flex-col items-center justify-center gap-1 overflow-hidden">
        {imagenId ? <AuthedImg url={`/formularios-v2/${formId}/imagenes/${imagenId}`} className="h-14 w-full object-cover" />
          : subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        <span>{imagenId ? `Cambiar ${etiqueta.toLowerCase()}` : etiqueta}</span>
      </button>
      {imagenId && (
        <button type="button" onClick={() => onCambio(null)} aria-label={`Quitar ${etiqueta.toLowerCase()}`}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-[#dc2626] text-white grid place-items-center shadow"><X className="h-3.5 w-3.5" /></button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

export default function PanelDiseno({ formId, titulo, descripcion, contenido, onCambio }) {
  const d = contenido.diseno;
  const set = (patch, clave) => onCambio({ ...d, ...patch }, clave || `diseno.${Object.keys(patch).join(',')}`);
  const [temas, setTemas] = useState([]);
  const [nombreTema, setNombreTema] = useState(null);
  const [vista, setVista] = useState('preguntas');
  const [disp, setDisp] = useState('pc');
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => { api.get('/formularios-v2/temas').then(({ data }) => setTemas(data)).catch(() => {}); }, []);
  useEffect(() => { Object.keys(FUENTES).forEach(cargarFuente); }, []);

  const aplicarTema = (diseno) => set({ ...diseno, logo_imagen_id: d.logo_imagen_id, portada_imagen_id: d.portada_imagen_id,
    fondo_imagen_id: d.fondo_imagen_id, logo: d.logo, bienvenida: d.bienvenida, final: d.final }, 'diseno.tema');
  const guardarTema = async () => {
    const nombre = (nombreTema || '').trim();
    if (!nombre) { toast.error('Ponle nombre al tema'); return; }
    try {
      const { data } = await api.post('/formularios-v2/temas', { nombre, diseno: d });
      setTemas((t) => [...t, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setNombreTema(null);
      toast.success(`Tema «${nombre}» guardado: lo puede usar cualquiera que arme formularios en tu departamento`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar el tema'); }
  };
  const borrarTema = async (t) => {
    try { await api.delete(`/formularios-v2/temas/${t.id}`); setTemas((x) => x.filter((y) => y.id !== t.id)); }
    catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo borrar'); }
  };
  const igualA = (x) => ['principal', 'acento', 'fondo', 'fuente', 'esquinas', 'sombras', 'espaciado', 'tam', 'alineacion', 'columnas', 'tarjetas'].every((k) => x[k] === d[k]);

  // la bienvenida se ve en la vista previa aunque esté apagada, para diseñarla
  const previa = vista === 'bienvenida' ? { ...contenido, diseno: { ...d, bienvenida: { ...d.bienvenida, activa: true } } } : contenido;

  return (
    <div className="grid gap-4 items-start lg:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside aria-label="Diseño del formulario" className="rounded-2xl border bg-card p-4 flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <Grupo titulo="Tema">
          <div className="flex flex-wrap gap-1.5">
            {[{ id: 'herco', nombre: 'HERCO (predeterminado)', diseno: DISENO_BASE }, ...temas].map((t) => {
              const on = igualA({ ...DISENO_BASE, ...t.diseno });
              return (
                <span key={t.id} className={`inline-flex items-center rounded-full border ${on ? 'border-2 border-[#1e395e] bg-[#e8eef7] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.14)]' : ''}`}>
                  <button type="button" aria-pressed={on} onClick={() => aplicarTema(t.diseno)} className="min-h-[34px] pl-2.5 pr-2.5 text-xs inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: t.diseno.principal }} aria-hidden="true" />
                    <span className="h-3 w-3 rounded-full -ml-2.5 ring-2 ring-card" style={{ background: t.diseno.acento }} aria-hidden="true" />
                    {t.nombre}
                  </button>
                  {t.puede_borrar && (
                    <button type="button" onClick={() => borrarTema(t)} aria-label={`Borrar el tema ${t.nombre}`} className="h-7 w-7 mr-0.5 grid place-items-center rounded-full text-muted-foreground hover:text-[#dc2626]"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </span>
              );
            })}
          </div>
          {nombreTema === null ? (
            <button type="button" onClick={() => setNombreTema('')} className="self-start h-8 px-2.5 rounded-lg border border-dashed text-xs text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Guardar como tema
            </button>
          ) : (
            <div className="flex gap-1.5">
              <Input autoFocus value={nombreTema} onChange={(e) => setNombreTema(e.target.value)} maxLength={60} placeholder="Nombre del tema"
                onKeyDown={(e) => { if (e.key === 'Enter') guardarTema(); if (e.key === 'Escape') setNombreTema(null); }} className="h-9 text-sm" />
              <button type="button" onClick={guardarTema} className="h-9 px-3 rounded-lg bg-[#1e395e] text-white text-xs font-semibold">Guardar</button>
              <button type="button" onClick={() => setNombreTema(null)} aria-label="Cancelar" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Un tema guarda colores, letras y forma (no las imágenes). Lo puede usar cualquiera que arme formularios en tu departamento.</p>
        </Grupo>

        <Grupo titulo="Colores">
          {[['principal', 'Principal', 'Botones y logo'], ['acento', 'Acento', 'Respuesta elegida y progreso'], ['fondo', 'Fondo', 'Detrás del formulario']].map(([k, n, uso]) => (
            <label key={k} className="flex items-center gap-2.5 min-h-[40px]">
              <input type="color" value={d[k]} onChange={(e) => set({ [k]: e.target.value }, `diseno.${k}`)} aria-label={`Color ${n.toLowerCase()}`}
                className="h-10 w-10 p-0.5 rounded-[10px] border bg-background cursor-pointer shrink-0" />
              <span className="flex-1 min-w-0"><span className="block text-[13px] font-medium">{n}</span><span className="block text-xs text-muted-foreground">{uso}</span></span>
              <Input value={d[k]} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && e.target.value.length === 7 && set({ [k]: e.target.value }, `diseno.${k}`)}
                aria-label={`Código del color ${n.toLowerCase()}`} className="h-9 w-[88px] font-mono text-xs" />
            </label>
          ))}
          <BotonImagen formId={formId} imagenId={d.fondo_imagen_id} etiqueta="Imagen de fondo" onCambio={(v) => set({ fondo_imagen_id: v })} />
        </Grupo>

        <Grupo titulo="Tipografía">
          <div role="radiogroup" aria-label="Tipografía" className="grid grid-cols-2 gap-1.5">
            {Object.entries(FUENTES).map(([k, f]) => (
              <button key={k} type="button" role="radio" aria-checked={d.fuente === k} onClick={() => set({ fuente: k })}
                className={`min-h-[56px] px-2.5 py-1.5 rounded-[10px] border text-left flex flex-col gap-0.5 ${d.fuente === k ? 'border-2 border-[#1e395e] bg-[#f5f8fc] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.1)]' : 'hover:bg-muted'}`}>
                <span style={{ fontFamily: f.titulo }} className="text-lg font-semibold leading-none">Aa</span>
                <span className="text-xs">{f.label}</span>
              </button>
            ))}
          </div>
        </Grupo>

        <Grupo titulo="Forma y distribución">
          <Segmento label="Tamaño de letra" valor={d.tam} opciones={[['normal', 'Normal'], ['grande', 'Grande']]} onCambio={(v) => set({ tam: v })} />
          <Segmento label="Esquinas" valor={d.esquinas} opciones={[['rectas', 'Rectas'], ['suaves', 'Suaves'], ['redondas', 'Redondas']]} onCambio={(v) => set({ esquinas: v })} />
          <Segmento label="Sombras" valor={d.sombras} opciones={[['no', 'Sin sombra'], ['suave', 'Suave']]} onCambio={(v) => set({ sombras: v })} />
          <Segmento label="Espaciado" valor={d.espaciado} opciones={[['compacto', 'Compacto'], ['normal', 'Normal'], ['amplio', 'Amplio']]} onCambio={(v) => set({ espaciado: v })} />
          <Segmento label="Alineación" valor={d.alineacion} opciones={[['izquierda', 'Izquierda'], ['centro', 'Centro']]} onCambio={(v) => set({ alineacion: v })} />
          <Segmento label="Columnas" valor={d.columnas} opciones={[[1, '1'], [2, '2'], [3, '3']]} onCambio={(v) => set({ columnas: v })} />
          <Interruptor label="Preguntas en tarjetas" nota="Cada pregunta en su propia tarjeta" valor={d.tarjetas} onCambio={(v) => set({ tarjetas: v })} />
          <p className="text-[11px] text-muted-foreground">En teléfono siempre va una columna. Cada pregunta puede ocupar todo el ancho, la mitad o un tercio (Contenido › Propiedades › Apariencia).</p>
        </Grupo>

        <Grupo titulo="Encabezado">
          <Segmento label="Logo" valor={d.logo} opciones={[['herco', 'HERCO'], ['imagen', 'Otro'], ['ninguno', 'Sin logo']]} onCambio={(v) => set({ logo: v })} />
          {d.logo === 'imagen' && <BotonImagen formId={formId} imagenId={d.logo_imagen_id} etiqueta="Logo" onCambio={(v) => set({ logo_imagen_id: v })} />}
          <BotonImagen formId={formId} imagenId={d.portada_imagen_id} etiqueta="Imagen de portada" onCambio={(v) => set({ portada_imagen_id: v })} />
          <p className="text-[11px] text-muted-foreground">La portada se ve en la pantalla de bienvenida.</p>
        </Grupo>

        <Grupo titulo="Bienvenida">
          <Interruptor label="Pantalla de bienvenida" nota="Antes de la primera pregunta" valor={d.bienvenida.activa}
            onCambio={(v) => set({ bienvenida: { ...d.bienvenida, activa: v } }, 'diseno.bienvenida.activa')} />
          {d.bienvenida.activa && (
            <>
              <Input value={d.bienvenida.titulo} placeholder={titulo || 'Título'} maxLength={160} aria-label="Título de bienvenida"
                onChange={(e) => set({ bienvenida: { ...d.bienvenida, titulo: e.target.value } }, 'diseno.bienvenida.titulo')} className="h-10 text-sm" />
              <Textarea value={d.bienvenida.texto} placeholder={descripcion || 'Qué se va a llenar y qué tener a mano'} rows={3} maxLength={1000} aria-label="Texto de bienvenida"
                onChange={(e) => set({ bienvenida: { ...d.bienvenida, texto: e.target.value } }, 'diseno.bienvenida.texto')} className="text-sm" />
              <Input value={d.bienvenida.boton} maxLength={40} aria-label="Texto del botón de bienvenida"
                onChange={(e) => set({ bienvenida: { ...d.bienvenida, boton: e.target.value } }, 'diseno.bienvenida.boton')} className="h-10 text-sm" />
            </>
          )}
        </Grupo>

        <Grupo titulo="Al terminar">
          <Input value={d.final.mensaje} maxLength={200} aria-label="Mensaje al terminar"
            onChange={(e) => set({ final: { ...d.final, mensaje: e.target.value } }, 'diseno.final.mensaje')} className="h-10 text-sm" />
          <Interruptor label="Mostrar el puntaje" nota="Solo si el formulario tiene puntaje" valor={d.final.puntaje}
            onCambio={(v) => set({ final: { ...d.final, puntaje: v } }, 'diseno.final.puntaje')} />
        </Grupo>
      </aside>

      <Vista vistas={[['bienvenida', 'Bienvenida'], ['preguntas', 'Preguntas'], ['final', 'Al terminar']]} vista={vista} setVista={setVista}
        disp={disp} setDisp={setDisp} oscuro={oscuro} setOscuro={setOscuro}
        nota={oscuro ? 'Modo oscuro: se conserva el acento; el fondo y las tarjetas se oscurecen y el color principal se aclara para que se lea.' : null}>
        <FormRenderer key={`${vista}-${disp}`} form={{ id: formId, titulo, descripcion, contenido: previa, version: 'previa' }} modo="vista"
          pantallaInicial={vista} oscuro={oscuro} compacto={disp === 'telefono'} />
      </Vista>
    </div>
  );
}
