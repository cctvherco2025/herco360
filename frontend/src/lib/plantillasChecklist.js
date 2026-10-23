// Plantillas de checklist: se abren en el editor ya llenas, se adecúan y se
// guardan como un checklist propio (la plantilla no cambia). Mismo formato
// que un checklist: tipos 'estado' | 'unica' | 'multiple' | 'check' |
// 'numero' | 'texto' | 'foto'; fotos 'no' | 'opcional' | 'obligatoria';
// en selección, las opciones con falla: true cuentan como falla.
const op = (...textos) => textos.map((t) => (t.startsWith('!') ? { texto: t.slice(1), falla: true } : { texto: t, falla: false }));

export const PLANTILLAS_CHECKLIST = [
  {
    clave: 'cctv',
    icono: 'cctv',
    nombre: 'Mantenimiento de NVR y cámaras',
    descripcion: 'Revisión del grabador, los discos, la grabación y cada cámara: limpieza, encuadre y visión nocturna.',
    antes_despues: true,
    items: [
      { texto: 'Todos los canales en línea', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Grabación de las últimas 24 horas sin huecos', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Días de grabación disponibles', tipo: 'numero', unidad: 'días', obligatorio: true, fotos: 'no' },
      { texto: 'Estado de los discos (S.M.A.R.T.)', tipo: 'unica', obligatorio: true, fotos: 'opcional', opciones: op('Normal', '!Advertencia', '!Error o disco no detectado') },
      { texto: 'Fecha y hora del NVR correctas', tipo: 'check', obligatorio: true, fotos: 'no' },
      { texto: 'Temperatura y ventilación del NVR', tipo: 'unica', obligatorio: true, fotos: 'opcional', opciones: op('Normal', 'Polvo acumulado (se limpió)', '!Sobrecalentado o ventilador detenido') },
      { texto: 'Limpieza realizada', tipo: 'multiple', obligatorio: true, fotos: 'opcional', opciones: op('Lente o domo de las cámaras', 'Carcasa del NVR', 'Ventiladores', 'Rack o gabinete') },
      { texto: 'Encuadre y enfoque de las cámaras igual a la foto de referencia', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Visión nocturna (infrarrojo) funcionando', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Cables, conectores y puertos PoE en buen estado', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'UPS funcionando y con batería', tipo: 'estado', obligatorio: true, fotos: 'no' },
      { texto: 'Foto de la vista de todos los canales', tipo: 'foto', obligatorio: true, fotos: 'obligatoria' },
      { texto: 'Observaciones', tipo: 'texto', obligatorio: false, fotos: 'no' },
    ],
  },
  {
    clave: 'aire',
    icono: 'snowflake',
    nombre: 'Mantenimiento de aire acondicionado',
    descripcion: 'Limpieza de filtros y serpentines, drenaje, condensador, temperatura de salida y prueba de funcionamiento.',
    antes_despues: true,
    items: [
      { texto: 'Tipo de equipo', tipo: 'unica', obligatorio: true, fotos: 'no', opciones: op('Mini split', 'Ventana', 'Central', 'Paquete') },
      { texto: 'Estado de los filtros', tipo: 'unica', obligatorio: true, fotos: 'opcional', opciones: op('Limpios', 'Sucios (se lavaron)', 'Se cambiaron', '!Rotos o deformados') },
      { texto: 'Serpentín del evaporador limpio', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Condensador (unidad exterior) limpio y sin obstrucciones', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Drenaje de condensado sin obstrucción ni fugas', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Ruidos o vibraciones', tipo: 'unica', obligatorio: true, fotos: 'no', opciones: op('Ninguno', 'Leves', '!Fuertes o anormales') },
      { texto: 'Temperatura del aire de salida', tipo: 'numero', unidad: '°C', obligatorio: true, fotos: 'no' },
      { texto: 'Presión del refrigerante', tipo: 'numero', unidad: 'psi', obligatorio: false, fotos: 'no' },
      { texto: 'Conexiones eléctricas y aislamiento de tuberías', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Control remoto o termostato funcionando', tipo: 'estado', obligatorio: true, fotos: 'no' },
      { texto: 'Trabajos realizados', tipo: 'multiple', obligatorio: true, fotos: 'opcional', opciones: op('Lavado de filtros', 'Limpieza de serpentines', 'Limpieza de bandeja de drenaje', 'Ajuste de conexiones eléctricas', 'Recarga de refrigerante') },
      { texto: 'El equipo enciende y enfría correctamente al terminar', tipo: 'check', obligatorio: true, fotos: 'no' },
      { texto: 'Observaciones', tipo: 'texto', obligatorio: false, fotos: 'no' },
    ],
  },
  {
    clave: 'pintura',
    icono: 'paint',
    nombre: 'Mantenimiento de máquinas de pintura preparada',
    descripcion: 'Dispensadora tintométrica y agitadora: colorantes, boquillas, calibración, piezas móviles y limpieza.',
    antes_despues: true,
    items: [
      { texto: 'Máquina revisada', tipo: 'unica', obligatorio: true, fotos: 'no', opciones: op('Dispensadora (tintométrica)', 'Agitadora o mezcladora', 'Ambas') },
      { texto: 'Nivel de colorantes en los canisters', tipo: 'unica', obligatorio: true, fotos: 'opcional', opciones: op('Adecuado', 'Bajo (se avisó para reponer)', '!Vacío en algún canister') },
      { texto: 'Boquillas limpias, sin colorante seco', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Humidificador de boquillas con agua', tipo: 'check', obligatorio: true, fotos: 'no' },
      { texto: 'Agitación de los canisters funcionando', tipo: 'estado', obligatorio: true, fotos: 'no' },
      { texto: 'Prueba de dispensado (calibración)', tipo: 'unica', obligatorio: true, fotos: 'opcional', opciones: op('Dentro de tolerancia', '!Fuera de tolerancia', 'No se realizó') },
      { texto: 'Agitadora: sujeción del bote y vibración correctas', tipo: 'estado', obligatorio: true, fotos: 'opcional' },
      { texto: 'Bandas, motor y piezas móviles', tipo: 'unica', obligatorio: true, fotos: 'opcional', opciones: op('Bien', 'Con desgaste', '!Dañado') },
      { texto: 'Software y base de fórmulas funcionando', tipo: 'estado', obligatorio: true, fotos: 'no' },
      { texto: 'Limpieza general de la máquina y el área de trabajo', tipo: 'check', obligatorio: true, fotos: 'obligatoria' },
      { texto: 'Observaciones', tipo: 'texto', obligatorio: false, fotos: 'no' },
    ],
  },
];
