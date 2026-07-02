import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Crown, ClipboardCheck, Headphones, Globe, Map, CreditCard, Store, Coins,
  Check, X, Printer, Home, CalendarDays, Building2, Palmtree, Boxes, FileText,
  ShieldCheck, Users, Info,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessOrgChart } from '@/lib/constants';
import { Button } from '@/components/ui/button';

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

// ---- Org-chart departments (dependen del Director Comercial) ----
const DEPARTMENTS = [
  { name: 'ECCP', color: C.navy, icon: ClipboardCheck, roles: ['Jefe de ECCP', 'Coordinadores de ECCP'] },
  { name: 'Centro de Servicio', color: C.cyan, icon: Headphones, roles: ['Jefe de Centro de Servicio'] },
  { name: 'Negocios Remotos', color: C.purple, icon: Globe, roles: ['Jefe de Negocios Remotos'] },
  { name: 'Negocios País', color: C.green, icon: Map, roles: ['Jefe de Negocios País'] },
  { name: 'Cajas', color: C.orange, icon: CreditCard, roles: ['Jefe de Cajas'] },
  { name: 'Operación Tienda', color: C.sky, icon: Store, roles: ['Gerente H1', 'Gerente H2', 'Gerente H4', 'Gerente H5', 'Gerente H6'] },
  { name: 'Ferrecrédito', color: C.red, icon: Coins, roles: ['Jefe de Ferrecrédito'] },
];

// ---- Permission matrix ----
const MODULES = [
  { key: 'inicio', label: 'Inicio', icon: Home },
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'sala', label: 'Sala de Juntas', icon: Building2 },
  { key: 'vacaciones', label: 'Vacaciones', icon: Palmtree },
  { key: 'inventario', label: 'Inventario', icon: Boxes },
  { key: 'reportes', label: 'Reportes', icon: FileText },
];

// order of booleans: [inicio, agenda, sala, vacaciones, inventario, reportes]
const FULL = [true, true, true, true, true, true];
const BASIC = [true, true, true, true, false, false];
const COORD = [true, true, true, true, false, true]; // Coordinadores ECCP: sin Inventario, con Reportes

const ROLES = [
  { role: 'Director Comercial', access: FULL, highlight: true },
  { role: 'Jefe de ECCP', access: FULL },
  { role: 'Coordinadores de ECCP', access: COORD },
  { role: 'Jefe Centro de Servicio', access: BASIC },
  { role: 'Jefe Negocios Remotos', access: BASIC },
  { role: 'Jefe Negocios País', access: BASIC },
  { role: 'Jefe de Cajas', access: BASIC },
  { role: 'Jefe de Ferrecrédito', access: BASIC },
  { role: 'Operación Tienda', access: FULL },
  { role: 'Gerente H1', access: FULL },
  { role: 'Gerente H2', access: FULL },
  { role: 'Gerente H4', access: FULL },
  { role: 'Gerente H5', access: FULL },
  { role: 'Gerente H6', access: FULL },
  { role: 'Otros usuarios', access: BASIC },
];

const Yes = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'rgba(22,163,74,0.12)' }} data-testid="perm-yes">
    <Check className="h-4 w-4" style={{ color: C.green }} strokeWidth={3} />
  </span>
);
const No = () => (
  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'rgba(220,38,38,0.10)' }} data-testid="perm-no">
    <X className="h-4 w-4" style={{ color: C.red }} strokeWidth={3} />
  </span>
);

