import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, ImagePlus, Paperclip, X, Send, Star, Search, Check, Info, Eraser, CheckCircle2, Loader2,
  CornerDownLeft, Ticket, MapPin, Plus, Trash2,
} from 'lucide-react';
import api from '@/lib/api';
import { compressImage } from '@/lib/flosPhoto';
import { useTheme } from '@/context/ThemeContext';
import {
  SIN_RESPUESTA, DE_ARCHIVOS, EN_FILAS, errorDe, pideEvidencia, nombreDe, conDefaults, visibilidad, disparaSeguimiento, temaDe, cargarFuente, haceCuanto,
  filasConDatos, claveFoto, textoCalculado, dinero, cifra, urlMapa, uid,
} from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { AuthedImg } from '@/components/customform/CustomFormHistorial';
import { Logo } from '@/components/Logo';

/* Dibuja un formulario del constructor (formato 2) para llenarlo, con su
   diseño (tema), su navegación (paso a paso, una pregunta a la vez, todo en
   una página, checklist, o mixto por paso) y sus condiciones en vivo.
   modo 'vista': vista previa del constructor, no envía nada; `oscuro` fuerza
   claro/oscuro, `pantallaInicial` ('preguntas' | 'final') e `irA` (id de un
   paso o 'resumen').
   modo 'llenar': lo que se contesta entra y sale por `servidor` (lo arma quien
   lo usa, ver LlenarFormulario.js):
     inicial   {valores, notas, archivos: {dueño: [meta]}, pantalla, guardado_at}
     guardar   si viene, lo contestado se guarda solo mientras se llena
     subir / quitar   si vienen, cada archivo se sube al tomarlo; si no, se
                      mandan juntos al enviar
     enviar    ({respuestas, notas, conservar, nuevos}) -> la respuesta
     urlArchivo, otraVez, reiniciar, recargar
   Dueño de un archivo: el id de la pregunta, `ev:<id>` si es foto de evidencia
   o claveFoto(...) si es de una fila de un grupo repetible. */

const MAX_FOTOS = 10;
const ESPERA_GUARDADO = 1500;
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SPAN = { 6: 'sm:col-span-6', 3: 'sm:col-span-3', 2: 'sm:col-span-2' };
const TARJETA = 'bg-[var(--f-tarjeta)] border border-[color:var(--f-borde)] rounded-[var(--f-radio)] shadow-[var(--f-sombra)]';
const TITULO = { fontFamily: 'var(--f-fuente-titulo)' };

function valoresIniciales(contenido, guardado) {
  const out = {};
  (contenido.pasos || []).forEach((p) => p.secciones.forEach((s) => s.items.forEach((it) => {
    if (it.predeterminado !== undefined && it.predeterminado !== null && it.predeterminado !== '') out[it.id] = it.predeterminado;
  })));
  return { valores: { ...out, ...(guardado?.valores || {}) }, notas: guardado?.notas || {} };
}

// Lo que ya está en el servidor, separado en archivos de la pregunta y evidencias.
function archivosIniciales(guardado) {
  const propios = {}; const evidencias = {};
  Object.entries(guardado?.archivos || {}).forEach(([dueno, lista]) => {
    const metas = lista.map((m) => ({ ...m, ya: true }));
    if (dueno.startsWith('ev:')) evidencias[dueno.slice(3)] = metas; else propios[dueno] = metas;
  });
  return { propios, evidencias };
}

// Las pantallas por las que se avanza, según el estilo de cada paso y lo que hoy se ve.
function armarPantallas(contenido, vis) {
  const { diseno, navegacion } = contenido;
  const out = [];
  if (diseno.bienvenida.activa) out.push({ clave: 'bienvenida', tipo: 'bienvenida' });
  const pasos = contenido.pasos.filter((p) => vis.pasos.has(p.id))
    .map((p) => ({ ...p, secciones: p.secciones.filter((s) => vis.secciones.has(s.id)).map((s) => ({ ...s, items: s.items.filter((it) => vis.items.has(it.id)) })).filter((s) => s.items.length) }))
    .filter((p) => p.secciones.length);
  if (navegacion.estilo === 'pagina') {
    out.push({ clave: 'pagina', tipo: 'pagina', pasos });
  } else {
    pasos.forEach((p) => {
      const estilo = p.estilo && p.estilo !== 'igual' ? p.estilo : navegacion.estilo;
      if (estilo !== 'una') { out.push({ clave: `paso-${p.id}`, tipo: estilo, paso: p, secciones: p.secciones }); return; }
      let previos = [];
      p.secciones.forEach((s) => s.items.forEach((it) => {
        if (SIN_RESPUESTA.has(it.tipo)) { if (it.tipo !== 'separador') previos.push(it); return; }
        out.push({ clave: `una-${it.id}`, tipo: 'una', paso: p, seccion: s, items: [...previos, it], pregunta: it });
        previos = [];
      }));
      if (previos.length) out.push({ clave: `una-fin-${p.id}`, tipo: 'una', paso: p, items: previos, pregunta: null });
    });
  }
  if (navegacion.resumen) out.push({ clave: 'resumen', tipo: 'resumen' });
  return out;
}

const itemsDePantalla = (pt) => {
  if (!pt) return [];
  if (pt.tipo === 'una') return pt.items;
  if (pt.tipo === 'pagina') return pt.pasos.flatMap((p) => p.secciones.flatMap((s) => s.items));
  return (pt.secciones || []).flatMap((s) => s.items);
};

function indiceInicial(pantallas, irA, pantallaInicial) {
  if (irA === 'resumen') return Math.max(0, pantallas.findIndex((p) => p.tipo === 'resumen'));
  if (irA) { const i = pantallas.findIndex((p) => p.paso?.id === irA); if (i >= 0) return i; }
  if (pantallaInicial === 'preguntas') return Math.max(0, pantallas.findIndex((p) => p.tipo !== 'bienvenida'));
  return 0;
}

