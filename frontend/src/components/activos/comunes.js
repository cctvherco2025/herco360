import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, Server, Cctv, Wrench, Hammer, Drill, PaintBucket, Car, Truck, Forklift, Fuel, Monitor, Laptop, Printer,
  Smartphone, Router, Cable, Snowflake, Zap, Battery, Fan, Lightbulb, Refrigerator, Armchair, Scale, Calculator,
  Shield, Tag, Boxes, ImageOff,
} from 'lucide-react';
import api from '@/lib/api';
import { fechaCorta } from '@/components/CalendarioFecha';

// Íconos que se pueden elegir para una categoría (mismas claves que ICONOS en routes_activos.py).
export const ICONOS = {
  package: Package, server: Server, cctv: Cctv, wrench: Wrench, hammer: Hammer, drill: Drill, paint: PaintBucket,
  car: Car, truck: Truck, forklift: Forklift, fuel: Fuel, monitor: Monitor, laptop: Laptop, printer: Printer,
  smartphone: Smartphone, router: Router, cable: Cable, snowflake: Snowflake, zap: Zap, battery: Battery, fan: Fan,
  lightbulb: Lightbulb, refrigerator: Refrigerator, armchair: Armchair, scale: Scale, calculator: Calculator,
  shield: Shield, tag: Tag, boxes: Boxes,
};

export function CategoriaIcono({ icono, className = 'h-4 w-4' }) {
  const Icon = ICONOS[icono] || Package;
  return <Icon className={className} />;
}

// Categorías que la persona ve (con sus campos), sucursales y si administra (GET /activos/meta).
export function useActivosMeta() {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    api.get('/activos/meta').then(({ data }) => setMeta(data)).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  const categoria = useCallback((id) => meta?.categorias.find((c) => c.id === id), [meta]);
  return { meta, error, categoria, reload: load };
}

export function EstadoActivo({ estado }) {
  return estado === 'baja'
    ? <span className="text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap bg-muted text-muted-foreground">De baja</span>
    : <span className="text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap bg-[rgba(22,163,74,0.14)] text-[#16a34a]">En uso</span>;
}

export function CodigoChip({ codigo, className = '' }) {
  return (
    <span className={`font-mono text-[12px] font-semibold rounded-md px-1.5 py-0.5 bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6] whitespace-nowrap ${className}`}>
      {codigo}
    </span>
  );
}

// Valor de un campo de la categoría, listo para mostrar.
export function valorCampo(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo.tipo === 'fecha') return fechaCorta(v);
  if (campo.tipo === 'si_no') return v ? 'Sí' : 'No';
  if (campo.tipo === 'decimal') return Number(v).toLocaleString('es-HN', { maximumFractionDigits: 2 });
  return String(v);
}

// "NVR-001 · Canal 3" (a qué pertenece y en qué posición)
export function perteneceA(a, cat) {
  if (!a?.padre) return '';
  return a.posicion && cat?.posicion_label ? `${a.padre.codigo} · ${cat.posicion_label} ${a.posicion}` : a.padre.codigo;
}

// Plural simple en español: "canal" → "canales", "bahía" → "bahías".
export const pluralEs = (p) => (/[aeiouáéó]$/i.test(p) ? `${p}s` : `${p}es`);

// Capacidad de posiciones de un activo madre para una categoría hija (p. ej. canales del NVR).
export const capacidad = (activo, hija) => (hija?.capacidad_campo ? Number(activo?.datos?.[hija.capacidad_campo]) || 0 : 0);

// Foto (descarga autenticada).
export function ActivoFoto({ activoId, foto, className, onClick, vacio = 'Sin foto' }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const fotoId = foto?.id;
  useEffect(() => {
    if (!fotoId) return undefined;
    let active = true; let objUrl;
    setSrc(null); setFailed(false);
    api.get(`/activos/${activoId}/foto/${fotoId}`, { responseType: 'blob' }).then((res) => {
      if (!active) return;
      objUrl = URL.createObjectURL(res.data);
      setSrc(objUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [activoId, fotoId]);
  if (!fotoId || failed) {
    return (
      <div className={`${className} bg-muted grid place-items-center text-center text-xs text-muted-foreground`}>
        <span className="flex flex-col items-center gap-1.5 px-2">
          <ImageOff className="h-5 w-5 opacity-60" />{failed ? 'No se pudo cargar la imagen' : vacio}
        </span>
      </div>
    );
  }
  if (!src) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={src} alt="Foto del activo" className={className} onClick={onClick} />;
}
