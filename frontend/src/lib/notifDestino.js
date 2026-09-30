// A qué pantalla lleva una notificación al tocarla, según lo que la originó.
// Mismo criterio que _PUSH_URL_BY_TYPE en backend/notifications.py; aquí además
// se usa el id para abrir la publicación exacta. null = no navega (solo se marca
// como leída).
export function destinoNotificacion(n) {
  switch (n?.related_type) {
    case 'activity': return '/agenda';
    case 'reservation': return '/sala-de-juntas';
    case 'vacation': return '/vacaciones';
    case 'promociones': return n.related_id ? `/formularios/custom/${n.related_id}` : '/formularios/promociones';
    default: return null;
  }
}
