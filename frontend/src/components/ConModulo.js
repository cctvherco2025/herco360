import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { puede } from '@/lib/constants';

/* Pantallas de un módulo: sin el módulo encendido en su perfil (backend/acceso.py)
   la persona ve "No tienes acceso", aunque llegue por un enlace o un aviso.
   `modulo` puede ser una lista: basta con tener uno. */
export default function ConModulo({ modulo, nombre, children }) {
  const { user } = useAuth();
  const modulos = Array.isArray(modulo) ? modulo : [modulo];
  if (modulos.some((m) => puede(user, m))) return children;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center" data-testid="sin-acceso">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </span>
      <h1 className="font-heading text-xl font-semibold text-foreground">No tienes acceso a {nombre}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Tu perfil no incluye este módulo. Si lo necesitas, pídeselo a un administrador de tu departamento.</p>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#1e395e] px-5 text-sm font-semibold text-white hover:bg-[#162c49]">Ir al inicio</Link>
    </div>
  );
}
