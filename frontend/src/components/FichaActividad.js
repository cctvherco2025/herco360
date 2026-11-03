import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, Users, Lock, Pencil, CalendarDays, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { capitalize, fmtHora, fmtRangoHoras, fullDateEs, ymd } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { confirmar } from '@/components/ConfirmDialog';

// Clave de las notas de una actividad: en una serie, cada repetición tiene las suyas.
export const claveNotas = (a) => (a.rrule ? `${a.id}|${a.date}` : a.id);

const horaDe = (iso) => { const d = new Date(iso); return fmtHora(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`); };
const esHoy = (iso) => new Date(iso).toDateString() === new Date().toDateString();

// Ficha de una actividad con su bitácora de notas: quién escribió cada nota y
// cuándo. Las ven el creador y los participantes; "Solo para mí", solo quien
// la escribió. En PC sale a la derecha; en el teléfono, desde abajo.
export default function FichaActividad({ ev, foco, pc, onClose, onEditar, onCambio }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notas, setNotas] = useState(null);
  const [texto, setTexto] = useState('');
  const [privada, setPrivada] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const caja = useRef(null);
  const ocurrencia = ev?.rrule ? ev.date : '';

  useEffect(() => {
    if (!ev) return;
    setNotas(null); setTexto(''); setPrivada(false); setError('');
    api.get(`/activities/${ev.id}/notas${ocurrencia ? `?ocurrencia=${ocurrencia}` : ''}`)
      .then(({ data }) => setNotas(data))
      .catch((e) => { setNotas([]); if (e?.response?.status !== 403) toast.error('No se pudieron cargar las notas'); });
  }, [ev, ocurrencia]);
  useEffect(() => { if (ev && foco) setTimeout(() => caja.current?.focus(), 250); }, [ev, foco]);

  const agregar = async () => {
    if (!texto.trim()) { setError('Escribe la nota antes de agregarla.'); caja.current?.focus(); return; }
    setEnviando(true);
    try {
      const { data } = await api.post(`/activities/${ev.id}/notas`, { texto, privada, ocurrencia: ocurrencia || null });
      setNotas((n) => [...(n || []), data]); setTexto(''); setPrivada(false); onCambio?.();
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo agregar la nota'); }
    finally { setEnviando(false); }
  };
  const borrar = async (n) => {
    const ok = await confirmar({
      tipo: 'danger', titulo: '¿Borrar nota?', mensaje: 'Se borrará tu nota de esta actividad.',
      textoConfirmar: 'Borrar', textoCargando: 'Borrando…', textoExito: 'Nota borrada',
      accion: () => api.delete(`/activities/${ev.id}/notas/${n.id}`),
    });
    if (ok) { setNotas((l) => l.filter((x) => x.id !== n.id)); onCambio?.(); }
  };

  const parts = ev?.participants || [];
  return (
    <Sheet open={!!ev} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={pc ? 'right' : 'bottom'} data-testid="ficha-actividad"
        className={pc ? 'w-[420px] sm:max-w-[420px] overflow-y-auto p-5' : 'max-h-[88vh] overflow-y-auto rounded-t-[22px] px-4 pb-6 pt-3'}>
        {!pc && <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />}
        {ev && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 pr-8">
              <span className="mt-0.5 h-9 w-2.5 shrink-0 rounded-full" style={{ background: ev.color || '#00a5df' }} />
              <div className="min-w-0">
                <SheetTitle className="font-heading text-lg font-semibold leading-snug break-words">{ev.title}</SheetTitle>
                <p className="text-sm text-muted-foreground">{capitalize(fullDateEs(ev.date))}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" />{fmtRangoHoras(ev.start_time, ev.end_time)}</p>
              {ev.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{ev.location}</span></p>}
              {parts.length > 0 && (
                <p className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0" />
                  <span className="flex -space-x-1.5">{parts.slice(0, 5).map((p) => (
                    <Avatar key={p.user_id} className="h-6 w-6 border-2 border-card" title={p.name}><AvatarImage src={p.avatar_url} /><AvatarFallback className="text-[10px]">{p.name?.[0]}</AvatarFallback></Avatar>
                  ))}</span>
                  <span>{parts.length} {parts.length === 1 ? 'participante' : 'participantes'}</span>
                </p>
              )}
            </div>
            {ev.description && <p className="text-sm whitespace-pre-wrap break-words">{ev.description}</p>}

            <div className="border-t pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-heading font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#00a5df]" /> Notas</h3>
                {notas && <span className="text-xs text-muted-foreground">{notas.length ? `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}` : 'Sin notas'}</span>}
              </div>
              {notas === null ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
                <div className="space-y-3" data-testid="ficha-notas">
                  {notas.length === 0 && <p className="text-sm text-muted-foreground">Escribe lo que se habló, acuerdos o pendientes.</p>}
                  {notas.map((n) => (
                    <div key={n.id} className="flex gap-2.5" data-testid="ficha-nota">
                      <Avatar className="h-7 w-7 shrink-0 border"><AvatarImage src={n.autor_avatar} /><AvatarFallback className="text-[10px]">{n.autor_nombre?.[0]}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{n.autor_id === user?.id ? 'Tú' : n.autor_nombre}</span>
                          <span>{esHoy(n.created_at) ? horaDe(n.created_at) : `${capitalize(fullDateEs(ymd(new Date(n.created_at))))}, ${horaDe(n.created_at)}`}</span>
                          {n.privada && <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(109,40,217,0.10)] px-2 py-px text-[11px] font-semibold text-[#5b21b6] dark:text-[#c4b5fd]"><Lock className="h-3 w-3" /> Solo para mí</span>}
                          {n.autor_id === user?.id && <button onClick={() => borrar(n)} className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-[#dc2626]">Borrar</button>}
                        </p>
                        <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{n.texto}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 rounded-[14px] border bg-card p-2.5 focus-within:border-[#00a5df] focus-within:ring-2 focus-within:ring-[rgba(0,165,223,0.15)]">
                <textarea ref={caja} value={texto} rows={2} maxLength={2000} placeholder="Escribe una nota…" aria-label="Nueva nota" data-testid="ficha-nota-texto"
                  onChange={(e) => { setTexto(e.target.value); if (error) setError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) agregar(); }}
                  className="block w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                {error && <p className="mt-1 text-xs text-[#dc2626]">{error}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={privada} onChange={(e) => setPrivada(e.target.checked)} className="h-4 w-4 accent-[#1e395e]" data-testid="ficha-nota-privada" /> Solo para mí
                  </label>
                  <button onClick={agregar} disabled={enviando} data-testid="ficha-nota-agregar"
                    className="h-9 rounded-xl bg-[#1e395e] px-3.5 text-sm font-medium text-white hover:bg-[#162c49] disabled:opacity-60">{enviando ? 'Agregando…' : 'Agregar nota'}</button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
              {!ev.is_vacation && !ev.foreign && (
                <button onClick={() => onEditar(ev)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium hover:bg-muted" data-testid="ficha-editar"><Pencil className="h-4 w-4" /> Editar actividad</button>
              )}
              <button onClick={() => { onClose(); navigate('/agenda'); }} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-medium hover:bg-muted"><CalendarDays className="h-4 w-4" /> Abrir en Agenda</button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
