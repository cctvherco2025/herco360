// A qué pantalla lleva una notificación al tocarla, según lo que la originó.
// Mismo criterio que _PUSH_URL_BY_TYPE en backend/notifications.py; aquí además
// se usa el id para abrir la publicación exacta. null = no navega (solo se marca
// como leída).
export function destinoNotificacion(n) {
  switch (n?.related_type) {
    case 'activity': return '/agenda';
    case 'reservation': return '/sala-de-juntas';
    case 'vacation': return '/vacaciones';
    case 'promociones':
      if (!n.related_id) return '/formularios/promociones';
      return `/formularios/custom/${n.related_id}${n.type === 'promo_enviada' ? '?tab=revision' : ''}`;
    case 'ticket': return n.related_id ? `/formularios/tickets/${n.related_id}` : '/formularios/tickets';
    default: return null;
  }
}
