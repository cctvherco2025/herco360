import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import api from '@/lib/api';
import { ENTREGAS, cuando, cuandoVence, diaCorto } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import RevisarFormulario from '@/pages/RevisarFormulario';

/* Supervisión: de todos los formularios, lo que le toca a quien supervisa (a
   los admins, todo su departamento). Se aprueba o devuelve aquí mismo. */

const PESTANAS = [['revisar', 'Por revisar'], ['aprobados', 'Aprobados'], ['devueltos', 'Devueltos'], ['vencidos', 'Vencidos'], ['seguimientos', 'Seguimientos abiertos']];
const VACIOS = { form_id: '', sucursal: '', persona: '', desde: '', hasta: '' };
const LABEL = 'flex flex-col gap-1 text-xs text-muted-foreground min-w-0';
const VACIO = {
  revisar: 'No hay nada por revisar.', aprobados: 'Nada aprobado todavía.', devueltos: 'No hay nada devuelto.', vencidos: 'No hay nada vencido.', seguimientos: 'No hay seguimientos abiertos.',
};
const SEGUIMIENTO = { abierto: 'Por corregir', corregido: 'Por validar' };

function Fila({ f, tab, onRevisar }) {
  const [nombre, chip] = ENTREGAS[{ revisar: 'revision', aprobados: 'completado', devueltos: 'devuelto', vencidos: 'vencido' }[tab]];
  const dia = f.abre ? ` · del ${diaCorto(f.abre)}` : '';
  const linea = {
    revisar: f.revisar_antes ? `Revisar antes de ${cuandoVence(f.revisar_antes).texto}` : 'Sin plazo',
    aprobados: `Aprobado por ${f.ultimo?.por?.name} ${cuando(f.ultimo?.at)}`,
    devueltos: `${f.ultimo?.por?.name} lo devolvió: «${f.ultimo?.comentario}»`,
    vencidos: `Venció ${cuandoVence(f.vence).texto}`,
  }[tab];
  return (
    <article className="rounded-2xl border bg-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex-[1_1_260px] min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-[15px] font-semibold">{f.titulo}</h2>
          <span className={`text-xs px-2 py-px rounded-full font-medium ${chip}`}>{tab === 'aprobados' ? 'Aprobado' : nombre}</span>
          {f.atrasada && tab === 'revisar' && <span className="text-xs font-medium text-[#b42318] dark:text-[#f87171]">Atrasada</span>}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {[f.quien, f.tienda].filter(Boolean).join(' · ')}{tab !== 'vencidos' && f.enviada_at ? ` · enviado ${cuando(f.enviada_at)}` : ''}{dia}{f.tardia ? ' · entregado tarde' : ''}
        </p>
        <p className="text-[13px] mt-0.5 break-words">{linea}</p>
      </div>
      {f.respuesta_id && (
        <Button className={`rounded-[10px] h-10 ${f.puede_revisar ? 'bg-[#1e395e] hover:bg-[#162c49] text-white' : ''}`} variant={f.puede_revisar ? 'default' : 'outline'} onClick={() => onRevisar(f)}>
          {f.puede_revisar ? 'Revisar' : 'Ver'}
        </Button>
      )}
    </article>
  );
}

function FilaSeguimiento({ f }) {
  const v = f.vence ? cuandoVence(f.vence) : null;
  return (
    <article className="rounded-2xl border bg-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex-[1_1_260px] min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-[15px] font-semibold">{f.titulo}</h2>
          <span className={`text-xs px-2 py-px rounded-full font-medium ${ENTREGAS.devuelto[1]}`}>{SEGUIMIENTO[f.estado] || f.estado}</span>
        </div>
        <p className="text-[13px] text-muted-foreground">{f.numero} · lo corrige {f.quien} · {f.corregidos} de {f.puntos} {f.puntos === 1 ? 'punto' : 'puntos'}</p>
        {v && <p className={`text-[13px] mt-0.5 ${f.vencido ? 'font-medium text-[#b42318] dark:text-[#f87171]' : ''}`}>{f.vencido ? 'Venció' : 'Vence'} {v.texto}</p>}
      </div>
      <Button asChild variant="outline" className="rounded-[10px] h-10"><Link to={`/formularios/tickets/${f.id}`}>Abrir</Link></Button>
    </article>
  );
}

