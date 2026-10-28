import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, X, Printer, Info, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessOrgChart, RETAIL, departamentoDe, esSuperAdmin } from '@/lib/constants';
import { useEstructura } from '@/lib/organizacion';
import { CargosDepto, NuevoDepartamento, AccionesDepartamento, destinosPosibles } from '@/components/OrgAdmin';
import { PerfilesAcceso, PerfilPorCargo, PersonasAcceso } from '@/components/AccesoAdmin';
import OrganigramaVivo from '@/components/OrganigramaVivo';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';

// ---- Institutional palette ----
const C = {
  navy: '#1e395e',
  cyan: '#00a5df',
  sky: '#3cbef6',
  green: '#16a34a',
  orange: '#ec9032',
  purple: '#712146',
  red: '#dc2626',
};

// Árbol de áreas de un departamento (sin límite de niveles) con su gente.
// Quien puede editar (super admin; admins y jefe del departamento) agrega
// áreas y subáreas, las renombra o las quita (si no tienen gente ni subáreas;
// las del sistema solo se renombran).
const ORDEN_NIVEL = ['jefe_depto', 'gerente', 'jefe', 'coordinador', 'colaborador'];

function AreaNodo({ area, hijas, gente, editable, acciones, todas, nivel = 0 }) {
  const [editando, setEditando] = useState(null); // { nombre, padre_id } | { sub: '' }
  const miembros = gente.filter((u) => u.area_id === area.id)
    .sort((a, b) => ORDEN_NIVEL.indexOf(a.nivel) - ORDEN_NIVEL.indexOf(b.nivel) || a.name.localeCompare(b.name));
  const color = [C.navy, C.cyan, C.green, C.orange, C.purple, C.sky][nivel % 6];
  const misHijas = hijas(area.id);
  return (
    // sangría por nivel (el árbol se dibuja como lista: el plugin de edición
    // visual de Emergent no soporta un componente que se dibuja a sí mismo)
    <div className={nivel ? 'mt-2 pl-3 sm:pl-4 border-l-2' : ''}
      style={nivel ? { borderColor: `${color}55`, marginLeft: `${(nivel - 1) * 14}px` } : undefined}>
      <div className="rounded-2xl border bg-card p-3 sm:p-4" style={{ borderTopColor: color, borderTopWidth: 3 }} data-testid="org-area">
        <div className="flex items-center justify-between gap-2">
          {editando && 'nombre' in editando ? (
            <form className="flex-1 space-y-1.5" onSubmit={async (e) => { e.preventDefault(); if (await acciones.renombrar(area, editando.nombre, editando.padre_id)) setEditando(null); }}>
              <div className="flex gap-1.5">
                <Input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className="h-8" aria-label="Nombre del área" />
                <Button type="submit" size="sm" className="h-8 rounded-lg" style={{ background: C.navy }}><Check className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => setEditando(null)}><X className="h-3.5 w-3.5" /></Button>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="shrink-0">Debajo de</span>
                <NativeSelect value={editando.padre_id || ''} onChange={(v) => setEditando({ ...editando, padre_id: v || null })}
                  className="h-8 text-xs" aria-label="Área de arriba" data-testid="org-area-padre">
                  <option value="">Ninguna (área principal)</option>
                  {destinosPosibles(todas, area.id).map((a) => <option key={a.id} value={a.id}>{a.etiqueta}</option>)}
                </NativeSelect>
              </label>
            </form>
          ) : (
            <>
              <p className="font-semibold text-foreground truncate">
                {area.nombre}
                {area.sistema && <span className="ml-2 align-middle text-[10px] font-medium rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">del sistema</span>}
              </p>
              {editable && (
                <div className="flex shrink-0 no-print">
                  <button type="button" title="Agregar subárea" onClick={() => setEditando({ sub: '' })} data-testid="org-area-sub"
                    className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
                  <button type="button" title="Cambiar nombre o mover" onClick={() => setEditando({ nombre: area.nombre, padre_id: area.padre_id || null })}
                    className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" title={area.sistema ? 'La usa el sistema: solo se renombra' : miembros.length || misHijas.length ? 'Tiene gente o subáreas' : 'Quitar área'}
                    disabled={area.sistema || !!miembros.length || !!misHijas.length} onClick={() => acciones.quitar(area)}
                    className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-[#dc2626] disabled:opacity-30 disabled:hover:bg-transparent"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </>
          )}
        </div>
        {miembros.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {miembros.map((u) => (
              <li key={u.id} className="flex items-center gap-2 min-w-0">
                <img src={u.avatar_url} alt="" className="h-6 w-6 rounded-full border object-cover" />
                <span className="truncate text-[13px] text-foreground">{u.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{u.position}</span>
              </li>
            ))}
          </ul>
        )}
        {editando && 'sub' in editando && (
          <form className="mt-2 flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (await acciones.crear(editando.sub, area.id)) setEditando(null); }}>
            <Input autoFocus value={editando.sub} placeholder={`Subárea de ${area.nombre}`} onChange={(e) => setEditando({ sub: e.target.value })} className="h-8" data-testid="org-subarea-nombre" />
            <Button type="submit" size="sm" disabled={!editando.sub.trim()} className="h-8 rounded-lg" style={{ background: C.navy }}>Agregar</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => setEditando(null)}><X className="h-3.5 w-3.5" /></Button>
          </form>
        )}
      </div>
    </div>
  );
}

function OrganigramaDepto({ depto, recargar }) {
  const [gente, setGente] = useState([]);
  const [nueva, setNueva] = useState(null);
  useEffect(() => {
    api.get('/users', { params: { status: 'approved' } })
      .then(({ data }) => setGente(data.filter((u) => departamentoDe(u) === depto.id))).catch(() => {});
  }, [depto.id]);
  const llamar = async (fn, ok) => {
    try { await fn(); toast.success(ok); await recargar(); return true; } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar'); return false;
    }
  };
  const acciones = {
    crear: (nombre, padre_id = null) => llamar(() => api.post('/org/areas', { departamento: depto.id, nombre, padre_id }), 'Área agregada'),
    renombrar: (a, nombre, padre_id) => llamar(() => api.put(`/org/areas/${a.id}`, { nombre, padre_id: padre_id || null }), 'Área actualizada'),
    quitar: (a) => llamar(() => api.delete(`/org/areas/${a.id}`), 'Área quitada'),
  };
  const hijas = (pid) => depto.areas.filter((a) => (a.padre_id || null) === pid);
  const sinArea = gente.filter((u) => u.nivel !== 'jefe_depto' && !u.area_id);

  return (
    <section className="mb-8 rounded-[22px] border bg-card p-5 sm:p-7 shadow-card" data-testid="org-depto">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full" style={{ background: C.green }} />
          <h2 className="font-heading text-lg font-semibold text-foreground">Áreas y subáreas de {depto.nombre}</h2>
        </div>
        {depto.puede_editar && (
          <Button variant="outline" size="sm" className="rounded-xl no-print" onClick={() => setNueva('')} data-testid="org-area-nueva">
            <Plus className="h-4 w-4 mr-1.5" /> Agregar área
          </Button>
        )}
      </div>

      {nueva !== null && (
        <form className="mb-3 flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (await acciones.crear(nueva)) setNueva(null); }}>
          <Input autoFocus value={nueva} placeholder="Nombre del área" onChange={(e) => setNueva(e.target.value)} className="h-9 max-w-sm" data-testid="org-area-nombre" />
          <Button type="submit" size="sm" disabled={!nueva.trim()} className="h-9 rounded-lg" style={{ background: C.navy }}>Agregar</Button>
          <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setNueva(null)}><X className="h-4 w-4" /></Button>
        </form>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* cada área principal con sus subáreas debajo (las áreas vienen en orden de árbol, con su nivel) */}
        {depto.areas.reduce((grupos, a) => {
          if (!a.padre_id || !grupos.length) grupos.push([a]); else grupos[grupos.length - 1].push(a);
          return grupos;
        }, []).map((grupo) => (
          <div key={grupo[0].id}>
            {grupo.map((a) => (
              <AreaNodo key={a.id} area={a} hijas={hijas} gente={gente} editable={depto.puede_editar} acciones={acciones}
                todas={depto.areas} nivel={a.nivel_arbol || 0} />
            ))}
          </div>
        ))}
      </div>
      {sinArea.length > 0 && (
        <p className="mt-4 text-[12px] text-muted-foreground">Sin área: {sinArea.map((u) => u.name).join(', ')}. Asígnales un área en Usuarios.</p>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-[12px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: C.orange }} />
        Las áreas pueden tener subáreas sin límite (agrégalas con +; con el lápiz se renombran o se mueven). El equipo de cada cargo es su área y lo que cuelga de ella; quién aprueba y a quién ve se define en Perfiles › Gente a cargo.
      </p>
    </section>
  );
}

const SECCIONES = [['estructura', 'Estructura'], ['perfiles', 'Perfiles'], ['cargos', 'Perfil por cargo'], ['personas', 'Personas']];

export default function Organigrama() {
  const { user } = useAuth();
  const superAdmin = esSuperAdmin(user);
  const { estructura, recargar } = useEstructura();
  // el super admin elige el departamento; los demás ven el suyo
  const [vista, setVista] = useState(departamentoDe(user));
  const [seccion, setSeccion] = useState('estructura');
  if (!canAccessOrgChart(user)) return <SoloOrganigrama />;
  const deptos = estructura?.departamentos || [];
  const depto = deptos.find((d) => d.id === (superAdmin ? vista : departamentoDe(user)));
  if (!estructura) return <p className="py-16 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!depto) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-[1400px] pb-10 print-area" data-testid="organigrama-page">
      <EncabezadoOrg deptos={superAdmin ? deptos : []} vista={depto.id} setVista={setVista} nombre={depto.nombre}
        superAdmin={superAdmin} depto={depto} recargar={recargar} />

      <div role="tablist" aria-label="Secciones" className="mb-6 flex flex-wrap gap-1 border-b no-print" data-testid="org-secciones">
        {SECCIONES.map(([id, nombre]) => (
          <button key={id} type="button" role="tab" aria-selected={seccion === id} onClick={() => setSeccion(id)}
            className={`-mb-px min-h-[44px] border-b-2 px-4 text-sm transition-colors ${seccion === id
              ? 'border-[#1e395e] font-semibold text-[#1e395e] dark:border-[#3cbef6] dark:text-[#3cbef6]' : 'border-transparent font-medium text-muted-foreground hover:text-foreground'}`}>
            {nombre}
          </button>
        ))}
      </div>

      {seccion === 'estructura' && (
        <>
          <section className="mb-8 rounded-[22px] border bg-card p-5 sm:p-7 shadow-card" data-testid="org-section">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-6 w-1.5 rounded-full" style={{ background: C.navy }} />
              <h2 className="font-heading text-lg font-semibold text-foreground">Organigrama de {depto.nombre}</h2>
            </div>
            <OrganigramaVivo key={depto.id} departamento={depto.id} />
          </section>
          <OrganigramaDepto depto={depto} recargar={recargar} />
          <CargosDepto depto={depto} recargar={recargar} />
        </>
      )}
      {seccion === 'perfiles' && <PerfilesAcceso key={depto.id} depto={depto.id} />}
      {seccion === 'cargos' && <PerfilPorCargo key={depto.id} depto={depto.id} />}
      {seccion === 'personas' && <PersonasAcceso key={depto.id} depto={depto.id} />}

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, header { display: none !important; }
          .print-area { max-width: 100% !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}

// Para quien no edita la estructura: el organigrama de su departamento, solo para ver.
function SoloOrganigrama() {
  return (
    <div className="mx-auto max-w-[1400px] pb-10 print-area" data-testid="organigrama-solo">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Organigrama</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cómo está organizado tu departamento: quién aprueba a cada cargo y a quién ve.</p>
        </div>
        <Button onClick={() => window.print()} className="no-print shrink-0 gap-2" style={{ background: C.navy }}>
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>
      <OrganigramaVivo />
      <style>{`@media print { .no-print { display: none !important; } aside, header { display: none !important; } body { background: #fff !important; } }`}</style>
    </div>
  );
}

function EncabezadoOrg({ deptos, vista, setVista, nombre, superAdmin, depto, recargar }) {
  const actual = { nombre };
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Jerarquía organizacional y acceso al sistema <span style={{ color: C.cyan }}>HERCO OPS</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {vista === RETAIL ? 'Ventas Retail: estructura de mando, perfiles y permisos' : `${actual?.nombre || 'Departamento'}: estructura de mando, perfiles y permisos`}
        </p>
        {superAdmin && (
          <div className="mt-2">
            <AccionesDepartamento depto={depto} recargar={recargar} onEliminado={() => setVista(RETAIL)} />
          </div>
        )}
        {(deptos.length > 1 || superAdmin) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 no-print" data-testid="org-depto-tabs">
            {deptos.map((d) => (
              <button key={d.id} type="button" onClick={() => setVista(d.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${vista === d.id
                  ? 'text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                style={vista === d.id ? { background: d.id === RETAIL ? C.navy : C.green } : undefined}>{d.nombre}</button>
            ))}
            {superAdmin && <NuevoDepartamento recargar={recargar} onCreado={setVista} />}
          </div>
        )}
      </div>
      <Button onClick={() => window.print()} data-testid="org-print-btn"
        className="no-print shrink-0 gap-2" style={{ background: C.navy }}>
        <Printer className="h-4 w-4" /> Imprimir / PDF
      </Button>
    </div>
  );
}
