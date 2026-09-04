import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Percent, ArrowLeft, Plus, ChevronRight, Calendar, Users as UsersIcon } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canManagePromos } from '@/lib/constants';
import { Button } from '@/components/ui/button';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 'YYYY-MM' -> "Septiembre 2026". Si no calza el formato, muestra el valor tal cual.
export function periodoLabel(periodo) {
  if (!periodo) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  const idx = parseInt(m[2], 10) - 1;
  const nombre = MESES[idx];
  if (!nombre) return periodo;
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${m[1]}`;
}

export default function PromocionesHome() {
  const { user } = useAuth();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/formularios-custom/disponibles?kind=promociones');
      setForms(data);
    } catch (e) { toast.error('No se pudieron cargar las Promociones del mes'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const canCreate = canManagePromos(user);

  return (
    <div className="max-w-[840px] mx-auto pt-2">
      <Link to="/formularios" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Formularios
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Percent className="h-7 w-7 text-[#16a34a]" /> Promociones del mes
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Seguimiento a la disponibilidad y correcta exhibición de promociones en tienda</p>
        </div>
        {canCreate && (
          <Button asChild data-testid="promos-nuevo-button">
            <Link to="/formularios/promociones/nuevo"><Plus className="h-4 w-4 mr-1.5" /> Nueva publicación</Link>
          </Button>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>}

      {!loading && forms.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <Percent className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            {canCreate ? 'Todavía no hay ninguna publicación de Promociones del mes.' : 'No tienes publicaciones de Promociones del mes disponibles.'}
          </p>
          {canCreate && (
            <Button asChild className="mt-4 rounded-xl" data-testid="promos-nuevo-empty-button">
              <Link to="/formularios/promociones/nuevo"><Plus className="h-4 w-4 mr-1.5" /> Crear la primera</Link>
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {forms.map((f, i) => (
          <Link key={f.id} to={`/formularios/custom/${f.id}`} data-testid={`promos-item-${f.id}`}>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.04 }}
              className="group flex items-center gap-3 rounded-[16px] bg-card border shadow-card p-4 hover:shadow-cardmd hover:-translate-y-0.5 transition-[transform,box-shadow]">
              <span className="h-10 w-10 rounded-full grid place-items-center bg-[rgba(22,163,74,0.13)] shrink-0">
                <Calendar className="h-5 w-5 text-[#16a34a]" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-semibold truncate">{periodoLabel(f.periodo) || f.titulo}</p>
                <p className="text-xs text-muted-foreground truncate">{f.titulo}</p>
              </div>
              {f.status === 'borrador' && (
                <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">Borrador</span>
              )}
              {f.is_creator && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0"><UsersIcon className="h-3 w-3" /> tuyo</span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}