export default function FormRenderer({ form, modo = 'llenar', servidor, onEnviado, compacto = false, oscuro: oscuroForzado, pantallaInicial, irA }) {
  const { isDark } = useTheme();
  const oscuro = oscuroForzado ?? isDark;
  const contenido = useMemo(() => conDefaults(form.contenido), [form.contenido]);
  const { diseno, navegacion } = contenido;
  useEffect(() => { cargarFuente(diseno.fuente); }, [diseno.fuente]);
  const tema = useMemo(() => temaDe(diseno, oscuro), [diseno, oscuro]);

  const inicial = useMemo(() => valoresIniciales(contenido, servidor?.inicial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [valores, setValores] = useState(inicial.valores);
  const [notas, setNotas] = useState(inicial.notas);
  // id -> [{blob, dataUrl, nombre}] recién tomados, o {id, nombre, ya: true} si ya están en el servidor
  const [archivos, setArchivos] = useState(() => archivosIniciales(servidor?.inicial).propios);
  const [evidencias, setEvidencias] = useState(() => archivosIniciales(servidor?.inicial).evidencias);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(pantallaInicial === 'final' ? { total_score: 18, total_max: 20, percent: 90, demo: true } : null);
  const [listas, setListas] = useState(null);
  const [clave, setClave] = useState(servidor?.inicial?.pantalla || null);
  const [direccion, setDireccion] = useState(1);
  const [guardado, setGuardado] = useState({ estado: 'ok', at: servidor?.inicial?.guardado_at || null });
  const arriba = useRef(null);
  const idxRef = useRef(null);
  const pendiente = useRef(false);
  const timerGuardar = useRef(null);
  const guardar = useRef(null);
  const quitados = useRef(new WeakSet());

  const cuantos = useMemo(() => Object.fromEntries(Object.entries(archivos).map(([k, v]) => [k, v.length])), [archivos]);
  const vis = useMemo(() => visibilidad(contenido, valores, archivos), [contenido, valores, archivos]);
  const pantallas = useMemo(() => armarPantallas(contenido, vis), [contenido, vis]);
  let idx = clave === null ? -1 : pantallas.findIndex((p) => p.clave === clave);
  if (idx < 0) idx = idxRef.current === null ? indiceInicial(pantallas, irA, pantallaInicial) : Math.min(idxRef.current, pantallas.length - 1);
  idxRef.current = idx;
  const pantalla = pantallas[idx];

  const numeros = useMemo(() => {
    const out = {}; let n = 0;
    contenido.pasos.forEach((p) => p.secciones.forEach((s) => s.items.forEach((it) => {
      if (!SIN_RESPUESTA.has(it.tipo) && vis.items.has(it.id)) { n += 1; out[it.id] = n; }
    })));
    return out;
  }, [contenido, vis]);
  const totalPreguntas = Object.keys(numeros).length;

  const usaListas = useMemo(() => contenido.pasos.some((p) => p.secciones.some((s) => s.items.some((it) => ['colaborador', 'caja'].includes(it.tipo)))), [contenido]);
  useEffect(() => {
    if (!usaListas || !form.id) return;
    api.get(`/formularios-v2/${form.id}/listas`).then(({ data }) => setListas(data)).catch(() => setListas({ colaboradores: [], cajas: [], sucursales: [] }));
  }, [usaListas, form.id]);

  const limpiarError = (id) => setErrores((e) => (e[id] ? { ...e, [id]: null } : e));
  const poner = (id, v) => { setValores((x) => ({ ...x, [id]: v })); limpiarError(id); };
  // Con `servidor.subir`, cada archivo se sube al tomarlo y se borra al quitarlo.
  const conServidor = (dueno, id, previa, lista, setter) => {
    if (!servidor?.subir) return;
    previa.filter((f) => !lista.includes(f)).forEach((f) => {
      if (f.ya) servidor.quitar(dueno, f).catch(() => {}); else quitados.current.add(f);
    });
    lista.filter((f) => !f.ya && !f.subiendo).forEach((f) => {
      f.subiendo = true;
      servidor.subir(dueno, f.blob, f.nombre).then((meta) => {
        if (quitados.current.has(f)) { servidor.quitar(dueno, meta).catch(() => {}); return; }
        setter((x) => ({ ...x, [id]: (x[id] || []).map((y) => (y === f ? { ...meta, ya: true, dataUrl: f.dataUrl, tamano: f.tamano } : y)) }));
      }).catch((e) => {
        setter((x) => ({ ...x, [id]: (x[id] || []).filter((y) => y !== f) }));
        toast.error(e?.response?.data?.detail || 'No se pudo subir un archivo. Inténtalo otra vez.');
      });
    });
  };
  const ponerArchivos = (id, lista) => { conServidor(id, id, archivos[id] || [], lista, setArchivos); setArchivos((x) => ({ ...x, [id]: lista })); limpiarError(id); };
  const ponerEvidencia = (id, lista) => { conServidor(`ev:${id}`, id, evidencias[id] || [], lista, setEvidencias); setEvidencias((x) => ({ ...x, [id]: lista })); limpiarError(id); };
  const ponerNota = (id, t) => setNotas((x) => ({ ...x, [id]: t }));

  const visibles = (items) => items.filter((it) => !SIN_RESPUESTA.has(it.tipo) && vis.items.has(it.id));
  const revisar = (items) => {
    const nuevos = {};
    visibles(items).forEach((it) => {
      const e = errorDe(it, valores[it.id], archivos[it.id], evidencias[it.id], archivos);
      if (e) nuevos[it.id] = e;
    });
    setErrores((x) => ({ ...x, ...Object.fromEntries(visibles(items).map((it) => [it.id, nuevos[it.id] || null])) }));
    const primero = Object.keys(nuevos)[0];
    if (primero) {
      const destino = pantallas.findIndex((p) => itemsDePantalla(p).some((it) => it.id === primero));
      if (destino >= 0 && destino !== idx) irAPantalla(destino);
      setTimeout(() => document.getElementById(`pregunta-${primero}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      toast.error(Object.keys(nuevos).length === 1 ? 'Revisa la pregunta marcada' : `Revisa las ${Object.keys(nuevos).length} preguntas marcadas`);
    }
    return !primero;
  };
  const todas = () => contenido.pasos.flatMap((p) => p.secciones.flatMap((s) => s.items));
  const contestada = (it) => {
    if (DE_ARCHIVOS.has(it.tipo)) return (archivos[it.id] || []).length > 0;
    if (EN_FILAS.has(it.tipo)) return filasConDatos(it, valores[it.id], archivos).length > 0;
    const v = it.tipo === 'calculado' ? vis.calculados[it.id] : valores[it.id];
    return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length));
  };
  const subiendo = [...Object.values(archivos), ...Object.values(evidencias)].flat().some((f) => f.subiendo);

  // lo contestado se guarda solo; quien vuelve (aquí o en otro equipo) sigue donde iba
  const quedan = visibles(todas());
  guardar.current = async () => {
    pendiente.current = false;
    setGuardado((g) => ({ ...g, estado: 'guardando' }));
    try {
      const d = await servidor.guardar({ valores, notas, pantalla: pantalla?.clave || null, hechas: quedan.filter(contestada).length, total: quedan.length });
      setGuardado({ estado: 'ok', at: d.guardado_at });
    } catch (e) {
      if (e?.response?.status === 409) { setGuardado({ estado: 'choque', detalle: e.response.data?.detail }); return; }
      setGuardado((g) => ({ ...g, estado: 'error' }));
      pendiente.current = true;
      if (!e?.response || e.response.status >= 500) timerGuardar.current = setTimeout(() => guardar.current?.(), 5000);
    }
  };
  // solo si de verdad cambió algo: abrirlo y mirarlo no lo empieza
  const firma = JSON.stringify([valores, notas, cuantos, Object.values(evidencias).map((l) => l.length), clave]);
  const ultimaFirma = useRef(firma);
  useEffect(() => {
    if (!servidor?.guardar || resultado || firma === ultimaFirma.current) return;
    ultimaFirma.current = firma;
    pendiente.current = true;
    setGuardado((g) => (g.estado === 'choque' ? g : { ...g, estado: 'pendiente' }));
    clearTimeout(timerGuardar.current);
    timerGuardar.current = setTimeout(() => guardar.current?.(), ESPERA_GUARDADO);
  }, [firma]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const antes = (e) => { if (pendiente.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', antes);
    return () => { window.removeEventListener('beforeunload', antes); clearTimeout(timerGuardar.current); if (pendiente.current) guardar.current?.(); };
  }, []);

  function irAPantalla(n) {
    if (!pantallas[n]) return;
    setDireccion(n >= idx ? 1 : -1);
    setClave(pantallas[n].clave);
    setTimeout(() => arriba.current?.scrollIntoView({ block: 'start' }), 0);
  }
  const ultimo = idx === pantallas.length - 1;
  const siguiente = () => { if (revisar(itemsDePantalla(pantalla))) irAPantalla(idx + 1); };

  const enviar = async () => {
    if (!revisar(todas())) return;
    if (modo === 'vista') { toast.success('Todo en orden: así se enviaría (la vista previa no guarda nada)'); return; }
    if (subiendo) { toast('Espera a que terminen de subir los archivos'); return; }
    setEnviando(true);
    clearTimeout(timerGuardar.current);
    pendiente.current = false;
    try {
      const respuestas = {}; const notasEnvio = {}; const nuevos = []; const conservar = {};
      const meter = (dueno, lista, nombre) => lista.forEach((a, i) => {
        if (a.ya) (conservar[dueno] = conservar[dueno] || []).push(a.id);
        else nuevos.push({ dueno, blob: a.blob, nombre: a.nombre || nombre(i) });
      });
      visibles(todas()).forEach((it) => {
        if (!DE_ARCHIVOS.has(it.tipo) && valores[it.id] !== undefined) respuestas[it.id] = valores[it.id];
        meter(it.id, archivos[it.id] || [], () => `${it.id}.jpg`);
        if (it.tipo === 'repetible') {
          (valores[it.id] || []).forEach((f) => it.config.columnas.filter((c) => c.tipo === 'foto').forEach((c) => {
            const dueno = claveFoto(it.id, f.id, c.id);
            meter(dueno, archivos[dueno] || [], (i) => `foto-${i + 1}.jpg`);
          }));
        }
        if (pideEvidencia(it, valores[it.id])) meter(`ev:${it.id}`, evidencias[it.id] || [], (i) => `evidencia-${i + 1}.jpg`);
        if ((notas[it.id] || '').trim()) notasEnvio[it.id] = notas[it.id].trim();
      });
      const data = await servidor.enviar({ respuestas, notas: notasEnvio, conservar, nuevos });
      setResultado(data);
      onEnviado?.(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    const v = valoresIniciales(contenido, null);
    servidor?.reiniciar?.();
    ultimaFirma.current = JSON.stringify([v.valores, {}, {}, [], null]);
    setGuardado({ estado: 'ok', at: null });
    setResultado(null); setValores(v.valores); setNotas({}); setArchivos({}); setEvidencias({}); setErrores({});
    idxRef.current = null; setClave(null);
  };

  // una pregunta a la vez: letras para elegir y Enter para seguir
  useEffect(() => {
    if (pantalla?.tipo !== 'una' || resultado) return undefined;
    const tecla = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const q = pantalla.pregunta;
      if (e.key === 'Enter') { e.preventDefault(); if (ultimo) enviar(); else siguiente(); return; }
      const i = LETRAS.indexOf(e.key.toUpperCase());
      if (!q || i < 0 || !q.opciones?.[i] || q.tipo === 'lista') return;
      const o = q.opciones[i];
      if (q.tipo === 'multiple') {
        const sel = Array.isArray(valores[q.id]) ? valores[q.id] : [];
        poner(q.id, sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id]);
      } else poner(q.id, o.id);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const raiz = (hijos) => (
    <div ref={arriba} style={tema} className={`relative scroll-mt-24 rounded-[18px] ${oscuro ? 'dark' : 'tema-claro'} ${compacto ? 'p-3' : 'p-3 sm:p-5'}`}>
      {/* solo el fondo se recorta: las listas con buscador pueden salirse por abajo */}
      <div className="absolute inset-0 overflow-hidden rounded-[18px]" aria-hidden="true">
        <div className="absolute inset-0 bg-[var(--f-fondo)]" />
        {diseno.fondo_imagen_id && (
          <>
            <AuthedImg url={`/formularios-v2/${form.id}/imagenes/${diseno.fondo_imagen_id}`} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[var(--f-fondo)] opacity-75" />
          </>
        )}
      </div>
      <div className="relative flex flex-col gap-[var(--f-gap)]">
        {diseno.logo !== 'ninguno' && (
          <div className={`flex ${diseno.alineacion === 'centro' ? 'justify-center' : ''}`}>
            {diseno.logo === 'imagen' && diseno.logo_imagen_id
              ? <AuthedImg url={`/formularios-v2/${form.id}/imagenes/${diseno.logo_imagen_id}`} className="h-10 w-auto max-w-[200px] object-contain" />
              : <Logo size="sm" />}
          </div>
        )}
        {hijos}
      </div>
    </div>
  );

  if (!pantallas.length) {
    return raiz(<p className={`${TARJETA} p-8 text-center text-sm text-[color:var(--f-suave)]`}>Este formulario todavía no tiene preguntas.</p>);
  }

  if (resultado) {
    const puntos = diseno.final.puntaje && resultado.total_max > 0;
    return raiz(
      <div className={`${TARJETA} p-8 flex flex-col gap-3 items-center text-center`}>
        <span className="h-14 w-14 rounded-full grid place-items-center bg-[var(--f-acento-suave)] text-[color:var(--f-acento)]"><CheckCircle2 className="h-8 w-8" /></span>
        <h2 style={TITULO} className="text-xl font-semibold">{diseno.final.mensaje}</h2>
        {puntos && <p className="text-[color:var(--f-suave)]">Puntaje: <b className="text-[color:var(--f-texto)]">{resultado.total_score} de {resultado.total_max}</b> ({resultado.percent}%)</p>}
        {resultado.seguimiento && (
          <p className="text-sm rounded-xl bg-[#fff3e6] text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b] px-3 py-2 flex items-center gap-2">
            <Ticket className="h-4 w-4 shrink-0" />
            <span>Se abrió el seguimiento <Link to={`/formularios/tickets/${resultado.seguimiento.id}`} className="font-semibold underline">{resultado.seguimiento.numero}</Link> para corregir lo que no cumplió.</span>
          </p>
        )}
        {resultado.estado_entrega === 'revision' && <p className="text-sm text-[color:var(--f-suave)]">Quedó en revisión: te avisamos cuando lo aprueben o lo devuelvan.</p>}
        {!resultado.demo && servidor?.otraVez && <Button className="mt-2 rounded-[var(--f-radio)]" variant="outline" onClick={reiniciar}>Llenar otra vez</Button>}
      </div>,
    );
  }

  const conBienvenida = pantallas[0]?.tipo === 'bienvenida';
  const enPreguntas = pantalla.tipo !== 'bienvenida';
  const total = pantallas.length - (conBienvenida ? 1 : 0);
  const posicion = idx + (conBienvenida ? 0 : 1);
  const pasosVisibles = contenido.pasos.filter((p) => vis.pasos.has(p.id) && pantallas.some((x) => x.paso?.id === p.id));
  let pct;
  if (pantalla.tipo === 'pagina') {
    pct = quedan.length ? Math.round((quedan.filter(contestada).length / quedan.length) * 100) : 0;
  } else pct = Math.round((posicion / Math.max(1, total)) * 100);
  const etiqueta = !pantalla.paso ? (pantalla.tipo === 'resumen' ? 'Revisa antes de enviar' : pantalla.tipo === 'pagina' ? 'Avance' : '')
    : pantalla.tipo === 'una' ? `${pantalla.paso.nombre} · ${numeros[pantalla.pregunta?.id] ? `pregunta ${numeros[pantalla.pregunta.id]} de ${totalPreguntas}` : ''}`
      : `Paso ${pasosVisibles.findIndex((p) => p.id === pantalla.paso.id) + 1} de ${pasosVisibles.length} · ${pantalla.paso.nombre}`;

  const props = (it) => ({
    it, n: numeros[it.id], form, listas, valor: it.tipo === 'calculado' ? vis.calculados[it.id] : valores[it.id], error: errores[it.id],
    archivos: archivos[it.id] || [], evidencia: evidencias[it.id] || [], nota: notas[it.id] || '', onValor: (v) => poner(it.id, v),
    onArchivos: (l) => ponerArchivos(it.id, l), onEvidencia: (l) => ponerEvidencia(it.id, l), onNota: (t) => ponerNota(it.id, t), compacto, diseno, urlDe: servidor?.urlArchivo,
    fotosDe: (dueno) => archivos[dueno] || [], onFotos: (dueno, l) => { ponerArchivos(dueno, l); limpiarError(it.id); },
  });
  const textoGuardado = {
    ok: guardado.at ? `Guardado ${haceCuanto(guardado.at, Date.now())}` : '',
    pendiente: 'Guardando…', guardando: 'Guardando…', error: 'Sin conexión: se reintenta solo', choque: guardado.detalle,
  }[guardado.estado];

  return raiz(
    <>
      {servidor?.guardar && textoGuardado && (
        <p aria-live="polite" className={`text-xs flex flex-wrap items-center justify-end gap-x-2 ${['error', 'choque'].includes(guardado.estado) ? 'text-[#dc2626]' : 'text-[color:var(--f-suave)]'}`}>
          {textoGuardado}
          {guardado.estado === 'choque' && <button type="button" className="underline" onClick={() => servidor.recargar?.()}>Recargar</button>}
        </p>
      )}
      {enPreguntas && navegacion.progreso !== 'nada' && (
        <Progreso tipo={navegacion.progreso} etiqueta={etiqueta} pct={pct} pasos={pasosVisibles}
          actual={pantalla.paso?.id} resumen={pantalla.tipo === 'resumen'} />
      )}
      <AnimatePresence mode="wait" initial={false} custom={direccion}>
        <motion.div key={pantalla.clave} custom={direccion}
          initial={pantalla.tipo === 'una' ? { opacity: 0, y: 24 * direccion } : { opacity: 0 }}
          animate={{ opacity: 1, y: 0 }} exit={pantalla.tipo === 'una' ? { opacity: 0, y: -24 * direccion } : { opacity: 0 }}
          transition={{ duration: pantalla.tipo === 'una' ? 0.25 : 0.15 }} className="flex flex-col gap-[var(--f-gap)]">
          {pantalla.tipo === 'bienvenida' && <Bienvenida form={form} diseno={diseno} onEmpezar={() => irAPantalla(1)} />}
          {(pantalla.tipo === 'paso') && pantalla.secciones.map((s) => <Seccion key={s.id} s={s} props={props} diseno={diseno} compacto={compacto} />)}
          {pantalla.tipo === 'checklist' && pantalla.secciones.map((s) => <SeccionChecklist key={s.id} s={s} props={props} valores={valores} />)}
          {pantalla.tipo === 'pagina' && pantalla.pasos.map((p) => (
            <div key={p.id} className="flex flex-col gap-[var(--f-gap)]">
              {pantalla.pasos.length > 1 && <h2 style={TITULO} className="text-lg font-semibold">{p.nombre}</h2>}
              {p.secciones.map((s) => <Seccion key={s.id} s={s} props={props} diseno={diseno} compacto={compacto} />)}
            </div>
          ))}
          {pantalla.tipo === 'una' && <UnaPregunta pantalla={pantalla} props={props} />}
          {pantalla.tipo === 'resumen' && (
            <Resumen items={visibles(todas())} valores={{ ...valores, ...vis.calculados }} archivos={archivos} listas={listas} numeros={numeros}
              onCambiar={(id) => irAPantalla(pantallas.findIndex((p) => itemsDePantalla(p).some((it) => it.id === id)))} />
          )}
        </motion.div>
      </AnimatePresence>

      {enPreguntas && (
        <div className="flex items-center justify-between gap-3">
          {navegacion.volver && idx > (conBienvenida ? 1 : 0) ? (
            <Button type="button" variant="outline" className="rounded-[var(--f-radio)] h-11" onClick={() => irAPantalla(idx - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> {navegacion.anterior}
            </Button>
          ) : <span />}
          {ultimo ? (
            <Button type="button" onClick={enviar} disabled={enviando}
              className="rounded-[var(--f-radio)] h-11 bg-[var(--f-boton)] hover:bg-[var(--f-boton)] hover:opacity-90 text-[color:var(--f-boton-texto)] shadow-[var(--f-sombra)]">
              {enviando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {modo === 'vista' ? `Probar: ${navegacion.enviar}` : enviando ? 'Enviando…' : navegacion.enviar}
            </Button>
          ) : (
            <Button type="button" onClick={siguiente}
              className="rounded-[var(--f-radio)] h-11 bg-[var(--f-boton)] hover:bg-[var(--f-boton)] hover:opacity-90 text-[color:var(--f-boton-texto)] shadow-[var(--f-sombra)]">
              {navegacion.siguiente} {pantalla.tipo === 'una' ? <CornerDownLeft className="h-4 w-4 ml-1.5 opacity-70" /> : <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          )}
        </div>
      )}
    </>,
  );
}

function Progreso({ tipo, etiqueta, pct, pasos, actual, resumen }) {
  if (tipo === 'porcentaje') return <p className="text-sm text-[color:var(--f-suave)]">{pct}% completado</p>;
  if (tipo === 'pasos') {
    const i = pasos.findIndex((p) => p.id === actual);
    return (
      <ol className="flex gap-1.5" aria-label="Pasos">
        {pasos.map((p, j) => (
          <li key={p.id} aria-current={j === i ? 'step' : undefined} className={`flex-1 min-w-0 flex flex-col gap-1 text-[11px] ${j === i ? 'text-[color:var(--f-texto)] font-semibold' : 'text-[color:var(--f-suave)]'}`}>
            <span className={`h-1.5 rounded-full ${resumen || j <= i ? 'bg-[var(--f-acento)]' : 'bg-[var(--f-pista)]'}`} />
            <span className="truncate">{p.nombre}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium truncate">{etiqueta}</span>
        <span className="text-[color:var(--f-suave)] text-xs">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--f-pista)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full bg-[var(--f-acento)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Bienvenida({ form, diseno, onEmpezar }) {
  const b = diseno.bienvenida;
  const centro = diseno.alineacion === 'centro';
  return (
    <div className={`${TARJETA} p-6 sm:p-8 flex flex-col gap-4 ${centro ? 'items-center text-center' : ''}`}>
      {diseno.portada_imagen_id && (
        <AuthedImg url={`/formularios-v2/${form.id}/imagenes/${diseno.portada_imagen_id}`} className="w-full max-h-56 object-cover rounded-[var(--f-radio)]" />
      )}
      <h2 style={TITULO} className="text-2xl sm:text-3xl font-semibold leading-tight">{b.titulo || form.titulo}</h2>
      {(b.texto || form.descripcion) && <p className="text-[color:var(--f-suave)] whitespace-pre-line max-w-[60ch]">{b.texto || form.descripcion}</p>}
      <Button type="button" onClick={onEmpezar}
        className="self-start rounded-[var(--f-radio)] h-12 px-6 bg-[var(--f-boton)] hover:bg-[var(--f-boton)] hover:opacity-90 text-[color:var(--f-boton-texto)] shadow-[var(--f-sombra)]"
        style={centro ? { alignSelf: 'center' } : undefined}>
        {b.boton || 'Empezar'}
      </Button>
    </div>
  );
}

const spanDe = (it, diseno) => {
  const a = it.apariencia?.ancho || 'auto';
  if (a === 'completo' || (a === 'auto' && ['encabezado', 'separador', 'instrucciones', 'imagen', 'matriz', 'tabla', 'repetible'].includes(it.tipo))) return 6;
  if (a === 'mitad') return 3;
  if (a === 'tercio') return 2;
  return { 1: 6, 2: 3, 3: 2 }[diseno.columnas] || 6;
};

function Seccion({ s, props, diseno, compacto }) {
  const tarjetas = diseno.tarjetas;
  return (
    <section className={tarjetas ? 'flex flex-col gap-3' : `${TARJETA} ${compacto ? 'p-3.5' : 'p-4 sm:p-5'}`}>
      {s.nombre && <h3 style={TITULO} className={`font-semibold text-base ${tarjetas ? '' : 'mb-3'}`}>{s.nombre}</h3>}
      <div className="grid grid-cols-6 gap-[var(--f-gap)]">
        {s.items.map((it) => (
          <div key={it.id} className={`col-span-6 ${compacto ? '' : SPAN[spanDe(it, diseno)]}`}>
            <div className={tarjetas && it.tipo !== 'separador' ? `${TARJETA} h-full ${compacto ? 'p-3.5' : 'p-4'}` : ''}>
              <Pregunta {...props(it)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Checklist: una fila por punto; Cumple / Sí-No con botones cortos, el resto como siempre.
function SeccionChecklist({ s, props, valores }) {
  const conPuntaje = s.items.filter((it) => it.puntaje && it.max > 0);
  const hechos = conPuntaje.reduce((a, it) => {
    const o = (it.opciones || []).find((x) => x.id === valores[it.id]);
    return o && !o.na ? { pts: a.pts + Math.max(0, o.pts || 0), max: a.max + it.max } : a;
  }, { pts: 0, max: 0 });
  return (
    <section className={`${TARJETA} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[var(--f-acento-suave)]">
        <h3 style={TITULO} className="font-semibold text-sm">{s.nombre || 'Sin nombre'}</h3>
        {hechos.max > 0 && <span className="text-xs font-semibold">{hechos.pts} / {hechos.max}</span>}
      </div>
      {s.items.map((it) => {
        const p = props(it);
        if (it.tipo !== 'cumple' && it.tipo !== 'sino') {
          return <div key={it.id} className="px-4 py-3 border-t border-[color:var(--f-borde)]"><Pregunta {...p} /></div>;
        }
        return (
          <div key={it.id} id={`pregunta-${it.id}`} className="px-4 py-2.5 border-t border-[color:var(--f-borde)] scroll-mt-24">
            <div className="flex items-center gap-2">
              <p className="flex-1 min-w-0 text-sm leading-snug">{p.n}. {nombreDe(it)}{it.obligatoria && <span className="text-[#dc2626]"> *</span>}</p>
              <div role="radiogroup" aria-label={nombreDe(it)} className="flex gap-1 shrink-0">
                {it.opciones.map((o) => {
                  const on = p.valor === o.id;
                  const tono = o.falla || o.label === 'No' ? 'mal' : o.na ? 'na' : 'ok';
                  const corto = { Cumple: '✓', 'No cumple': '✕', 'No aplica': 'N/A' }[o.label] || o.label;
                  const colores = {
                    ok: on ? 'border-[#16a34a] bg-[rgba(22,163,74,0.12)] text-[#15803d] dark:text-[#4ade80]' : 'text-[#15803d] dark:text-[#4ade80]',
                    mal: on ? 'border-[#dc2626] bg-[rgba(220,38,38,0.1)] text-[#b91c1c] dark:text-[#f87171]' : 'text-[#b91c1c] dark:text-[#f87171]',
                    na: on ? 'border-[color:var(--f-texto)] bg-[var(--f-pista)]' : 'text-[color:var(--f-suave)]',
                  }[tono];
                  return (
                    <button key={o.id} type="button" role="radio" aria-checked={on} aria-label={o.label} title={o.label}
                      onClick={() => p.onValor(on ? null : o.id)}
                      className={`h-10 min-w-[40px] px-2 rounded-[var(--f-radio-chico)] border text-sm font-bold ${on ? 'border-2' : 'border-[color:var(--f-borde)] bg-transparent'} ${colores}`}>
                      {corto}
                    </button>
                  );
                })}
              </div>
            </div>
            <Extra {...p} />
            {p.error && <p className="text-xs text-[#dc2626] mt-1" role="alert">{p.error}</p>}
          </div>
        );
      })}
    </section>
  );
}

function UnaPregunta({ pantalla, props }) {
  return (
    <div className="flex flex-col gap-4 py-2 sm:py-6">
      {pantalla.items.filter((it) => it !== pantalla.pregunta).map((it) => <Pregunta key={it.id} {...props(it)} />)}
      {pantalla.pregunta && <Pregunta {...props(pantalla.pregunta)} grande />}
    </div>
  );
}

function textoRespuesta(it, valor, archivos, listas, todos) {
  if (DE_ARCHIVOS.has(it.tipo)) {
    const n = (archivos || []).length;
    return it.tipo === 'firma' ? (n ? 'Firmado' : '—') : (n ? `${n} archivo${n === 1 ? '' : 's'}` : '—');
  }
  if (EN_FILAS.has(it.tipo)) {
    const n = filasConDatos(it, valor, todos).length;
    return n ? `${n} ${n === 1 ? 'fila' : 'filas'}` : '—';
  }
  if (valor === undefined || valor === null || valor === '' || (Array.isArray(valor) && !valor.length)) return '—';
  if (it.tipo === 'moneda') return dinero(valor, it.config?.simbolo);
  if (it.tipo === 'porcentaje') return `${cifra(valor)} %`;
  if (it.tipo === 'calculado') return textoCalculado(it, valor);
  if (it.tipo === 'direccion') return [valor.direccion, valor.ciudad].filter(Boolean).join(', ');
  if (it.tipo === 'ubicacion') return `${valor.lat.toFixed(5)}, ${valor.lng.toFixed(5)}`;
  if (it.tipo === 'matriz') return `${Object.keys(valor).length} de ${it.config?.filas?.length} filas`;
  if (it.opciones) {
    const ids = Array.isArray(valor) ? valor : [valor];
    return ids.map((v) => it.opciones.find((o) => o.id === v)?.label).filter(Boolean).join(', ');
  }
  if (it.tipo === 'colaborador') return listas?.colaboradores?.find((c) => c.id === valor)?.nombre || '—';
  if (it.tipo === 'caja') return listas?.cajas?.find((c) => c.id === valor)?.nombre || '—';
  if (it.tipo === 'escala' || it.tipo === 'estrellas') return `${valor} de ${it.config?.max}`;
  return String(valor);
}

function Resumen({ items, valores, archivos, listas, numeros, onCambiar }) {
  return (
    <div className={`${TARJETA} p-4 sm:p-5 flex flex-col gap-2`}>
      <h3 style={TITULO} className="font-semibold text-lg">Revisa antes de enviar</h3>
      {items.map((it) => (
        <div key={it.id} className="flex items-start gap-3 py-2 border-t border-[color:var(--f-borde)] first:border-0">
          <span className="flex-1 min-w-0">
            <span className="block text-xs text-[color:var(--f-suave)]">{numeros[it.id]}. {nombreDe(it)}</span>
            <span className="block text-sm font-semibold break-words">{textoRespuesta(it, valores[it.id], archivos[it.id], listas, archivos)}</span>
          </span>
          {it.tipo !== 'calculado' && <button type="button" onClick={() => onCambiar(it.id)} className="text-xs underline text-[color:var(--f-principal)] shrink-0">Cambiar</button>}
        </div>
      ))}
    </div>
  );
}

function Pregunta({ it, n, form, listas, valor, error, archivos, evidencia, nota, onValor, onArchivos, onEvidencia, onNota, grande = false, diseno, urlDe, fotosDe, onFotos }) {
  const campoId = useId();
  if (it.tipo === 'separador') return <hr className="border-dashed border-[color:var(--f-borde)]" />;
  if (it.tipo === 'encabezado') {
    return (
      <div className="pt-1">
        <h4 style={TITULO} className="text-lg font-semibold">{it.titulo || 'Encabezado'}</h4>
        {it.descripcion && <p className="text-sm text-[color:var(--f-suave)] mt-0.5 whitespace-pre-line">{it.descripcion}</p>}
      </div>
    );
  }
  if (it.tipo === 'instrucciones') {
    return (
      <div className="rounded-[var(--f-radio-chico)] bg-[var(--f-acento-suave)] p-3.5 flex gap-2.5 text-left">
        <Info className="h-4 w-4 text-[color:var(--f-acento)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          {it.titulo && <p className="text-sm font-semibold">{it.titulo}</p>}
          <p className="text-sm whitespace-pre-line">{it.config?.texto || it.descripcion}</p>
        </div>
      </div>
    );
  }
  if (it.tipo === 'imagen') {
    return (
      <figure>
        {it.config?.imagen_id
          ? <AuthedImg url={`/formularios-v2/${form.id}/imagenes/${it.config.imagen_id}`} className="w-full max-h-[420px] object-contain rounded-[var(--f-radio-chico)] border border-[color:var(--f-borde)]" />
          : <div className="h-32 rounded-[var(--f-radio-chico)] border border-dashed border-[color:var(--f-borde)] grid place-items-center text-sm text-[color:var(--f-suave)]">Imagen sin cargar</div>}
        {(it.titulo || it.descripcion) && <figcaption className="text-xs text-[color:var(--f-suave)] mt-1.5">{it.titulo}{it.titulo && it.descripcion ? ' · ' : ''}{it.descripcion}</figcaption>}
      </figure>
    );
  }

  const conGrupo = ['unica', 'multiple', 'sino', 'cumple', 'escala', 'estrellas', 'matriz', 'tabla', 'repetible', 'direccion', 'ubicacion', 'calculado'].includes(it.tipo);
  const Titulo = conGrupo ? 'p' : 'label';
  return (
    <div id={`pregunta-${it.id}`} className="scroll-mt-24">
      {grande && n && <p className="text-sm font-semibold text-[color:var(--f-acento)] mb-1">{n} →</p>}
      <Titulo {...(conGrupo ? { id: `${campoId}-t` } : { htmlFor: campoId })} style={grande ? TITULO : undefined}
        className={`block font-semibold ${grande ? 'text-xl sm:text-2xl leading-snug' : 'text-sm'}`}>
        {!grande && n ? `${n}. ` : ''}{nombreDe(it)}{it.obligatoria && <span className="text-[#dc2626]" aria-label="obligatoria"> *</span>}
      </Titulo>
      {it.descripcion && <p className="text-sm text-[color:var(--f-suave)] mt-0.5 whitespace-pre-line">{it.descripcion}</p>}
      <div className={grande ? 'mt-4' : 'mt-2'}>
        <Campo it={it} id={campoId} listas={listas} valor={valor} archivos={archivos} onValor={onValor} onArchivos={onArchivos} error={error} grande={grande} form={form} urlDe={urlDe} fotosDe={fotosDe} onFotos={onFotos} />
      </div>
      {it.ayuda && <p className="text-xs text-[color:var(--f-suave)] mt-1.5">{it.ayuda}</p>}
      <Extra it={it} valor={valor} evidencia={evidencia} nota={nota} onEvidencia={onEvidencia} onNota={onNota} urlDe={urlDe} />
      {error && <p className="text-xs text-[#dc2626] mt-1.5" role="alert">{error}</p>}
    </div>
  );
}

// Debajo de la pregunta: foto de evidencia, observación y aviso de seguimiento.
function Extra({ it, valor, evidencia, nota, onEvidencia, onNota, urlDe }) {
  const conFoto = pideEvidencia(it, valor);
  const abre = disparaSeguimiento(it, valor);
  if (!conFoto && !abre) return null;
  return (
    <div className="mt-2.5 rounded-[var(--f-radio-chico)] bg-[var(--f-pista)] p-3 flex flex-col gap-2 text-left">
      {abre && (
        <p className="text-xs font-medium text-[#8a4b0f] dark:text-[#f5b56b] flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" /> Al enviar se abrirá un seguimiento para corregir esto.</p>
      )}
      {conFoto && (
        <div>
          <p className="text-xs font-medium mb-2">
            Foto de evidencia{(it.evidencia === 'obligatoria' || it.evidencia === 'si_no_cumple') ? <span className="text-[#dc2626]"> *</span> : ' (opcional)'}
          </p>
          <Fotos lista={evidencia} onCambio={onEvidencia} varios camara urlDe={urlDe} />
        </div>
      )}
      <Textarea value={nota} onChange={(e) => onNota(e.target.value)} rows={2} maxLength={1000}
        placeholder="Observación (opcional): qué encontraste" aria-label="Observación" className="text-sm bg-background" />
    </div>
  );
}

const opcionClase = (sel, tono, grande) => {
  const tonos = {
    ok: 'border-[#16a34a] bg-[rgba(22,163,74,0.1)] text-[#15803d] dark:text-[#4ade80]',
    mal: 'border-[#dc2626] bg-[rgba(220,38,38,0.08)] text-[#b91c1c] dark:text-[#f87171]',
    na: 'border-[color:var(--f-texto)] bg-[var(--f-pista)]',
    sel: 'border-[color:var(--f-acento)] bg-[var(--f-acento-suave)]',
  };
  return `${grande ? 'min-h-[52px] text-base' : 'min-h-[44px] text-sm'} rounded-[var(--f-radio-chico)] border px-3.5 py-2 text-left transition-colors ${sel ? `${tonos[tono] || tonos.sel} font-semibold border-2` : 'border-[color:var(--f-borde)] bg-transparent hover:bg-[var(--f-pista)]'}`;
};

const DISTRIBUCION = { lista: 'flex flex-col gap-2', fila: 'flex flex-wrap gap-2', cuadricula: 'grid grid-cols-2 sm:grid-cols-3 gap-2' };

function Opcion({ o, i, sel, tono, grande, form, onClick, rol, distribucion }) {
  return (
    <button type="button" role={rol} aria-checked={sel} onClick={onClick}
      className={`${opcionClase(sel, tono, grande)} ${o.imagen_id ? 'flex flex-col items-stretch gap-2 p-2' : 'flex items-center gap-2.5'}`}>
      {o.imagen_id && <AuthedImg url={`/formularios-v2/${form.id}/imagenes/${o.imagen_id}`} className="w-full aspect-[4/3] object-cover rounded-[var(--f-radio-chico)]" />}
      <span className="flex items-center gap-2.5">
        {(grande || distribucion === 'lista') && rol !== 'checkbox' && (
          <span className={`h-6 min-w-[24px] px-1 rounded-md border grid place-items-center text-[11px] ${sel ? 'border-current' : 'border-[color:var(--f-borde)] text-[color:var(--f-suave)]'}`}>{LETRAS[i]}</span>
        )}
        {rol === 'checkbox' && (
          <span className={`h-5 w-5 rounded border grid place-items-center shrink-0 ${sel ? 'bg-[var(--f-acento)] border-[color:var(--f-acento)] text-[color:var(--f-acento-texto)]' : 'border-[color:var(--f-borde)]'}`}>{sel && <Check className="h-3.5 w-3.5" />}</span>
        )}
        <span>{o.label}</span>
      </span>
    </button>
  );
}

function Campo({ it, id, listas, valor, archivos, onValor, onArchivos, error, grande, form, urlDe, fotosDe, onFotos }) {
  const invalido = error ? { 'aria-invalid': true } : {};
  const alto = grande ? 'h-12 text-base' : 'h-11';
  const dist = DISTRIBUCION[it.apariencia?.opciones] || (['sino', 'cumple'].includes(it.tipo) && !grande ? DISTRIBUCION.fila : DISTRIBUCION.lista);
  switch (it.tipo) {
    case 'corto': return <Input id={id} value={valor || ''} onChange={(e) => onValor(e.target.value)} className={alto} {...invalido} />;
    case 'largo': return <Textarea id={id} value={valor || ''} onChange={(e) => onValor(e.target.value)} rows={grande ? 4 : 3} {...invalido} />;
    case 'numero': return <Input id={id} type="number" inputMode="decimal" value={valor ?? ''} onChange={(e) => onValor(e.target.value)} className={`${alto} max-w-[220px]`} {...invalido} />;
    case 'correo': return <Input id={id} type="email" inputMode="email" autoComplete="email" value={valor || ''} onChange={(e) => onValor(e.target.value)} className={alto} {...invalido} />;
    case 'telefono': return <Input id={id} type="tel" inputMode="tel" value={valor || ''} onChange={(e) => onValor(e.target.value)} className={`${alto} max-w-[260px]`} {...invalido} />;
    case 'fecha': return <Input id={id} type="date" value={valor || ''} onChange={(e) => onValor(e.target.value)} className={`${alto} max-w-[220px]`} {...invalido} />;
    case 'hora': return <Input id={id} type="time" value={valor || ''} onChange={(e) => onValor(e.target.value)} className={`${alto} max-w-[160px]`} {...invalido} />;
    case 'fechahora': return <Input id={id} type="datetime-local" value={valor || ''} onChange={(e) => onValor(e.target.value)} className={`${alto} max-w-[260px]`} {...invalido} />;
    case 'lista':
      return (
        <NativeSelect id={id} value={valor || ''} onChange={onValor} className="max-w-[420px]" {...invalido}>
          <option value="">Elige una opción…</option>
          {it.opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </NativeSelect>
      );
    case 'sucursal':
      return (
        <NativeSelect id={id} value={valor || ''} onChange={onValor} className="max-w-[260px]" {...invalido}>
          <option value="">Elige la sucursal…</option>
          {(listas?.sucursales || ['H1', 'H2', 'H4', 'H5', 'H6']).map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
      );
    case 'unica': case 'sino': case 'cumple':
      return (
        <div role="radiogroup" aria-labelledby={`${id}-t`} className={dist}>
          {it.opciones.map((o, i) => {
            const tono = it.tipo === 'cumple' ? (o.falla ? 'mal' : o.na ? 'na' : 'ok') : it.tipo === 'sino' ? (o.label === 'Sí' ? 'ok' : 'mal') : 'sel';
            return <Opcion key={o.id} o={o} i={i} sel={valor === o.id} tono={tono} grande={grande} form={form} rol="radio" distribucion={it.apariencia?.opciones}
              onClick={() => onValor(valor === o.id ? null : o.id)} />;
          })}
        </div>
      );
    case 'multiple': {
      const sel = Array.isArray(valor) ? valor : [];
      return (
        <div role="group" aria-labelledby={`${id}-t`} className={dist}>
          {it.opciones.map((o, i) => {
            const on = sel.includes(o.id);
            return <Opcion key={o.id} o={o} i={i} sel={on} tono="sel" grande={grande} form={form} rol="checkbox"
              onClick={() => onValor(on ? sel.filter((x) => x !== o.id) : [...sel, o.id])} />;
          })}
        </div>
      );
    }
    case 'escala': {
      const max = it.config?.max || 10;
      return (
        <div role="radiogroup" aria-labelledby={`${id}-t`} className="flex flex-wrap gap-1.5">
          {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={Number(valor) === v} onClick={() => onValor(Number(valor) === v ? null : v)}
              className={`${grande ? 'h-12 w-12' : 'h-11 w-11'} rounded-[var(--f-radio-chico)] border text-sm font-semibold ${Number(valor) === v ? 'bg-[var(--f-acento)] border-[color:var(--f-acento)] text-[color:var(--f-acento-texto)]' : 'border-[color:var(--f-borde)] hover:bg-[var(--f-pista)]'}`}>{v}</button>
          ))}
        </div>
      );
    }
    case 'estrellas': {
      const max = it.config?.max || 5;
      return (
        <div role="radiogroup" aria-labelledby={`${id}-t`} className="flex gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={Number(valor) === v} aria-label={`${v} de ${max}`} onClick={() => onValor(Number(valor) === v ? null : v)}
              className="h-11 w-11 grid place-items-center rounded-[var(--f-radio-chico)] hover:bg-[var(--f-pista)]">
              <Star className={`h-7 w-7 ${Number(valor) >= v ? 'fill-[#ec9032] text-[#ec9032]' : 'text-[color:var(--f-suave)] opacity-60'}`} />
            </button>
          ))}
        </div>
      );
    }
    case 'colaborador':
      return <ElegirConBuscador id={id} valor={valor} onValor={onValor} cargando={!listas} placeholder="Busca por nombre…"
        opciones={(listas?.colaboradores || []).map((c) => ({ id: c.id, nombre: c.nombre, detalle: c.cargo }))} />;
    case 'caja':
      return <ElegirConBuscador id={id} valor={valor} onValor={onValor} cargando={!listas} placeholder="Busca el área…"
        opciones={(listas?.cajas || []).map((c) => ({ id: c.id, nombre: c.nombre }))} />;
    case 'foto': return <Fotos lista={archivos} onCambio={onArchivos} varios={!!it.config?.varios} urlDe={urlDe} />;
    case 'camara': return <Fotos lista={archivos} onCambio={onArchivos} varios={!!it.config?.varios} soloCamara urlDe={urlDe} />;
    case 'archivo': return <Adjuntos lista={archivos} onCambio={onArchivos} varios={!!it.config?.varios} />;
    case 'firma': return <Firma valor={archivos[0]} onCambio={(f) => onArchivos(f ? [f] : [])} urlDe={urlDe} />;
    case 'moneda': {
      const simbolo = it.config?.simbolo || 'L';
      return (
        <div className="relative max-w-[240px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--f-suave)] pointer-events-none">{simbolo}</span>
          <Input id={id} type="number" inputMode="decimal" step="0.01" value={valor ?? ''} onChange={(e) => onValor(e.target.value)} style={{ paddingLeft: 16 + simbolo.length * 10 }} className={alto} {...invalido} />
        </div>
      );
    }
    case 'porcentaje':
      return (
        <div className="relative max-w-[160px]">
          <Input id={id} type="number" inputMode="decimal" value={valor ?? ''} onChange={(e) => onValor(e.target.value)} className={`${alto} pr-8`} {...invalido} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[color:var(--f-suave)] pointer-events-none">%</span>
        </div>
      );
    case 'direccion': {
      const d = valor || {};
      const cambiar = (patch) => { const sig = { direccion: '', ciudad: '', ...d, ...patch }; onValor(sig.direccion || sig.ciudad ? sig : null); };
      return (
        <div className="flex flex-col gap-2 max-w-[520px]">
          <Input aria-label="Dirección" autoComplete="off" placeholder="Colonia, calle, número o referencia" value={d.direccion || ''} onChange={(e) => cambiar({ direccion: e.target.value })} className={alto} {...invalido} />
          <Input aria-label="Ciudad" autoComplete="off" placeholder="Ciudad" value={d.ciudad || ''} onChange={(e) => cambiar({ ciudad: e.target.value })} className={alto} />
        </div>
      );
    }
    case 'ubicacion': return <Ubicacion valor={valor} onValor={onValor} />;
    case 'articulo':
      return <ElegirConBuscador id={id} valor={valor} onValor={onValor} placeholder="Busca el artículo…"
        opciones={(it.config?.lista || []).map((x) => x.trim()).filter(Boolean).map((x) => ({ id: x, nombre: x }))} />;
    case 'calculado':
      return (
        <output id={id} aria-live="polite" className={`${grande ? 'min-h-[48px] text-base' : 'min-h-[44px] text-sm'} inline-flex items-center min-w-[140px] px-3.5 rounded-[var(--f-radio-chico)] bg-[var(--f-pista)] font-semibold`}>
          {textoCalculado(it, valor) || '—'}
        </output>
      );
    case 'matriz': {
      const sel = valor || {};
      const elegir = (f, c) => {
        const sig = { ...sel };
        if (sig[f] === c) delete sig[f]; else sig[f] = c;
        onValor(Object.keys(sig).length ? sig : null);
      };
      return (
        <div className="flex flex-col gap-3">
          {(it.config?.filas || []).map((f) => (
            <div key={f.id} role="radiogroup" aria-label={f.label} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-left">
              <span className="text-sm sm:flex-1 min-w-0">{f.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {(it.config?.columnas || []).map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={sel[f.id] === c.id} onClick={() => elegir(f.id, c.id)} className={opcionClase(sel[f.id] === c.id, 'sel', false)}>{c.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'tabla': case 'repetible': return <Filas it={it} valor={valor} onValor={onValor} fotosDe={fotosDe} onFotos={onFotos} urlDe={urlDe} />;
    default: return null;
  }
}

function Ubicacion({ valor, onValor }) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState('');
  const tomar = () => {
    if (!navigator.geolocation) { setAviso('Este equipo no puede dar la ubicación.'); return; }
    setBuscando(true);
    setAviso('');
    navigator.geolocation.getCurrentPosition((p) => {
      setBuscando(false);
      onValor({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy), at: new Date().toISOString() });
    }, (e) => {
      setBuscando(false);
      setAviso({
        1: 'No diste permiso. Actívalo para este sitio en tu navegador y vuelve a intentar.',
        3: 'Tardó demasiado. Busca mejor señal y vuelve a intentar.',
      }[e.code] || 'No se pudo obtener la ubicación. Vuelve a intentar.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  return (
    <div className="flex flex-col gap-2 items-start text-left">
      {valor && (
        <p className="text-sm">
          <span className="font-semibold">{valor.lat.toFixed(5)}, {valor.lng.toFixed(5)}</span>
          {valor.precision !== null && valor.precision !== undefined && <span className="text-[color:var(--f-suave)]"> · ±{valor.precision} m</span>}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="rounded-[var(--f-radio-chico)] h-11" disabled={buscando} onClick={tomar}>
          {buscando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <MapPin className="h-4 w-4 mr-1.5" />}
          {buscando ? 'Buscando…' : valor ? 'Volver a tomar' : 'Guardar mi ubicación'}
        </Button>
        {valor && <a href={urlMapa(valor)} target="_blank" rel="noreferrer" className="text-sm underline text-[color:var(--f-principal)]">Ver en el mapa</a>}
        {valor && <button type="button" onClick={() => onValor(null)} className="text-sm underline text-[color:var(--f-suave)]">Quitar</button>}
      </div>
      {aviso && <p className="text-xs text-[#dc2626]" role="alert">{aviso}</p>}
    </div>
  );
}

function CeldaFila({ c, valor, onValor, etiqueta }) {
  const alto = 'h-11';
  const cambiar = (e) => onValor(e.target.value);
  if (c.tipo === 'largo') return <Textarea aria-label={etiqueta} rows={2} value={valor || ''} onChange={cambiar} />;
  if (c.tipo === 'numero') return <Input aria-label={etiqueta} type="number" inputMode="decimal" value={valor ?? ''} onChange={cambiar} className={alto} />;
  if (c.tipo === 'fecha') return <Input aria-label={etiqueta} type="date" value={valor || ''} onChange={cambiar} className={alto} />;
  if (c.tipo === 'lista') {
    return (
      <NativeSelect aria-label={etiqueta} value={valor || ''} onChange={onValor}>
        <option value="">Elige…</option>
        {(c.opciones || []).map((x) => x.trim()).filter(Boolean).map((x) => <option key={x} value={x}>{x}</option>)}
      </NativeSelect>
    );
  }
  return <Input aria-label={etiqueta} autoComplete="off" value={valor || ''} onChange={cambiar} className={alto} />;
}

// Tabla editable y grupo repetible: filas que la persona va agregando.
function Filas({ it, valor, onValor, fotosDe, onFotos, urlDe }) {
  const filas = Array.isArray(valor) ? valor : [];
  const { columnas = [], max_filas: tope = 20, boton } = it.config || {};
  const repetible = it.tipo === 'repetible';
  const cambiar = (f, cid, v) => onValor(filas.map((x) => (x.id === f.id ? { ...x, valores: { ...x.valores, [cid]: v } } : x)));
  const quitar = (f) => {
    columnas.filter((c) => c.tipo === 'foto').forEach((c) => onFotos(claveFoto(it.id, f.id, c.id), []));
    const resto = filas.filter((x) => x.id !== f.id);
    onValor(resto.length ? resto : null);
  };
  return (
    <div className="flex flex-col gap-2.5 text-left">
      {filas.map((f, i) => (
        <div key={f.id} className="rounded-[var(--f-radio-chico)] border border-[color:var(--f-borde)] p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-[color:var(--f-suave)]">{repetible ? `${nombreDe(it)} ${i + 1}` : `Fila ${i + 1}`}</span>
            <button type="button" aria-label={`Quitar fila ${i + 1}`} onClick={() => quitar(f)} className="h-9 w-9 -mr-1.5 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[var(--f-pista)]"><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className={repetible ? 'flex flex-col gap-3' : 'grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]'}>
            {columnas.map((c) => (
              <div key={c.id} className="min-w-0 flex flex-col gap-1">
                <span className="text-xs font-medium">{c.nombre}{c.obligatoria && <span className="text-[#dc2626]"> *</span>}</span>
                {c.tipo === 'foto' ? (
                  <Fotos lista={fotosDe(claveFoto(it.id, f.id, c.id))} onCambio={(l) => onFotos(claveFoto(it.id, f.id, c.id), l)} varios urlDe={urlDe} />
                ) : (
                  <CeldaFila c={c} etiqueta={`${c.nombre}, fila ${i + 1}`} valor={f.valores?.[c.id]} onValor={(v) => cambiar(f, c.id, v)} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {filas.length < tope ? (
        <Button type="button" variant="outline" className="self-start rounded-[var(--f-radio-chico)] h-11" onClick={() => onValor([...filas, { id: uid(), valores: {} }])}>
          <Plus className="h-4 w-4 mr-1.5" /> {repetible ? boton || 'Agregar otro' : 'Agregar fila'}
        </Button>
      ) : <p className="text-xs text-[color:var(--f-suave)]">Llegaste al máximo de {tope} filas.</p>}
    </div>
  );
}

// Lista con buscador (colaborador, caja, persona): desplegable propio, no <datalist>.
export function ElegirConBuscador({ id, valor, onValor, opciones, placeholder, cargando }) {
  const listId = useId();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(-1);
  const cierre = useRef(null);
  const elegido = opciones.find((o) => o.id === valor);
  const filtro = sinAcentos(q.trim());
  const visibles = opciones.filter((o) => !filtro || sinAcentos(`${o.nombre} ${o.detalle || ''}`).includes(filtro)).slice(0, 80);
  useEffect(() => () => clearTimeout(cierre.current), []);
  const elegir = (o) => { onValor(o.id); setAbierto(false); setQ(''); setActivo(-1); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(visibles.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && abierto && visibles[activo]) { e.preventDefault(); elegir(visibles[activo]); }
    else if (e.key === 'Escape' && abierto) { e.preventDefault(); e.stopPropagation(); setAbierto(false); }
  };
  return (
    <div className="relative max-w-[460px] text-left">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input id={id} role="combobox" aria-expanded={abierto} aria-controls={listId} autoComplete="off"
        value={abierto ? q : (elegido ? `${elegido.nombre}${elegido.detalle ? ` · ${elegido.detalle}` : ''}` : '')}
        placeholder={cargando ? 'Cargando…' : placeholder}
        onFocus={() => { clearTimeout(cierre.current); setAbierto(true); }}
        onBlur={() => { cierre.current = setTimeout(() => setAbierto(false), 150); }}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); setActivo(-1); }}
        onKeyDown={onKeyDown} className="h-11 pl-9 pr-9" />
      {valor && !abierto && (
        <button type="button" aria-label="Quitar" onClick={() => onValor(null)} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      )}
      {abierto && (
        <div id={listId} role="listbox" onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full mt-1.5 z-50 max-h-72 overflow-y-auto overscroll-contain rounded-xl border bg-popover text-popover-foreground shadow-lg p-1">
          {visibles.length === 0 ? <p className="px-3 py-2.5 text-sm text-muted-foreground">{cargando ? 'Cargando…' : 'Sin coincidencias'}</p>
            : visibles.map((o, i) => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === valor} onClick={() => elegir(o)} onMouseEnter={() => setActivo(i)}
                className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${o.id === valor ? 'bg-[rgba(30,57,94,0.08)] font-semibold dark:bg-[rgba(60,190,246,0.14)]' : i === activo ? 'bg-[rgba(0,165,223,0.08)]' : 'hover:bg-[rgba(0,165,223,0.08)]'}`}>
                <span className="min-w-0">{o.nombre}{o.detalle && <span className="block text-xs text-muted-foreground font-normal">{o.detalle}</span>}</span>
                {o.id === valor && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function Fotos({ lista, onCambio, varios, soloCamara = false, camara = false, urlDe }) {
  const cam = useRef(null);
  const gal = useRef(null);
  const tope = varios ? MAX_FOTOS : 1;
  const agregar = async (files) => {
    const nuevas = [];
    for (const f of Array.from(files || []).slice(0, tope - lista.length)) {
      if (!f.type.startsWith('image/')) { toast.error('Solo se aceptan fotos'); continue; }
      try { const { blob, dataUrl } = await compressImage(f); nuevas.push({ blob, dataUrl, nombre: `${f.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg` }); }
      catch (e) { toast.error('No se pudo leer una foto'); }
    }
    onCambio(varios ? [...lista, ...nuevas] : nuevas.slice(0, 1));
  };
  const caja = 'h-20 min-w-[80px] px-3 rounded-[var(--f-radio-chico)] border border-dashed border-[color:var(--f-borde)] flex flex-col items-center justify-center gap-1 text-xs text-[color:var(--f-suave)] hover:bg-[var(--f-pista)]';
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {lista.map((f, i) => (
        <div key={i} className="relative">
          {f.dataUrl
            ? <img src={f.dataUrl} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-[var(--f-radio-chico)] object-cover border border-[color:var(--f-borde)]" />
            : <AuthedImg url={urlDe(f)} className="h-20 w-20 rounded-[var(--f-radio-chico)] object-cover border border-[color:var(--f-borde)]" />}
          {f.subiendo && <span className="absolute inset-0 grid place-items-center rounded-[var(--f-radio-chico)] bg-black/40 text-white"><Loader2 className="h-5 w-5 animate-spin" /></span>}
          <button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => onCambio(lista.filter((_, j) => j !== i))}
            className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-[#dc2626] text-white grid place-items-center shadow"><X className="h-4 w-4" /></button>
        </div>
      ))}
      {lista.length < tope && (
        <>
          <button type="button" onClick={() => cam.current?.click()} className={caja}><Camera className="h-5 w-5" /> Tomar foto</button>
          {!soloCamara && <button type="button" onClick={() => gal.current?.click()} className={caja}><ImagePlus className="h-5 w-5" /> {camara ? 'De la galería' : 'Elegir'}</button>}
        </>
      )}
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      <input ref={gal} type="file" accept="image/*" multiple={varios} className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

const MAX_ARCHIVO = 10 * 1024 * 1024;
function Adjuntos({ lista, onCambio, varios }) {
  const ref = useRef(null);
  const agregar = (files) => {
    const nuevos = [];
    Array.from(files || []).forEach((f) => {
      if (f.size > MAX_ARCHIVO) { toast.error(`${f.name} supera 10 MB`); return; }
      nuevos.push({ blob: f, nombre: f.name, tamano: f.size });
    });
    onCambio(varios ? [...lista, ...nuevos].slice(0, MAX_FOTOS) : nuevos.slice(0, 1));
  };
  return (
    <div className="space-y-2">
      {lista.map((f, i) => (
        <div key={i} className="flex items-center gap-2 rounded-[var(--f-radio-chico)] border border-[color:var(--f-borde)] px-3 py-2 text-sm max-w-[460px]">
          <Paperclip className="h-4 w-4 text-[color:var(--f-suave)] shrink-0" />
          <span className="flex-1 min-w-0 truncate">{f.nombre}</span>
          {f.subiendo ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : f.tamano > 0 && <span className="text-xs text-[color:var(--f-suave)] shrink-0">{Math.max(1, Math.round(f.tamano / 1024))} KB</span>}
          <button type="button" aria-label={`Quitar ${f.nombre}`} onClick={() => onCambio(lista.filter((_, j) => j !== i))} className="h-8 w-8 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[var(--f-pista)]"><X className="h-4 w-4" /></button>
        </div>
      ))}
      {(varios || !lista.length) && (
        <Button type="button" variant="outline" className="rounded-[var(--f-radio-chico)] h-11" onClick={() => ref.current?.click()}>
          <Paperclip className="h-4 w-4 mr-1.5" /> Adjuntar archivo
        </Button>
      )}
      <input ref={ref} type="file" multiple={varios} className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function Firma({ valor, onCambio, urlDe }) {
  const canvas = useRef(null);
  const dibujando = useRef(false);
  const hayTrazo = useRef(false);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1424';
  }, [valor]);
  const punto = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const empezar = (e) => { e.preventDefault(); canvas.current.setPointerCapture?.(e.pointerId); dibujando.current = true; const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...punto(e)); };
  const mover = (e) => { if (!dibujando.current) return; const ctx = canvas.current.getContext('2d'); ctx.lineTo(...punto(e)); ctx.stroke(); hayTrazo.current = true; };
  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    if (!hayTrazo.current) return;
    const dataUrl = canvas.current.toDataURL('image/png');
    canvas.current.toBlob((blob) => blob && onCambio({ blob, dataUrl, nombre: 'firma.png' }), 'image/png');
  };
  if (valor) {
    return (
      <div className="flex items-end gap-2">
        {valor.dataUrl
          ? <img src={valor.dataUrl} alt="Firma" className="h-28 w-full max-w-[420px] rounded-[var(--f-radio-chico)] border border-[color:var(--f-borde)] bg-white object-contain" />
          : <AuthedImg url={urlDe(valor)} className="h-28 w-full max-w-[420px] rounded-[var(--f-radio-chico)] border border-[color:var(--f-borde)] bg-white object-contain" />}
        <Button type="button" variant="outline" className="rounded-[var(--f-radio-chico)] h-11" onClick={() => { hayTrazo.current = false; onCambio(null); }}>
          <Eraser className="h-4 w-4 mr-1.5" /> Borrar
        </Button>
      </div>
    );
  }
  return (
    <div className="max-w-[420px]">
      <canvas ref={canvas} aria-label="Espacio para firmar" className="block h-36 w-full rounded-[var(--f-radio-chico)] border-2 border-dashed border-[color:var(--f-borde)] bg-white touch-none cursor-crosshair"
        onPointerDown={empezar} onPointerMove={mover} onPointerUp={terminar} onPointerLeave={terminar} onPointerCancel={terminar} />
      <p className="text-xs text-[color:var(--f-suave)] mt-1">Firma con el dedo o el mouse dentro del recuadro.</p>
    </div>
  );
}