export default function SupervisionFormularios() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'revisar';
  const [filtros, setFiltros] = useState(VACIOS);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const consulta = useMemo(() => ({ tab, ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)) }), [tab, filtros]);
  const hayFiltros = Object.keys(consulta).length > 1;

  const cargar = useCallback(() => {
    let vigente = true;
    setCargando(true);
    api.get('/formularios-v2/supervision', { params: consulta })
      .then(({ data }) => { if (vigente) { setD(data); setError(null); } })
      .catch((e) => { if (vigente) setError(e?.response?.data?.detail || 'No se pudo cargar'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [consulta]);
  useEffect(() => cargar(), [cargar]);

  const poner = (k) => (v) => setFiltros((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  if (error && !d) return <p className="text-sm text-muted-foreground text-center py-16">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;
  return (
    <div className="max-w-[1000px] mx-auto pt-2 flex flex-col gap-4">
      <header>
        <Link to="/formularios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"><ArrowLeft className="h-4 w-4" /> Formularios</Link>
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2"><BadgeCheck className="h-7 w-7 text-[#00a5df]" /> Supervisión</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Lo que te toca revisar de todos los formularios.</p>
      </header>

      <div className="rounded-2xl border bg-card p-3.5 flex flex-wrap items-end gap-2.5">
        <label className={`flex-[2_1_180px] ${LABEL}`}>Formulario
          <NativeSelect value={filtros.form_id} onChange={poner('form_id')} className="h-10 text-foreground">
            <option value="">Todos</option>{d.opciones.formularios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </NativeSelect>
        </label>
        <label className={`flex-[1_1_110px] ${LABEL}`}>Tienda
          <NativeSelect value={filtros.sucursal} onChange={poner('sucursal')} className="h-10 text-foreground">
            <option value="">Todas</option>{d.opciones.sucursales.map((x) => <option key={x} value={x}>{x}</option>)}
          </NativeSelect>
        </label>
        <label className={`flex-[1_1_150px] ${LABEL}`}>Persona
          <NativeSelect value={filtros.persona} onChange={poner('persona')} className="h-10 text-foreground">
            <option value="">Todas</option>{d.opciones.personas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </NativeSelect>
        </label>
        <label className={`flex-[1_1_130px] ${LABEL}`}>Desde<Input type="date" value={filtros.desde} onChange={poner('desde')} className="h-10 text-sm text-foreground" /></label>
        <label className={`flex-[1_1_130px] ${LABEL}`}>Hasta<Input type="date" value={filtros.hasta} onChange={poner('hasta')} className="h-10 text-sm text-foreground" /></label>
        {hayFiltros && <Button variant="ghost" className="rounded-xl h-10" onClick={() => setFiltros(VACIOS)}>Quitar filtros</Button>}
      </div>

      <div role="tablist" aria-label="Estado" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PESTANAS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}
            className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-sm ${tab === k ? 'border-2 border-[#1e395e] bg-[#1e395e] text-white font-semibold dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0b1424]' : 'border bg-card text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted'}`}>
            {n} · {d.conteos[k] ?? 0}
          </button>
        ))}
      </div>

      <div className={`flex flex-col gap-2.5 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
        {d.tab === tab && d.filas.map((f) => (tab === 'seguimientos' ? <FilaSeguimiento key={f.id} f={f} /> : <Fila key={f.id} f={f} tab={tab} onRevisar={setAbierta} />))}
        {d.tab === tab && !d.filas.length && <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">{hayFiltros ? 'Nada con estos filtros.' : VACIO[tab]}</div>}
        {d.filas.length >= d.tope && <p className="text-xs text-muted-foreground">Se muestran los primeros {d.tope}: usa los filtros para acotar.</p>}
      </div>

      <Dialog open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)}>
        <DialogContent className="sm:max-w-[780px] rounded-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{abierta?.titulo}</DialogTitle>
            <DialogDescription>Revisar la entrega</DialogDescription>
          </DialogHeader>
          {abierta && <RevisarFormulario aid={abierta.id} onResuelto={() => { setAbierta(null); cargar(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
