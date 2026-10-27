import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { RETAIL } from '@/lib/constants';

/* Estructura de la organización (backend/organizacion.py): departamentos,
   áreas en árbol (sin límite de niveles) y cargos con nivel de mando.
   - useOrgPublica(): para registrarse (sin sesión); cargos que cada quien
     puede elegir (los de mando los asigna un admin).
   - useEstructura(): lo que la persona ve (el super admin, todos los
     departamentos) con su árbol, cargos y cuánta gente tiene cada uno. */

export const NIVELES = {
  jefe_depto: 'Jefe del departamento',
  gerente: 'Gerente',
  jefe: 'Jefe',
  coordinador: 'Coordinador',
  colaborador: 'Colaborador',
};
export const NIVELES_DE_MANDO = ['jefe_depto', 'gerente', 'jefe'];

export function useOrgPublica() {
  const [deptos, setDeptos] = useState(null);
  useEffect(() => {
    api.get('/org/publico').then(({ data }) => setDeptos(data.departamentos)).catch(() => setDeptos([]));
  }, []);
  return deptos;
}

export function useEstructura() {
  const [data, setData] = useState(null);
  const cargar = useCallback(() => api.get('/org/estructura')
    .then(({ data: d }) => setData(d)).catch(() => setData({ departamentos: [], niveles: NIVELES })), []);
  useEffect(() => { cargar(); }, [cargar]);
  return { estructura: data, recargar: cargar };
}

// Nombre visible de un departamento (los de antes usan su nombre como id).
export const nombreDepto = (deptos, id) => (deptos || []).find((d) => d.id === (id || RETAIL))?.nombre || id || RETAIL;

// Colores de etiqueta por departamento (Retail azul, Logística verde, el resto rotan).
const TONOS = [
  'bg-[rgba(0,165,223,0.12)] text-[#0284c7] dark:text-[#3cbef6]',
  'bg-[rgba(22,163,74,0.12)] text-[#16a34a]',
  'bg-[rgba(236,144,50,0.14)] text-[#c2410c]',
  'bg-[rgba(113,33,70,0.12)] text-[#712146] dark:text-[#e879b0]',
  'bg-[rgba(30,57,94,0.1)] text-[#1e395e] dark:text-[#93c5fd]',
];
export const tonoDepto = (deptos, id) => {
  const i = (deptos || []).findIndex((d) => d.id === (id || RETAIL));
  return TONOS[(i < 0 ? 0 : i) % TONOS.length];
};
