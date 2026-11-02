import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, RotateCcw, Users } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ENTREGAS, cuando, cuandoVence, diaCorto } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import FormRenderer from '@/components/formularios/FormRenderer';
import RevisarFormulario from '@/pages/RevisarFormulario';

/* Llenar un formulario. Lo empezado vive en el servidor (su asignación), así que
   se sigue desde cualquier equipo. En los formularios disponibles la asignación
   se crea con el primer cambio, no por solo abrirlo. */

export function Llenado({ form, asignacion, otraVez = false, onEnviado }) {
  const aid = useRef(asignacion?.id || null);
  const base = useRef(asignacion?.avance?.guardado_at || null);
  const creando = useRef(null);
  const servidor = useMemo(() => {
    const asegurar = async () => {
      if (aid.current) return aid.current;
      creando.current = creando.current || api.post(`/formularios-v2/${form.id}/empezar`).then(({ data }) => {
        aid.current = data.id; base.current = data.avance?.guardado_at || null; return data.id;
      }).finally(() => { creando.current = null; });
      return creando.current;
    };
    const ruta = (id) => `/formularios-v2/asignaciones/${id}`;
    return {
      inicial: asignacion?.avance || null,
      otraVez,
      urlArchivo: (m) => `${ruta(aid.current)}/archivos/${m.id}`,
      guardar: async (datos) => {
        const { data } = await api.put(`${ruta(await asegurar())}/avance`, { ...datos, base: base.current });
        base.current = data.guardado_at;
        return data;
      },
      subir: async (dueno, blob, nombre) => {
        const fd = new FormData();
        fd.append('dueno', dueno);
        fd.append('archivo', blob, nombre || 'archivo');
        return (await api.post(`${ruta(await asegurar())}/archivos`, fd)).data;
      },
      quitar: (dueno, m) => api.delete(`${ruta(aid.current)}/archivos/${m.id}`, { params: { dueno } }),
      enviar: async ({ respuestas, notas, nuevos }) => {
        const fd = new FormData();
        nuevos.forEach((n) => { fd.append('archivos', n.blob, n.nombre); fd.append('dueno', n.dueno); });
        fd.append('data', JSON.stringify({ respuestas, notas, asignacion_id: aid.current }));
        return (await api.post(`/formularios-v2/${form.id}/respuestas`, fd)).data;
      },
      reiniciar: () => { aid.current = null; base.current = null; },
      recargar: () => window.location.reload(),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <FormRenderer form={form} servidor={servidor} onEnviado={onEnviado} />;
}

function Aviso({ children }) {
  return <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

// Desde el formulario (Disponibles o la pestaña Responder): retoma lo que esté en curso o empieza uno nuevo.
export function LlenarPorFormulario({ formId, onEnviado }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/formularios-v2/${formId}/llenar`).then(({ data }) => setD(data)).catch((e) => setError(e?.response?.data?.detail || 'No se pudo cargar el formulario'));
  }, [formId]);
  if (error) return <Aviso>{error}</Aviso>;
  if (!d) return <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>;
  if (!d.disponible) return <Aviso>{d.estado === 'publicado' ? 'Ya entregaste este formulario. Lo ves en Historial.' : 'Este formulario no está publicado.'}</Aviso>;
  return <Llenado key={d.asignacion?.id || 'nuevo'} form={d} asignacion={d.asignacion} otraVez={d.otra_vez} onEnviado={onEnviado} />;
}

export function PaginaLlenar() {
  const { id } = useParams();
  return (
    <div className="max-w-[860px] mx-auto pt-2">
      <Link to="/mis-formularios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"><ArrowLeft className="h-4 w-4" /> Mis formularios</Link>
      <LlenarPorFormulario formId={id} />
    </div>
  );
}

export default function LlenarFormulario() {
  const { aid } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const cargar = useCallback(() => {
    setD(null); setError(null);
    api.get(`/formularios-v2/asignaciones/${aid}`).then(({ data }) => setD(data)).catch((e) => setError(e?.response?.data?.detail || 'No se pudo abrir'));
  }, [aid]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto pt-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/mis-formularios"><ArrowLeft className="h-4 w-4 mr-1.5" /> Mis formularios</Link></Button>
      </div>
    );
  }
  if (!d) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const a = d.asignacion;
  if (!d.puede_llenar && a.respuesta_id) return <RevisarFormulario aid={aid} onCambio={cargar} />;

  const [estado, chip] = ENTREGAS[a.estado] || ENTREGAS.pendiente;
  const devolucion = a.estado === 'devuelto' ? [...(a.historial || [])].reverse().find((h) => h.accion === 'devuelto') : null;
  const vence = cuandoVence(a.vence);
  const otro = a.tipo === 'sucursal' && a.tomada_por && a.tomada_por.id !== user?.id ? a.tomada_por : null;
  return (
    <div className="max-w-[860px] mx-auto pt-2">
      <Link to={`/formularios/custom/${a.form_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"><ArrowLeft className="h-4 w-4" /> Volver</Link>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold">{d.form.titulo}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${chip}`}>{estado}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {a.abre && <span>Del {diaCorto(a.abre)}</span>}
          {a.sucursal && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Tienda {a.sucursal}</span>}
          {a.vence && <span className={`inline-flex items-center gap-1 ${vence.pronto ? 'text-[#b42318] dark:text-[#f87171] font-medium' : ''}`}><Clock className="h-3.5 w-3.5" /> {a.estado === 'vencido' ? 'Venció' : 'Vence'} {vence.texto}</span>}
        </p>
        {d.form.descripcion && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{d.form.descripcion}</p>}
      </div>
      {devolucion && (
        <div className="mb-4 rounded-xl border border-[#f3d3a8] bg-[#fff8ef] dark:bg-[rgba(236,144,50,0.12)] dark:border-[rgba(236,144,50,0.4)] p-3 text-sm">
          <p className="text-xs text-[#6b3d0b] dark:text-[#f5b56b] flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> {devolucion.por?.name} lo devolvió {cuando(devolucion.at)}:</p>
          <p className="mt-0.5">«{devolucion.comentario}»</p>
        </div>
      )}
      {otro && <p className="mb-4 rounded-xl bg-muted/60 p-3 text-sm">{otro.name} ya lo empezó: si sigues tú, continúas sobre lo que lleva.</p>}
      {d.puede_llenar ? (
        <Llenado key={a.id} form={d.form} asignacion={a} onEnviado={() => {}} />
      ) : (
        <Aviso>
          {a.estado === 'vencido'
            ? 'Venció sin entregarse y ya no recibe entregas. Pide a quien lo administra que lo reabra.'
            : 'Este formulario no está publicado en este momento.'}
        </Aviso>
      )}
    </div>
  );
}
