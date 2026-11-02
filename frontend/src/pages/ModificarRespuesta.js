import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { cuando } from '@/lib/formularios';
import FormRenderer from '@/components/formularios/FormRenderer';

/* Corregir una respuesta ya entregada (permiso Modificar del formulario), en la
   versión con que se contestó. Queda registrado quién y cuándo. */

export default function ModificarRespuesta() {
  const { id, rid } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.get(`/formularios-v2/${id}/respuestas/${rid}/para-modificar`).then(({ data }) => setD(data)).catch((e) => setError(e?.response?.data?.detail || 'No se pudo abrir la respuesta'));
  }, [id, rid]);
  const servidor = useMemo(() => (!d ? null : {
    inicial: d.inicial,
    urlArchivo: (m) => ((m.content_type || '').startsWith('image/') ? `/formularios-custom/${id}/respuestas/${rid}/foto/${m.id}` : `/formularios-v2/${id}/respuestas/${rid}/archivo/${m.id}`),
    enviar: async ({ respuestas, notas, conservar, nuevos }) => {
      const fd = new FormData();
      nuevos.forEach((n) => { fd.append('archivos', n.blob, n.nombre); fd.append('dueno', n.dueno); });
      fd.append('data', JSON.stringify({ respuestas, notas, conservar }));
      return (await api.post(`/formularios-v2/${id}/respuestas/${rid}/modificar`, fd)).data;
    },
  }), [d, id, rid]);
  const volver = `/formularios/custom/${id}?tab=historial`;
  if (error) return <p className="text-sm text-muted-foreground text-center py-16">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;
  return (
    <div className="max-w-[860px] mx-auto pt-2">
      <Link to={volver} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"><ArrowLeft className="h-4 w-4" /> Historial</Link>
      <div className="mb-4">
        <h1 className="font-heading text-2xl font-semibold">{d.form.titulo}</h1>
        <p className="text-sm text-muted-foreground mt-1">Modificando la respuesta de <b className="text-foreground">{d.respuesta.respondent_name}</b> del {cuando(d.respuesta.created_at)}. Se conserva quién la dio y queda registrado que la cambiaste.</p>
      </div>
      <FormRenderer form={d.form} servidor={servidor} pantallaInicial="preguntas" onEnviado={() => { toast.success('Respuesta modificada'); navigate(volver); }} />
    </div>
  );
}
