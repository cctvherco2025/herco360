// Al guardar, eliminar o mover una actividad que se repite: ¿a qué aplica?
// Se pregunta con confirmar({ opciones }) (components/ConfirmDialog).
// "Solo esta" se deshabilita cuando cambió la repetición (una regla nueva no
// puede aplicar a una sola fecha).
const OPCIONES = [
  { valor: 'esta', etiqueta: 'Solo esta actividad' },
  { valor: 'siguientes', etiqueta: 'Esta y las siguientes' },
  { valor: 'todas', etiqueta: 'Todas las actividades de la serie' },
];

export function opcionesAlcance(soloEstaDeshabilitada = false) {
  return OPCIONES.map((o) => ({ ...o, deshabilitada: o.valor === 'esta' && !!soloEstaDeshabilitada }));
}

export const NOTA_REGLA_CAMBIADA = 'Cambiaste la repetición: aplica a esta y las siguientes o a todas.';