function DeptCard({ dept }) {
  const Icon = dept.icon;
  return (
    <div className="flex flex-col items-center" data-testid={`org-dept-${dept.name}`}>
      {/* connector down from top rail */}
      <span className="h-5 w-px" style={{ background: '#cbd5e1' }} />
      <div
        className="w-full rounded-2xl border bg-card px-3 py-3 text-center shadow-sm"
        style={{ borderTopColor: dept.color, borderTopWidth: 3 }}
      >
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${dept.color}1a` }}>
          <Icon className="h-5 w-5" style={{ color: dept.color }} />
        </div>
        <p className="text-[13px] font-semibold leading-tight text-foreground">{dept.name}</p>
      </div>
      {/* sub-roles */}
      <span className="h-4 w-px" style={{ background: '#e2e8f0' }} />
      <div className="w-full space-y-1.5">
        {dept.roles.map((r) => (
          <div
            key={r}
            className="rounded-lg border bg-muted/40 px-2 py-1.5 text-center text-[11.5px] font-medium leading-tight text-muted-foreground"
            style={{ borderLeftColor: dept.color, borderLeftWidth: 3 }}
          >
            {r}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Organigrama() {
  const { user } = useAuth();
  if (!canAccessOrgChart(user)) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-[1400px] pb-10 print-area" data-testid="organigrama-page">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Jerarquía organizacional y acceso al sistema <span style={{ color: C.cyan }}>HERCO360</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Estructura de mando y matriz de permisos por rol (RBAC)</p>
        </div>
        <Button onClick={() => window.print()} data-testid="org-print-btn"
          className="no-print shrink-0 gap-2" style={{ background: C.navy }}>
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>

      {/* SECTION 1 — Organigrama */}
      <section className="mb-8 rounded-[22px] border bg-card p-5 sm:p-7 shadow-card" data-testid="org-section">
        <div className="mb-5 flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full" style={{ background: C.navy }} />
          <h2 className="font-heading text-lg font-semibold text-foreground">Jerarquía organizacional</h2>
        </div>

        {/* Director card */}
        <div className="flex flex-col items-center">
          <div className="w-full max-w-md rounded-2xl px-6 py-4 text-center shadow-md"
            style={{ background: `linear-gradient(135deg, ${C.navy}, #16294a)` }} data-testid="org-director">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <p className="text-base font-semibold text-white">Director Comercial</p>
            <p className="text-[12px] text-white/70">Máxima autoridad · acceso total al sistema</p>
          </div>
          {/* vertical + horizontal rail */}
          <span className="h-6 w-px" style={{ background: '#cbd5e1' }} />
          <span className="h-px w-[92%]" style={{ background: '#cbd5e1' }} />
        </div>

        {/* Departments row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7 lg:gap-3 mt-0">
          {DEPARTMENTS.map((d) => <DeptCard key={d.name} dept={d} />)}
        </div>
      </section>

      {/* SECTION 2 — Matriz de permisos */}
      <section className="mb-8 rounded-[22px] border bg-card p-5 sm:p-7 shadow-card" data-testid="matrix-section">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-6 w-1.5 rounded-full" style={{ background: C.cyan }} />
            <h2 className="font-heading text-lg font-semibold text-foreground">Matriz de permisos del sistema</h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Yes /> Tiene acceso</span>
            <span className="flex items-center gap-1.5"><No /> Sin acceso</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm" data-testid="permission-matrix">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 bg-muted/60 px-3 py-3 text-left text-[12px] font-semibold text-foreground min-w-[220px]">
                  Rol / Módulo
                </th>
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <th key={m.key} className="px-2 py-3 text-center text-[12px] font-semibold text-foreground min-w-[92px]">
                      <div className="flex flex-col items-center gap-1">
                        <Icon className="h-4 w-4" style={{ color: C.navy }} />
                        <span className="leading-tight">{m.label}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r.role} className="border-t" data-testid={`matrix-row-${r.role}`}>
                  <td
                    className={`sticky left-0 z-10 px-3 py-2.5 text-[12.5px] font-medium ${r.highlight ? 'text-white' : 'bg-card text-foreground'}`}
                    style={r.highlight ? { background: C.navy } : {}}
                  >
                    {r.role}
                  </td>
                  {r.access.map((ok, i) => (
                    <td key={i} className="px-2 py-2.5 text-center">
                      {ok ? <Yes /> : <No />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: C.orange }} />
          Los Coordinadores de ECCP acceden a Reportes (por área ECCP) pero no a Inventario, que se reserva a Jefes de ECCP, Gerentes de Tienda y Dirección.
        </p>
      </section>

      {/* SECTION 3 — Resumen */}
      <section data-testid="summary-section">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full" style={{ background: C.green }} />
          <h2 className="font-heading text-lg font-semibold text-foreground">Resumen</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Card 1 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="rounded-2xl border bg-card p-5 shadow-card" style={{ borderTopColor: C.green, borderTopWidth: 3 }} data-testid="summary-card-full">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${C.green}1a` }}>
                <ShieldCheck className="h-5 w-5" style={{ color: C.green }} />
              </span>
              <h3 className="font-heading text-base font-semibold text-foreground">Acceso completo</h3>
            </div>
            <p className="mb-2 text-[12px] text-muted-foreground">Los 6 módulos, incluidos Inventario y Reportes.</p>
            <ul className="space-y-1.5 text-[13px] text-foreground">
              {['Director Comercial', 'Jefe de ECCP', 'Operación Tienda', 'Gerentes H1, H2, H4, H5 y H6'].map((x) => (
                <li key={x} className="flex items-center gap-2"><Check className="h-3.5 w-3.5" style={{ color: C.green }} /> {x}</li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-[11.5px] text-muted-foreground">
              <strong>Coordinadores de ECCP:</strong> acceso completo excepto Inventario.
            </p>
          </motion.div>

          {/* Card 2 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="rounded-2xl border bg-card p-5 shadow-card" style={{ borderTopColor: C.orange, borderTopWidth: 3 }} data-testid="summary-card-basic">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${C.orange}1a` }}>
                <Users className="h-5 w-5" style={{ color: C.orange }} />
              </span>
              <h3 className="font-heading text-base font-semibold text-foreground">Acceso básico</h3>
            </div>
            <p className="mb-2 text-[12px] text-muted-foreground">Solo visualizan: Inicio, Agenda, Sala de Juntas y Vacaciones.</p>
            <ul className="space-y-1.5 text-[13px] text-foreground">
              {['Jefe Centro de Servicio', 'Jefe Negocios Remotos', 'Jefe Negocios País', 'Jefe de Cajas', 'Jefe de Ferrecrédito', 'Otros usuarios'].map((x) => (
                <li key={x} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: C.orange }} /> {x}</li>
              ))}
            </ul>
          </motion.div>

          {/* Card 3 */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="rounded-2xl border bg-card p-5 shadow-card" style={{ borderTopColor: C.purple, borderTopWidth: 3 }} data-testid="summary-card-notes">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${C.purple}1a` }}>
                <Info className="h-5 w-5" style={{ color: C.purple }} />
              </span>
              <h3 className="font-heading text-base font-semibold text-foreground">Notas importantes</h3>
            </div>
            <ul className="space-y-2.5 text-[13px] text-muted-foreground">
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.purple }} /> El sistema funciona con permisos por rol (RBAC).</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.purple }} /> Los módulos se muestran u ocultan automáticamente según el rol.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.purple }} /> Vacaciones está disponible para todos los usuarios.</li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.purple }} /> Inventario y Reportes solo son visibles para los roles autorizados.</li>
            </ul>
          </motion.div>
        </div>
      </section>

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
