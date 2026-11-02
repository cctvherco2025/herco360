import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronLeft, Undo2, Redo2, Settings, Copy, Eye, History, Search, GripVertical, ChevronUp, ChevronDown, Trash2,
  MoreHorizontal, Monitor, Tablet, Smartphone, X, Loader2, ChevronRight, Shuffle, Ticket,
} from 'lucide-react';
import api from '@/lib/api';
import {
  TIPOS, PESTANAS, ESTADOS, CON_OPCIONES, SIN_RESPUESTA, uid, buscarTipos, nuevaPregunta, resumenDe, nombreDe, haceCuanto,
  conDefaults, anterioresA, numericasAntes, usosDe, quitarUsos, describirCondicion, describirSeguimiento, preguntasDe,
} from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmar } from '@/components/ConfirmDialog';
import Propiedades, { Icono } from '@/components/formularios/Propiedades';
import FormRenderer, { ElegirConBuscador } from '@/components/formularios/FormRenderer';
import { PublicarDialog, VersionesDialog } from '@/components/formularios/Versiones';
import PanelDiseno from '@/components/formularios/PanelDiseno';
import PanelNavegacion from '@/components/formularios/PanelNavegacion';
import PanelAsignaciones from '@/components/formularios/PanelAsignaciones';
import PanelSupervision from '@/components/formularios/PanelSupervision';
import PanelPermisos from '@/components/formularios/PanelPermisos';
import PanelAutomatizaciones from '@/components/formularios/PanelAutomatizaciones';
import ResultadosFormulario from '@/components/formularios/ResultadosFormulario';
import EditorCondicion from '@/components/formularios/Condicion';

const ESPERA_GUARDADO = 1200;
const TIPO_DND = 'text/x-herco-tipo';
const PREGUNTA_DND = 'text/x-herco-pregunta';

const clonar = (x) => JSON.parse(JSON.stringify(x));
const conIdsNuevos = (it) => ({ ...clonar(it), id: uid(), opciones: it.opciones?.map((o) => ({ ...o, id: uid() })) });

function useAhora(cada) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), cada); return () => clearInterval(t); }, [cada]);
  return ahora;
}

