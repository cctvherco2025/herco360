import React from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Boxes, Lock, Sparkles, PackageSearch, Store } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessInventory } from '@/lib/constants';

export default function Inventario() {
  const { user } = useAuth();

  // Access control: only Tienda users (and admins) may enter this module.
  if (!canAccessInventory(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1100px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Boxes className="h-7 w-7 text-[#00a5df]" /> Inventario
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Módulo exclusivo del área de Tienda</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5">
          <Store className="h-3.5 w-3.5" /> Acceso Tienda
        </span>
      </div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-[20px] bg-card border shadow-card p-10 sm:p-14 text-center relative overflow-hidden">
        <div className="absolute inset-0 auth-bg opacity-60 pointer-events-none" />
        <div className="relative">
          <div className="mx-auto h-20 w-20 rounded-2xl grid place-items-center bg-[rgba(0,165,223,0.12)] mb-5">
            <PackageSearch className="h-10 w-10 text-[#00a5df]" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(236,144,50,0.14)] text-[#ec9032] text-xs font-semibold px-3 py-1">
            <Sparkles className="h-3.5 w-3.5" /> Próximamente
          </span>
          <h2 className="font-heading text-2xl font-semibold text-foreground mt-4">Módulo de Inventario en construcción</h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
            Aquí gestionarás el inventario de la Tienda. Este módulo está reservado y listo para desarrollarse — indícame cómo quieres que funcione y lo construimos juntos.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mt-8 max-w-2xl mx-auto text-left">
            {[
              { icon: Boxes, t: 'Productos', d: 'Catálogo y existencias' },
              { icon: PackageSearch, t: 'Movimientos', d: 'Entradas y salidas' },
              { icon: Store, t: 'Tienda', d: 'Control por sucursal' },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border bg-card/70 p-4">
                <c.icon className="h-5 w-5 text-[#1e395e] dark:text-[#3cbef6] mb-2" />
                <p className="font-medium text-sm">{c.t}</p>
                <p className="text-xs text-muted-foreground">{c.d}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Visible únicamente para usuarios del área <span className="font-semibold text-foreground">Tienda</span>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