function useMedia(mq) {
  const [si, setSi] = useState(() => !!window.matchMedia?.(mq).matches);
  useEffect(() => {
    const m = window.matchMedia?.(mq);
    if (!m) return undefined;
    const f = () => setSi(m.matches);
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, [mq]);
  return si;
}

export default function ConstructorFormulario() {
  const { id } = useParams();
  const navigate = useNavigate();
  // ≥ 1024 px: propiedades a la derecha; ≥ 1400 px: también los componentes a la izquierda.
  // Más angosto, cada uno se abre en una hoja.
  const conPanel = useMedia('(min-width: 1024px)');
  const conPaleta = useMedia('(min-width: 1400px)');
  const ahora = useAhora(10000);

  const [cargado, setCargado] = useState(null); // datos fijos del servidor (estado, versión…)
  const [error, setError] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [asigEdit, setAsigEdit] = useState(null); // lo elegido en Asignaciones que todavía no se aplica
  const [cont, setCont] = useState({ pasos: [] });
  const [pasoId, setPasoId] = useState(null);
  const [selId, setSelId] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [futuro, setFuturo] = useState([]);
  const ultimaClave = useRef({ clave: null, t: 0 });

  const [guardado, setGuardado] = useState({ estado: 'ok', at: null });
  const rev = useRef(0);
  const firma = useRef(null); // lo último guardado (o cargado), en texto: si no cambió, no se guarda
  const cola = useRef(Promise.resolve(true));
  const timer = useRef(null);
  const ultimo = useRef({});

  const [verPaleta, setVerPaleta] = useState(null); // celular: sección donde se agrega
  const [verProps, setVerProps] = useState(false);
  const [verConfig, setVerConfig] = useState(false);
  const [verPrevia, setVerPrevia] = useState(false);
  const [verPublicar, setVerPublicar] = useState(false);
  const [verVersiones, setVerVersiones] = useState(false);
  const [pestana, setPestana] = useState('contenido');
  const [editCond, setEditCond] = useState(null); // { tipo: 'paso' | 'seccion', id }

  const aplicarDoc = useCallback((d) => {
    const datos = { titulo: d.titulo || '', descripcion: d.descripcion || '', contenido: conDefaults(d.borrador || { pasos: [] }) };
    firma.current = JSON.stringify(datos);
    setCargado(d);
    setTitulo(datos.titulo); setDescripcion(datos.descripcion); setCont(datos.contenido);
    setPasoId((p) => (datos.contenido.pasos.some((x) => x.id === p) ? p : datos.contenido.pasos[0]?.id || null));
    rev.current = d.rev; setGuardado({ estado: 'ok', at: d.guardado_at });
  }, []);

  useEffect(() => {
    let vivo = true;
    api.get(`/formularios-v2/${id}`).then(({ data }) => {
      if (!vivo) return;
      if (!data.puede_editar) { setError('No tienes permiso para abrir este formulario en el constructor.'); return; }
      aplicarDoc(data);
      if (!data.mis_permisos.editar) setPestana(data.mis_permisos.asignar ? 'asignaciones' : 'contenido');
    }).catch((e) => vivo && setError(e?.response?.data?.detail || 'No se pudo cargar el formulario'));
    return () => { vivo = false; };
  }, [id, aplicarDoc]);

  // Solo se guarda un formulario que de verdad se cargó (y con al menos un paso):
  // si la pantalla se reinicia sin datos, nunca se manda un borrador vacío.
  // Quien no puede editar (solo publica o asigna) lo ve sin guardar nada.
  const mis = cargado?.mis_permisos || {};
  const datosListos = !!cargado && cargado.id === id && cont.pasos.length > 0 && !!mis.editar;
  ultimo.current = datosListos ? { titulo, descripcion, contenido: cont } : null;
  const sinGuardar = () => !!ultimo.current && firma.current !== null && JSON.stringify(ultimo.current) !== firma.current;

  // ---- guardado automático -------------------------------------------------
  const guardarAhora = useCallback(async () => {
    const datos = ultimo.current;
    const texto = JSON.stringify(datos);
    if (!datos || firma.current === null || texto === firma.current) return true;
    setGuardado((g) => ({ ...g, estado: 'guardando' }));
    try {
      const { data } = await api.put(`/formularios-v2/${id}/borrador`, { rev: rev.current, ...datos });
      rev.current = data.rev; firma.current = texto;
      setGuardado({ estado: JSON.stringify(ultimo.current) === texto ? 'ok' : 'pendiente', at: data.guardado_at });
      setCargado((c) => (c ? { ...c, cambios_sin_publicar: data.cambios_sin_publicar } : c));
      return true;
    } catch (e) {
      if (e?.response?.status === 409) { setGuardado((g) => ({ ...g, estado: 'choque' })); return false; }
      setGuardado((g) => ({ ...g, estado: 'error', detalle: e?.response?.data?.detail }));
      if (!e?.response || e.response.status >= 500) { clearTimeout(timer.current); timer.current = setTimeout(() => { cola.current = cola.current.then(guardarAhora); }, 5000); }
      return false;
    }
  }, [id]);

  const guardarYa = useCallback(() => {
    clearTimeout(timer.current);
    cola.current = cola.current.then(guardarAhora);
    return cola.current;
  }, [guardarAhora]);

  useEffect(() => {
    if (!datosListos || firma.current === null) return;
    if (JSON.stringify({ titulo, descripcion, contenido: cont }) === firma.current) {
      setGuardado((g) => (g.estado === 'pendiente' ? { ...g, estado: 'ok' } : g));
      return;
    }
    setGuardado((g) => (g.estado === 'choque' || g.estado === 'guardando' ? g : { ...g, estado: 'pendiente' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { cola.current = cola.current.then(guardarAhora); }, ESPERA_GUARDADO);
  }, [titulo, descripcion, cont, guardarAhora, datosListos]);

  useEffect(() => {
    const antes = (e) => { if (sinGuardar()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', antes);
    return () => { window.removeEventListener('beforeunload', antes); clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // al salir de la pantalla dentro de la app: guarda lo pendiente
  useEffect(() => () => { guardarAhora(); }, [guardarAhora]);

  // ---- cambios con deshacer -------------------------------------------------
  const foto = () => ({ titulo, cont });
  const registrar = (clave) => {
    const t = Date.now();
    const seguido = clave && ultimaClave.current.clave === clave && t - ultimaClave.current.t < 1500;
    ultimaClave.current = { clave, t };
    if (!seguido) { setHistorial((h) => [...h, foto()].slice(-60)); setFuturo([]); }
  };
  const mutar = (fn, clave) => {
    registrar(clave);
    setCont((c) => { const n = clonar(c); fn(n); return n; });
  };
  const cambiarTitulo = (v) => { registrar('titulo'); setTitulo(v); };
  const deshacer = () => {
    if (!historial.length) return;
    const prev = historial[historial.length - 1];
    setFuturo((f) => [foto(), ...f]); setHistorial((h) => h.slice(0, -1));
    setTitulo(prev.titulo); setCont(prev.cont); ultimaClave.current = { clave: null, t: 0 };
  };
  const rehacer = () => {
    if (!futuro.length) return;
    const sig = futuro[0];
    setHistorial((h) => [...h, foto()]); setFuturo((f) => f.slice(1));
    setTitulo(sig.titulo); setCont(sig.cont); ultimaClave.current = { clave: null, t: 0 };
  };
  const deshacerRef = useRef(null);
  deshacerRef.current = deshacer;
  useEffect(() => {
    const tecla = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.target?.closest?.('[role=dialog]')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // ---- ubicar cosas ---------------------------------------------------------
  const paso = cont.pasos.find((p) => p.id === pasoId) || cont.pasos[0];
  const buscar = (c, qid) => {
    for (const p of c.pasos) for (const s of p.secciones) { const i = s.items.findIndex((it) => it.id === qid); if (i >= 0) return { p, s, i, it: s.items[i] }; }
    return null;
  };
  const sel = selId ? buscar(cont, selId) : null;
  const seccionDe = (c, sid) => { for (const p of c.pasos) { const s = p.secciones.find((x) => x.id === sid); if (s) return s; } return null; };

  // numeración corrida (las de estructura no cuentan)
  const numeros = useMemo(() => {
    const out = {}; let n = 0;
    cont.pasos.forEach((p) => p.secciones.forEach((s) => s.items.forEach((it) => { if (!SIN_RESPUESTA.has(it.tipo)) { n += 1; out[it.id] = n; } })));
    return out;
  }, [cont]);

  // ---- operaciones ----------------------------------------------------------
  const agregar = (tipo, secId = null, indice = null) => {
    const it = nuevaPregunta(tipo);
    mutar((c) => {
      let s = secId ? seccionDe(c, secId) : null;
      let i = indice;
      if (!s) {
        const actual = selId && buscar(c, selId);
        const p = c.pasos.find((x) => x.id === paso?.id);
        if (actual && p && actual.p.id === p.id) { s = actual.s; i = actual.i + 1; }
        else if (p) {
          if (!p.secciones.length) p.secciones.push({ id: uid(), nombre: 'General', items: [] });
          s = p.secciones[p.secciones.length - 1];
        }
      }
      if (!s) return;
      s.items.splice(i === null || i === undefined ? s.items.length : i, 0, it);
    }, 'agregar');
    setSelId(it.id);
    setVerPaleta(null);
    if (!conPanel) setVerProps(true);
    setTimeout(() => document.getElementById(`q-${it.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  };

  const moverA = (qid, secId, indice) => mutar((c) => {
    const de = buscar(c, qid);
    const a = seccionDe(c, secId);
    if (!de || !a) return;
    const [it] = de.s.items.splice(de.i, 1);
    let i = indice;
    if (de.s.id === a.id && de.i < indice) i -= 1;
    a.items.splice(Math.max(0, Math.min(i, a.items.length)), 0, it);
  }, 'mover');

  // subir/bajar: dentro de la sección y, en el borde, a la sección vecina del mismo paso
  const correr = (qid, d) => mutar((c) => {
    const de = buscar(c, qid);
    if (!de) return;
    const { p, s, i } = de;
    const j = i + d;
    if (j >= 0 && j < s.items.length) { [s.items[i], s.items[j]] = [s.items[j], s.items[i]]; return; }
    const k = p.secciones.indexOf(s) + d;
    if (k < 0 || k >= p.secciones.length) return;
    const [it] = s.items.splice(i, 1);
    if (d < 0) p.secciones[k].items.push(it); else p.secciones[k].items.unshift(it);
  }, `correr.${qid}`);

  const duplicar = (qid) => {
    const de = buscar(cont, qid);
    if (!de) return;
    const copia = conIdsNuevos(de.it);
    copia.titulo = de.it.titulo ? `${de.it.titulo} (copia)` : '';
    mutar((c) => { const x = buscar(c, qid); x.s.items.splice(x.i + 1, 0, copia); }, 'duplicar');
    setSelId(copia.id);
  };

  const eliminar = async (qid) => {
    const de = buscar(cont, qid);
    if (!de) return;
    const usos = usosDe(cont, qid);
    if (usos && !(await confirmar({
      tipo: 'danger', titulo: `¿Quitar «${nombreDe(de.it)}»?`,
      mensaje: `Se usa en ${usos} ${usos === 1 ? 'regla o cálculo' : 'reglas o cálculos'}; ahí también se quita. Puedes deshacerlo.`, textoConfirmar: 'Quitar',
    }))) return;
    mutar((c) => { const x = buscar(c, qid); x.s.items.splice(x.i, 1); if (usos) quitarUsos(c, qid); }, 'eliminar');
    if (selId === qid) { setSelId(null); setVerProps(false); }
    toast(`Se quitó «${nombreDe(de.it)}»`, { action: { label: 'Deshacer', onClick: () => deshacerRef.current?.() } });
  };

  const cambiarPregunta = (nuevo, clave) => {
    const previo = buscar(cont, nuevo.id)?.it;
    // si cambió de tipo, las reglas que la miran ya no sirven
    const usos = previo && previo.tipo !== nuevo.tipo ? usosDe(cont, nuevo.id) : 0;
    mutar((c) => { const x = buscar(c, nuevo.id); if (x) x.s.items[x.i] = nuevo; if (usos) quitarUsos(c, nuevo.id); }, `${nuevo.id}.${clave}`);
    if (usos) toast(`Se quitaron ${usos} ${usos === 1 ? 'regla que miraba' : 'reglas que miraban'} esta pregunta porque cambió de tipo`, { action: { label: 'Deshacer', onClick: () => deshacerRef.current?.() } });
  };

  const porId = useMemo(() => Object.fromEntries(preguntasDe(cont).map(({ it }) => [it.id, it])), [cont]);
  const cambiarDiseno = (d, clave) => mutar((c) => { c.diseno = d; }, clave);
  const cambiarNav = (n, clave) => mutar((c) => { c.navegacion = n; }, clave);
  const estiloPaso = (pid, estilo) => mutar((c) => { c.pasos.find((p) => p.id === pid).estilo = estilo; }, `paso.${pid}.estilo`);
  const cambiarSeguimientos = (s) => mutar((c) => { c.seguimientos = s; }, 'seguimientos');
  const bloqueCond = editCond ? (editCond.tipo === 'paso' ? cont.pasos.find((p) => p.id === editCond.id) : seccionDe(cont, editCond.id)) : null;
  const ponerCondBloque = (cond, clave) => mutar((c) => {
    const b = editCond.tipo === 'paso' ? c.pasos.find((p) => p.id === editCond.id) : seccionDe(c, editCond.id);
    if (b) b.condicion = cond;
  }, `${editCond.id}.${clave}`);

  const agregarPaso = () => {
    const p = { id: uid(), nombre: `Paso ${cont.pasos.length + 1}`, secciones: [{ id: uid(), nombre: 'General', items: [] }] };
    mutar((c) => { c.pasos.push(p); }, 'paso.agregar');
    setPasoId(p.id);
  };
  const renombrarPaso = (pid, nombre) => mutar((c) => { c.pasos.find((p) => p.id === pid).nombre = nombre; }, `paso.${pid}.nombre`);
  const correrPaso = (pid, d) => mutar((c) => {
    const i = c.pasos.findIndex((p) => p.id === pid); const j = i + d;
    if (j < 0 || j >= c.pasos.length) return;
    [c.pasos[i], c.pasos[j]] = [c.pasos[j], c.pasos[i]];
  }, 'paso.orden');
  const quitarPaso = async (p) => {
    if (cont.pasos.length <= 1) { toast.error('El formulario necesita al menos un paso'); return; }
    const n = p.secciones.reduce((a, s) => a + s.items.length, 0);
    if (n && !(await confirmar({ tipo: 'danger', titulo: `¿Quitar «${p.nombre}»?`, mensaje: `Se quitan también sus ${n} preguntas. Puedes deshacerlo.`, textoConfirmar: 'Quitar paso' }))) return;
    const i = cont.pasos.findIndex((x) => x.id === p.id);
    mutar((c) => { c.pasos = c.pasos.filter((x) => x.id !== p.id); }, 'paso.quitar');
    setPasoId(cont.pasos[i === 0 ? 1 : i - 1]?.id);
  };

  const agregarSeccion = () => mutar((c) => {
    const p = c.pasos.find((x) => x.id === paso.id);
    p.secciones.push({ id: uid(), nombre: `Sección ${p.secciones.length + 1}`, items: [] });
  }, 'seccion.agregar');
  const renombrarSeccion = (sid, nombre) => mutar((c) => { seccionDe(c, sid).nombre = nombre; }, `seccion.${sid}.nombre`);
  const correrSeccion = (sid, d) => mutar((c) => {
    const p = c.pasos.find((x) => x.secciones.some((s) => s.id === sid));
    const i = p.secciones.findIndex((s) => s.id === sid); const j = i + d;
    if (j < 0 || j >= p.secciones.length) return;
    [p.secciones[i], p.secciones[j]] = [p.secciones[j], p.secciones[i]];
  }, 'seccion.orden');
  const quitarSeccion = async (s) => {
    if (s.items.length && !(await confirmar({ tipo: 'danger', titulo: `¿Quitar la sección «${s.nombre || 'sin nombre'}»?`, mensaje: `Se quitan también sus ${s.items.length} preguntas. Puedes deshacerlo.`, textoConfirmar: 'Quitar sección' }))) return;
    mutar((c) => { const p = c.pasos.find((x) => x.secciones.some((y) => y.id === s.id)); p.secciones = p.secciones.filter((y) => y.id !== s.id); }, 'seccion.quitar');
  };

  // ---- arrastrar y soltar ----------------------------------------------------
  const [destino, setDestino] = useState(null); // { sec, i }
  useEffect(() => {
    const limpiar = () => setDestino(null);
    document.addEventListener('dragend', limpiar);
    return () => document.removeEventListener('dragend', limpiar);
  }, []);
  const alSoltar = (e, sec, i) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData(TIPO_DND);
    const qid = e.dataTransfer.getData(PREGUNTA_DND);
    setDestino(null);
    if (tipo && TIPOS[tipo]) agregar(tipo, sec, i);
    else if (qid) moverA(qid, sec, i);
  };
  const sobre = (e, sec, i) => {
    const tipos = Array.from(e.dataTransfer.types || []);
    if (!tipos.includes(TIPO_DND) && !tipos.includes(PREGUNTA_DND)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = tipos.includes(TIPO_DND) ? 'copy' : 'move';
    if (!destino || destino.sec !== sec || destino.i !== i) setDestino({ sec, i });
  };
  const sobrePregunta = (e, sec, i) => {
    const r = e.currentTarget.getBoundingClientRect();
    sobre(e, sec, e.clientY > r.top + r.height / 2 ? i + 1 : i);
  };

  const duplicarFormulario = async () => {
    if (!(await guardarYa())) { toast.error('Primero hay que guardar lo último'); return; }
    try {
      const { data } = await api.post(`/formularios-v2/${id}/duplicar`);
      toast.success('Formulario duplicado: estás editando la copia');
      navigate(`/formularios/v2/${data.id}/editar`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo duplicar'); }
  };

  const eliminarFormulario = async () => {
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar formulario?',
      mensaje: <>Se eliminará <b>{titulo || 'este formulario'}</b> con todas sus versiones, respuestas y asignaciones. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Formulario eliminado',
      accion: async () => {
        // nada pendiente que guardar: el formulario ya no existe
        clearTimeout(timer.current);
        firma.current = null;
        await api.delete(`/formularios-custom/${id}`);
      },
    });
    if (ok) navigate('/formularios');
  };

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto pt-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/formularios"><ChevronLeft className="h-4 w-4 mr-1" /> Volver a Formularios</Link></Button>
      </div>
    );
  }
  if (!cargado) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const [estadoNombre, estadoClase] = ESTADOS[cargado.estado] || ESTADOS.borrador;
  const textoGuardado = {
    ok: guardado.at ? `Guardado ${haceCuanto(guardado.at, ahora)}` : 'Guardado',
    pendiente: 'Cambios sin guardar…', guardando: 'Guardando…',
    error: guardado.detalle || 'Sin conexión: se reintenta solo', choque: 'Alguien más guardó cambios',
  }[guardado.estado];
  const tonoGuardado = { ok: 'text-[#16794a] dark:text-[#4ade80]', error: 'text-[#dc2626]', choque: 'text-[#dc2626]' }[guardado.estado] || 'text-muted-foreground';
  const versionTexto = cargado.version
    ? `${cargado.cambios_sin_publicar === false ? 'Sin cambios' : `Versión ${cargado.version + 1} en edición`} · publicada la versión ${cargado.version}`
    : 'Sin publicar todavía';
  // cada pestaña, según lo que la persona puede hacer en este formulario
  const puedeVer = { contenido: true, diseno: mis.editar, navegacion: mis.editar, asignaciones: mis.asignar, supervision: mis.asignar, permisos: mis.permisos, automatizaciones: mis.asignar, resultados: mis.resultados };
  const pestanas = PESTANAS.filter(([k, , etapa]) => etapa || puedeVer[k]);
  const ajustado = (cambios) => setCargado((c) => ({ ...c, ...cambios }));

  const paleta = (
    <Paleta onAgregar={(t) => agregar(t, verPaleta && verPaleta !== true ? verPaleta : null)} arrastrable={conPaleta && !verPaleta} />
  );
  const props = (
    <Propiedades it={sel?.it} formId={id} onCambio={cambiarPregunta} anteriores={sel ? anterioresA(cont, sel.it.id) : []} numericas={sel ? numericasAntes(cont, sel.it.id) : []} porId={porId}
      seguimientos={cont.seguimientos} onConfig={() => setVerConfig(true)} />
  );
  const chipCond = (cond) => cond && (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#e0f2fb] text-[#035f86] dark:bg-[rgba(0,165,223,0.18)] dark:text-[#7dd3fc] max-w-full">
      <Shuffle className="h-3 w-3 shrink-0" /><span className="truncate">Se muestra si {describirCondicion(cond, porId)}</span>
    </span>
  );

  return (
    <div className="-mx-4 sm:-mx-6 -mt-2">
      {/* encabezado */}
      <header className="bg-card border-b px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link to="/formularios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]">
          <ChevronLeft className="h-4 w-4" /> Formularios
        </Link>
        <div className="flex-1 min-w-[240px] flex flex-col gap-0.5">
          <label htmlFor="titulo-form" className="sr-only">Título del formulario</label>
          <input id="titulo-form" value={titulo} onChange={(e) => cambiarTitulo(e.target.value)} maxLength={160} placeholder="Título del formulario" readOnly={!mis.editar}
            className="font-heading text-xl font-semibold tracking-tight bg-transparent border border-transparent hover:border-border focus:border-border rounded-lg px-1.5 -ml-1.5 py-0.5 min-w-0 outline-none" />
          <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`px-2 py-px rounded-full font-medium ${estadoClase}`}>{estadoNombre}</span>
            <span>{versionTexto}</span>
            {mis.editar && (
              <span className={tonoGuardado} aria-live="polite">
                {guardado.estado === 'guardando' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}{textoGuardado}
              </span>
            )}
            {guardado.estado === 'choque' && (
              <button type="button" className="underline text-[#dc2626]" onClick={() => window.location.reload()}>Recargar</button>
            )}
          </p>
        </div>
        {mis.editar && (
          <div className="flex items-center gap-1">
            <BotonIcono id="btn-deshacer" label="Deshacer (Ctrl+Z)" onClick={deshacer} disabled={!historial.length}><Undo2 className="h-[18px] w-[18px]" /></BotonIcono>
            <BotonIcono label="Rehacer (Ctrl+Y)" onClick={rehacer} disabled={!futuro.length}><Redo2 className="h-[18px] w-[18px]" /></BotonIcono>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            {mis.editar && <Button variant="outline" className="h-10 rounded-[10px]" onClick={() => setVerConfig(true)}><Settings className="h-4 w-4 mr-1.5" /> Configuración</Button>}
            {mis.editar && <Button variant="outline" className="h-10 rounded-[10px]" onClick={duplicarFormulario}><Copy className="h-4 w-4 mr-1.5" /> Duplicar</Button>}
            {(mis.editar || mis.publicar) && <Button variant="outline" className="h-10 rounded-[10px]" onClick={() => setVerVersiones(true)}><History className="h-4 w-4 mr-1.5" /> Versiones</Button>}
            {mis.eliminar && <BotonIcono rojo label="Eliminar formulario" onClick={eliminarFormulario}><Trash2 className="h-[18px] w-[18px]" /></BotonIcono>}
          </div>
          {(mis.editar || mis.publicar || mis.eliminar) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="md:hidden h-10 w-10 p-0 rounded-[10px]" aria-label="Más opciones"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                {mis.editar && <DropdownMenuItem onSelect={() => setVerConfig(true)}><Settings className="h-4 w-4 mr-2" /> Configuración</DropdownMenuItem>}
                {mis.editar && <DropdownMenuItem onSelect={duplicarFormulario}><Copy className="h-4 w-4 mr-2" /> Duplicar</DropdownMenuItem>}
                {(mis.editar || mis.publicar) && <DropdownMenuItem onSelect={() => setVerVersiones(true)}><History className="h-4 w-4 mr-2" /> Versiones</DropdownMenuItem>}
                {mis.eliminar && (
                  <DropdownMenuItem onSelect={eliminarFormulario} className="text-[#dc2626] focus:text-[#dc2626] focus:bg-[rgba(220,38,38,0.08)]">
                    <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" className="h-10 rounded-[10px]" onClick={() => setVerPrevia(true)}><Eye className="h-4 w-4 mr-1.5" /> Vista previa</Button>
          {mis.publicar && <Button className="h-10 rounded-[10px] bg-[#1e395e] hover:bg-[#162c49] text-white font-semibold" onClick={() => setVerPublicar(true)}>Publicar</Button>}
        </div>
      </header>

      {/* pestañas del editor (las de otras etapas, marcadas) */}
      <nav aria-label="Secciones del editor" className="bg-card border-b px-4 sm:px-5 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pestanas.map(([k, nombre, etapa]) => (!etapa ? (
          <button key={k} type="button" aria-current={pestana === k ? 'page' : undefined} onClick={() => setPestana(k)}
            className={`inline-flex items-center gap-1.5 px-3 pt-3 pb-2.5 border-b-2 text-sm whitespace-nowrap ${pestana === k ? 'border-[#1e395e] dark:border-[#3cbef6] text-[#1e395e] dark:text-[#3cbef6] font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {nombre}{k === 'asignaciones' && asigEdit && <span className="h-2 w-2 rounded-full bg-[#ec9032]" title="Cambios sin aplicar" />}
          </button>
        ) : (
          <button key={k} type="button" onClick={() => toast(`«${nombre}» llega en la ${etapa.toLowerCase()}`)} aria-disabled="true"
            className="inline-flex items-center gap-1.5 px-3 pt-3 pb-2.5 border-b-2 border-transparent text-muted-foreground text-sm whitespace-nowrap">
            {nombre}<span className="text-[11px] px-1.5 py-px rounded-full bg-muted">{etapa}</span>
          </button>
        )))}
      </nav>

      {pestana === 'diseno' && (
        <div className="px-4 sm:px-5 py-4">
          <PanelDiseno formId={id} titulo={titulo} descripcion={descripcion} contenido={cont} onCambio={cambiarDiseno} />
        </div>
      )}
      {pestana === 'navegacion' && (
        <div className="px-4 sm:px-5 py-4">
          <PanelNavegacion formId={id} titulo={titulo} contenido={cont} onCambioNav={cambiarNav} onEstiloPaso={estiloPaso} />
        </div>
      )}
      {pestana === 'asignaciones' && (
        <div className="px-4 sm:px-5 py-4">
          <PanelAsignaciones formId={id} publicado={cargado.estado === 'publicado'} inicial={cargado.asignacion} valor={asigEdit} misPermisos={mis}
            onEditar={setAsigEdit} onGuardado={(c) => { ajustado(c); setAsigEdit(null); }} />
        </div>
      )}
      {pestana === 'supervision' && (
        <div className="px-4 sm:px-5 py-4"><PanelSupervision formId={id} titulo={titulo} contenido={cont} inicial={cargado.supervision} onGuardado={ajustado} /></div>
      )}
      {pestana === 'permisos' && (
        <div className="px-4 sm:px-5 py-4"><PanelPermisos formId={id} inicial={cargado.permisos} onGuardado={ajustado} /></div>
      )}
      {pestana === 'automatizaciones' && (
        <div className="px-4 sm:px-5 py-4"><PanelAutomatizaciones formId={id} contenido={cont} inicial={cargado.reglas} onGuardado={ajustado} /></div>
      )}
      {pestana === 'resultados' && (
        <div className="px-4 sm:px-5 py-4"><ResultadosFormulario formId={id} titulo={titulo} puedeExportar={mis.exportar} /></div>
      )}
      {pestana === 'contenido' && !mis.editar && (
        <div className="px-4 sm:px-5 py-4 max-w-[860px] mx-auto">
          <p className="text-sm text-muted-foreground mb-3">No puedes editar el contenido de este formulario; así queda para quien lo llena.</p>
          <FormRenderer form={{ id, titulo, descripcion, contenido: cont, version: 'previa' }} modo="vista" />
        </div>
      )}

      {pestana === 'contenido' && mis.editar && (
      <div className="px-4 sm:px-5 py-4 grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_290px] min-[1400px]:grid-cols-[220px_minmax(0,1fr)_300px] 2xl:grid-cols-[250px_minmax(0,1fr)_330px]">
        {conPaleta && (
          <aside aria-label="Componentes" className="rounded-2xl border bg-card p-3.5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">{paleta}</aside>
        )}

        {/* lienzo */}
        <section aria-label="Lienzo del formulario" className="min-w-0 flex flex-col gap-3">
          <div role="tablist" aria-label="Pasos" className="flex flex-wrap gap-2 items-center">
            {cont.pasos.map((p, i) => {
              const cuantas = p.secciones.reduce((a, s) => a + s.items.filter((it) => !SIN_RESPUESTA.has(it.tipo)).length, 0);
              const activo = p.id === paso?.id;
              return (
                <button key={p.id} type="button" role="tab" aria-selected={activo} onClick={() => setPasoId(p.id)}
                  onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes(PREGUNTA_DND) && !activo) { e.preventDefault(); setPasoId(p.id); } }}
                  className={`min-h-[40px] px-3.5 rounded-full text-sm ${activo ? 'bg-[#1e395e] text-white font-semibold border-2 border-[#1e395e] dark:bg-[#3cbef6] dark:border-[#3cbef6] dark:text-[#0b1424]' : 'border bg-card text-[#1e395e] dark:text-[#3cbef6] font-medium hover:bg-muted'}`}>
                  {i + 1}. {p.nombre || 'Sin nombre'} · {cuantas}
                </button>
              );
            })}
            <button type="button" onClick={agregarPaso} className="min-h-[40px] px-3 rounded-full border border-dashed text-sm text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted">+ Paso</button>
          </div>

          {paso && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <label className="text-xs text-muted-foreground" htmlFor="nombre-paso">Nombre del paso</label>
              <Input id="nombre-paso" value={paso.nombre} onChange={(e) => renombrarPaso(paso.id, e.target.value)} className="h-9 w-full sm:w-64 text-sm bg-background" />
              <div className="flex items-center gap-0.5 ml-auto">
                <BotonIcono chico label="Condición del paso" onClick={() => setEditCond({ tipo: 'paso', id: paso.id })}><Shuffle className="h-4 w-4" /></BotonIcono>
                <BotonIcono chico label="Mover el paso a la izquierda" onClick={() => correrPaso(paso.id, -1)} disabled={cont.pasos[0]?.id === paso.id}><ChevronLeft className="h-4 w-4" /></BotonIcono>
                <BotonIcono chico label="Mover el paso a la derecha" onClick={() => correrPaso(paso.id, 1)} disabled={cont.pasos[cont.pasos.length - 1]?.id === paso.id}><ChevronRight className="h-4 w-4" /></BotonIcono>
                <BotonIcono chico rojo label="Quitar este paso" onClick={() => quitarPaso(paso)}><Trash2 className="h-4 w-4" /></BotonIcono>
              </div>
              {paso.condicion && <div className="basis-full">{chipCond(paso.condicion)}</div>}
            </div>
          )}

          {paso?.secciones.map((s, si) => (
            <div key={s.id} className="rounded-2xl border bg-card p-3.5 flex flex-col gap-2.5"
              onDragOver={(e) => { if (e.target === e.currentTarget) sobre(e, s.id, s.items.length); }}
              onDrop={(e) => alSoltar(e, s.id, destino?.sec === s.id ? destino.i : s.items.length)}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDestino(null); }}>
              <div className="flex items-center gap-2">
                <input value={s.nombre} onChange={(e) => renombrarSeccion(s.id, e.target.value)} aria-label="Nombre de la sección" placeholder="Sección sin nombre"
                  className="flex-1 min-w-0 font-heading font-semibold text-[15px] bg-transparent border border-transparent hover:border-border focus:border-border rounded-lg px-1.5 py-1 outline-none" />
                <span className="text-xs text-muted-foreground shrink-0">{s.items.length} {s.items.length === 1 ? 'elemento' : 'elementos'}</span>
                <BotonIcono chico label="Condición de la sección" onClick={() => setEditCond({ tipo: 'seccion', id: s.id })}><Shuffle className="h-4 w-4" /></BotonIcono>
                <BotonIcono chico label="Subir sección" onClick={() => correrSeccion(s.id, -1)} disabled={si === 0}><ChevronUp className="h-4 w-4" /></BotonIcono>
                <BotonIcono chico label="Bajar sección" onClick={() => correrSeccion(s.id, 1)} disabled={si === paso.secciones.length - 1}><ChevronDown className="h-4 w-4" /></BotonIcono>
                <BotonIcono chico rojo label="Quitar sección" onClick={() => quitarSeccion(s)}><Trash2 className="h-4 w-4" /></BotonIcono>
              </div>
              {s.condicion && <div>{chipCond(s.condicion)}</div>}

              {s.items.map((it, i) => (
                <React.Fragment key={it.id}>
                  {destino?.sec === s.id && destino.i === i && <Marca />}
                  <TarjetaPregunta it={it} n={numeros[it.id]} seleccionada={it.id === selId} arrastrable={conPanel} chipCond={chipCond(it.condicion)}
                    onElegir={() => { setSelId(it.id); if (!conPanel) setVerProps(true); }}
                    onSubir={() => correr(it.id, -1)} onBajar={() => correr(it.id, 1)} onDuplicar={() => duplicar(it.id)} onEliminar={() => eliminar(it.id)}
                    onDragOver={(e) => sobrePregunta(e, s.id, i)} />
                </React.Fragment>
              ))}
              {destino?.sec === s.id && destino.i === s.items.length && <Marca />}
              {!s.items.length && destino?.sec !== s.id && (
                <p onDragOver={(e) => sobre(e, s.id, 0)} className="text-sm text-muted-foreground text-center py-3">
                  {conPaleta ? 'Arrastra aquí un componente o usa el botón de abajo.' : 'Sin preguntas todavía.'}
                </p>
              )}

              <button type="button" onClick={() => (conPaleta ? agregar('corto', s.id) : setVerPaleta(s.id))}
                onDragOver={(e) => sobre(e, s.id, s.items.length)}
                className="min-h-[40px] rounded-[10px] border border-dashed text-sm text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted">
                + Pregunta en «{s.nombre || 'esta sección'}»
              </button>
            </div>
          ))}
          {paso && (
            <button type="button" onClick={agregarSeccion} className="min-h-[44px] rounded-2xl border border-dashed bg-card text-sm font-medium text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted">+ Sección en este paso</button>
          )}
        </section>

        {conPanel && (
          <aside aria-label="Propiedades" className="rounded-2xl border bg-card p-3.5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">{props}</aside>
        )}
      </div>
      )}

      <Dialog open={!!bloqueCond} onOpenChange={(v) => !v && setEditCond(null)}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Condición {editCond?.tipo === 'paso' ? 'del paso' : 'de la sección'} «{bloqueCond?.nombre || 'sin nombre'}»</DialogTitle>
            <DialogDescription>Si no se cumple, {editCond?.tipo === 'paso' ? 'el paso completo se salta' : 'la sección no aparece'} y sus preguntas no se exigen.</DialogDescription>
          </DialogHeader>
          {bloqueCond && (
            <EditorCondicion condicion={bloqueCond.condicion || null} onCambio={ponerCondBloque} porId={porId} formId={id}
              anteriores={anterioresA(cont, bloqueCond.id)} verbo={editCond.tipo === 'paso' ? 'Mostrar este paso' : 'Mostrar esta sección'} />
          )}
          <div className="flex justify-end"><Button className="rounded-xl" onClick={() => setEditCond(null)}>Listo</Button></div>
        </DialogContent>
      </Dialog>

      {/* pantallas angostas: componentes y propiedades en hojas */}
      {!conPaleta && (
        <Sheet open={!!verPaleta} onOpenChange={(v) => !v && setVerPaleta(null)}>
          <SheetContent side={conPanel ? 'left' : 'bottom'} className={conPanel ? 'w-[300px] overflow-y-auto' : 'max-h-[85dvh] overflow-y-auto rounded-t-2xl'}>
            <SheetHeader className="text-left"><SheetTitle>Agregar</SheetTitle><SheetDescription>Toca un componente para agregarlo.</SheetDescription></SheetHeader>
            <div className="mt-3">{paleta}</div>
          </SheetContent>
        </Sheet>
      )}
      {!conPanel && (
        <>
          <Sheet open={verProps && !!sel} onOpenChange={setVerProps}>
            <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
              <SheetHeader className="sr-only"><SheetTitle>Propiedades</SheetTitle><SheetDescription>Edita la pregunta elegida.</SheetDescription></SheetHeader>
              <div className="pt-2">{props}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      <Configuracion open={verConfig} onOpenChange={setVerConfig} descripcion={descripcion} setDescripcion={setDescripcion}
        seguimientos={cont.seguimientos} setSeguimientos={cambiarSeguimientos} />
      <VistaPrevia open={verPrevia} onOpenChange={setVerPrevia} form={{ id, titulo, descripcion, contenido: cont, version: 'previa' }} />
      <PublicarDialog open={verPublicar} onOpenChange={setVerPublicar} formId={id} antesDe={guardarYa}
        onPublicado={(d) => setCargado((c) => ({ ...c, estado: 'publicado', version: d.version, cambios_sin_publicar: false }))} />
      <VersionesDialog open={verVersiones} onOpenChange={setVerVersiones} formId={id} puedeRestaurar={mis.editar} puedeDespublicar={mis.publicar}
        onRestaurado={(d) => { registrar('restaurar'); aplicarDoc(d); }}
        onDespublicado={() => setCargado((c) => ({ ...c, estado: 'despublicado' }))} />
    </div>
  );
}

function BotonIcono({ label, children, chico = false, rojo = false, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`${chico ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-[10px] border bg-card'} grid place-items-center ${rojo ? 'text-[#dc2626]' : 'text-[#1e395e] dark:text-[#3cbef6]'} hover:bg-muted disabled:opacity-35 disabled:hover:bg-transparent`}>
      {children}
    </button>
  );
}

const Marca = () => <div className="h-1 rounded-full bg-[#00a5df]" aria-hidden="true" />;

function Paleta({ onAgregar, arrastrable }) {
  const [q, setQ] = useState('');
  const grupos = buscarTipos(q);
  return (
    <div className="flex flex-col gap-3">
      {arrastrable && (
        <div>
          <h2 className="font-heading text-[15px] font-semibold">Componentes</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Arrástralos al lienzo o tócalos para agregarlos.</p>
        </div>
      )}
      <label className="flex items-center gap-2 h-10 px-2.5 border rounded-[10px] text-muted-foreground">
        <Search className="h-4 w-4 shrink-0" />
        <input aria-label="Buscar componente" placeholder="Buscar: foto, firma, fecha…" value={q} onChange={(e) => setQ(e.target.value)}
          className="border-0 outline-none flex-1 min-w-0 bg-transparent text-sm text-foreground" />
      </label>
      {grupos.map(([cat, tipos]) => (
        <div key={cat} className="flex flex-col gap-1">
          <p className="mt-1 mb-0.5 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">{cat}</p>
          <div className={arrastrable ? 'flex flex-col gap-1' : 'grid grid-cols-2 gap-1.5'}>
            {tipos.map((t) => (
              <button key={t} type="button" onClick={() => onAgregar(t)} draggable={arrastrable}
                onDragStart={(e) => { e.dataTransfer.setData(TIPO_DND, t); e.dataTransfer.effectAllowed = 'copy'; }}
                className={`flex items-center gap-2.5 min-h-[40px] px-2 py-1 border rounded-[10px] bg-card text-left text-[13px] hover:bg-muted ${arrastrable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                {arrastrable && <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
                <Icono tipo={t} />
                <span className="flex-1 min-w-0">{TIPOS[t][0]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!grupos.length && <p className="text-sm text-muted-foreground">Ningún componente se llama así.</p>}
    </div>
  );
}

function Muestra({ it }) {
  if (CON_OPCIONES.has(it.tipo) && it.tipo !== 'lista') {
    return (
      <div className="flex flex-wrap gap-1.5 pl-10">
        {it.opciones.map((o) => <span key={o.id} className="px-2.5 py-1 rounded-full border text-xs text-muted-foreground">{o.label}</span>)}
      </div>
    );
  }
  const linea = { corto: 'Respuesta corta', largo: 'Respuesta larga', numero: '0', correo: 'nombre@correo.com', telefono: '9999-9999', lista: 'Elige una opción ▾',
    fecha: 'dd/mm/aaaa', hora: '--:--', fechahora: 'dd/mm/aaaa --:--', colaborador: 'Busca un colaborador…', sucursal: 'Elige la sucursal ▾', caja: 'Busca el área…',
    moneda: `${it.config?.simbolo || 'L'} 0.00`, porcentaje: '0 %', direccion: 'Dirección y ciudad', articulo: 'Busca un artículo…', calculado: '= Se calcula solo' }[it.tipo];
  if (linea) return <div className="ml-10 h-[34px] border rounded-lg bg-muted/40 px-2.5 flex items-center text-xs text-muted-foreground">{linea}</div>;
  const caja = { foto: 'Tomar o elegir foto', camara: 'Tomar foto con la cámara', archivo: 'Adjuntar archivo', firma: 'Espacio para firmar', ubicacion: 'Guardar mi ubicación', imagen: it.config?.imagen_id ? 'Imagen cargada' : 'Sube la imagen en Propiedades' }[it.tipo];
  if (caja) return <div className="ml-10 h-14 border border-dashed rounded-[10px] grid place-items-center text-xs text-muted-foreground">{caja}</div>;
  if (it.tipo === 'matriz') {
    return (
      <div className="ml-10 flex flex-col gap-1">
        {(it.config?.filas || []).slice(0, 4).map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="min-w-[72px] flex-1 truncate">{f.label}</span>
            {(it.config?.columnas || []).map((c) => <span key={c.id} className="px-2 py-0.5 rounded-full border">{c.label}</span>)}
          </div>
        ))}
      </div>
    );
  }
  if (it.tipo === 'tabla' || it.tipo === 'repetible') {
    return (
      <div className="ml-10 flex flex-wrap gap-1.5">
        {(it.config?.columnas || []).map((c) => <span key={c.id} className="px-2.5 py-1 rounded-lg border bg-muted/40 text-xs text-muted-foreground">{c.nombre || 'Sin nombre'}</span>)}
      </div>
    );
  }
  if (it.tipo === 'escala' || it.tipo === 'estrellas') {
    return (
      <div className="flex flex-wrap gap-1 pl-10">
        {Array.from({ length: it.config?.max || 5 }, (_, i) => <span key={i} className="h-7 w-7 rounded-md border grid place-items-center text-[11px] text-muted-foreground">{it.tipo === 'estrellas' ? '★' : i + 1}</span>)}
      </div>
    );
  }
  if (it.tipo === 'instrucciones') return <p className="ml-10 text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{it.config?.texto || 'Escribe las instrucciones en Propiedades'}</p>;
  if (it.tipo === 'separador') return <hr className="ml-10 border-dashed" />;
  return null;
}

function TarjetaPregunta({ it, n, seleccionada, arrastrable, chipCond, onElegir, onSubir, onBajar, onDuplicar, onEliminar, onDragOver }) {
  const estructura = SIN_RESPUESTA.has(it.tipo);
  return (
    <div id={`q-${it.id}`} draggable={arrastrable}
      onDragStart={(e) => { e.dataTransfer.setData(PREGUNTA_DND, it.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={onDragOver}
      className={`rounded-xl px-3 py-2.5 flex flex-col gap-2 border transition-colors ${seleccionada ? 'border-2 border-[#00a5df] bg-[rgba(0,165,223,0.05)]' : 'hover:border-muted-foreground/40'}`}>
      <div className="flex items-start gap-2.5">
        <button type="button" onClick={onElegir} aria-pressed={seleccionada}
          className="flex-1 min-w-0 flex items-start gap-2.5 text-left">
          <Icono tipo={it.tipo} />
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className={`text-sm font-semibold break-words ${!it.titulo && !estructura ? 'text-muted-foreground italic font-normal' : ''}`}>
              {!estructura && `${n}. `}{it.titulo || (estructura ? TIPOS[it.tipo][0] : 'Escribe la pregunta')}
              {it.obligatoria && <span className="text-[#dc2626]"> *</span>}
            </span>
            <span className="text-xs text-muted-foreground">{resumenDe(it)}</span>
          </span>
        </button>
        <div className="flex shrink-0">
          {arrastrable && <span className="h-8 w-6 grid place-items-center text-muted-foreground/60 cursor-grab" title="Arrastra para mover" aria-hidden="true"><GripVertical className="h-4 w-4" /></span>}
          <BotonIcono chico label="Subir pregunta" onClick={onSubir}><ChevronUp className="h-4 w-4" /></BotonIcono>
          <BotonIcono chico label="Bajar pregunta" onClick={onBajar}><ChevronDown className="h-4 w-4" /></BotonIcono>
          <BotonIcono chico label="Duplicar pregunta" onClick={onDuplicar}><Copy className="h-4 w-4" /></BotonIcono>
          <BotonIcono chico rojo label="Eliminar pregunta" onClick={onEliminar}><Trash2 className="h-4 w-4" /></BotonIcono>
        </div>
      </div>
      <Muestra it={it} />
      {(chipCond || it.seguimiento) && (
        <div className="flex flex-wrap gap-1.5 pl-10">
          {chipCond}
          {it.seguimiento && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#fff3e6] text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b]">
              <Ticket className="h-3 w-3 shrink-0" />{describirSeguimiento(it)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const PLAZOS = [[24, '24 h'], [48, '48 h'], [72, '72 h'], [168, '1 semana']];

// Quién revisa y cierra los seguimientos de este formulario y en cuánto se corrigen.
function AjustesSeguimientos({ seguimientos, setSeguimientos }) {
  const s = seguimientos;
  const [gente, setGente] = useState(null);
  useEffect(() => {
    if (s.revisa !== 'persona' || gente) return;
    api.get('/users', { params: { status: 'approved' } })
      .then(({ data }) => setGente(data.map((u) => ({ id: u.id, nombre: u.name, detalle: u.position })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))
      .catch(() => setGente([]));
  }, [s.revisa, gente]);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-semibold flex items-center gap-1.5"><Ticket className="h-4 w-4" /> Seguimientos</p>
      <p className="text-xs text-muted-foreground">Las preguntas que abren seguimiento (Propiedades › Condiciones) lo mandan a quien llenó para corregir. Lo revisa y lo cierra:</p>
      <div role="radiogroup" aria-label="Quién revisa los seguimientos" className="flex flex-col gap-1">
        {[['creador', 'Quien creó el formulario'], ['jefe', 'El jefe de quien llenó', 'según el organigrama'], ['persona', 'Una persona']].map(([k, n, nota]) => (
          <button key={k} type="button" role="radio" aria-checked={s.revisa === k} onClick={() => setSeguimientos({ ...s, revisa: k, persona_id: k === 'persona' ? s.persona_id : null })}
            className={`min-h-[38px] px-3 rounded-lg border text-left text-sm ${s.revisa === k ? 'border-2 border-[#1e395e] bg-[#e8eef7] text-[#1e395e] font-semibold dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6]' : 'hover:bg-muted'}`}>
            {n}{nota && <span className="font-normal text-xs text-muted-foreground"> · {nota}</span>}
          </button>
        ))}
      </div>
      {s.revisa === 'persona' && (
        <ElegirConBuscador valor={s.persona_id} onValor={(v) => setSeguimientos({ ...s, persona_id: v })} opciones={gente || []} cargando={!gente} placeholder="Busca a la persona…" />
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
        <span className="text-xs font-medium text-muted-foreground">Plazo para corregir</span>
        <div role="radiogroup" aria-label="Plazo para corregir" className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
          {PLAZOS.map(([k, n]) => (
            <button key={k} type="button" role="radio" aria-checked={s.plazo_horas === k} onClick={() => setSeguimientos({ ...s, plazo_horas: k })}
              className={`h-8 px-2.5 rounded-lg text-xs ${s.plazo_horas === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Se aplica al publicar. Si quien revisa es la misma persona que llenó, lo revisa su jefe.</p>
    </div>
  );
}

function Configuracion({ open, onOpenChange, descripcion, setDescripcion, seguimientos, setSeguimientos }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Configuración</DialogTitle>
          <DialogDescription>Se guarda sola, como el resto del formulario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Descripción (la ve quien llena)
            <Textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={1000} className="text-sm text-foreground" />
          </label>
          {seguimientos && <AjustesSeguimientos seguimientos={seguimientos} setSeguimientos={setSeguimientos} />}
          <div className="flex justify-end"><Button className="rounded-xl" onClick={() => onOpenChange(false)}>Listo</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DISPOSITIVOS = [['pc', 'PC', Monitor, 'max-w-[880px]'], ['tableta', 'Tableta', Tablet, 'max-w-[768px]'], ['telefono', 'Teléfono', Smartphone, 'max-w-[390px]']];

function VistaPrevia({ open, onOpenChange, form }) {
  const [disp, setDisp] = useState('pc');
  const [clave, setClave] = useState(0);
  const ancho = DISPOSITIVOS.find((d) => d[0] === disp)[3];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1100px)] w-full h-[92dvh] p-0 rounded-2xl overflow-hidden flex flex-col gap-0 [&>button]:hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 bg-card">
          <DialogHeader className="flex-1 min-w-[160px] space-y-0 text-left">
            <DialogTitle className="font-heading text-base">Vista previa</DialogTitle>
            <DialogDescription className="text-xs">Así lo verá quien lo llene. No se guarda nada.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Dispositivo" className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
            {DISPOSITIVOS.map(([k, n, Ic]) => (
              <button key={k} type="button" role="radio" aria-checked={disp === k} onClick={() => setDisp(k)}
                className={`h-8 px-2.5 rounded-lg text-xs inline-flex items-center gap-1.5 ${disp === k ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground'}`}>
                <Ic className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{n}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setClave((c) => c + 1)}>Empezar de nuevo</Button>
          <button type="button" aria-label="Cerrar vista previa" onClick={() => onOpenChange(false)} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto bg-muted/40 py-5 px-3">
          <div className={`mx-auto ${ancho} ${disp === 'telefono' ? 'rounded-[28px] border-[6px] border-foreground/80 bg-background p-3 min-h-[640px]' : ''}`}>
            <h1 className="font-heading text-xl font-semibold">{form.titulo || 'Formulario sin título'}</h1>
            {form.descripcion && <p className="text-sm text-muted-foreground mt-0.5 mb-3 whitespace-pre-line">{form.descripcion}</p>}
            <div className="mt-3">
              {open && <FormRenderer key={`${clave}-${disp}`} form={form} modo="vista" compacto={disp === 'telefono'} />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
