"""Helpers to create notifications and activity-log feed entries."""
import asyncio
import logging

from core import db, new_id, now_iso
import push

logger = logging.getLogger("notifications")

# Keep strong references to fire-and-forget push tasks so they aren't GC'd mid-flight.
_bg_tasks = set()

# Where a push notification should land the user when tapped, by related_type.
_PUSH_URL_BY_TYPE = {
    'activity': '/agenda',
    'reservation': '/sala-de-juntas',
    'vacation': '/vacaciones',
    'user': '/usuarios',
}


def _fire_push(user_id, title, message, related_type):
    """Schedule a best-effort Web Push for this notification. Never raises."""
    try:
        payload = {
            'title': title or 'HERCO360',
            'body': message or '',
            'url': _PUSH_URL_BY_TYPE.get(related_type, '/notificaciones'),
            'icon': '/icon-192.png',
            'tag': related_type or 'general',
        }
        task = asyncio.create_task(push.send_push_to_user(user_id, payload))
        _bg_tasks.add(task)
        task.add_done_callback(_bg_tasks.discard)
    except RuntimeError:
        # No running loop (e.g. called from a sync context) — skip push silently.
        pass
    except Exception as e:  # pragma: no cover
        logger.warning(f"_fire_push failed: {e}")


NOTIFICATION_META = {
    'usuario_pendiente': {'title': 'Nuevo usuario pendiente', 'icon': 'UserPlus', 'color': '#ec9032'},
    'usuario_aprobado': {'title': 'Cuenta aprobada', 'icon': 'UserCheck', 'color': '#16a34a'},
    'actividad_asignada': {'title': 'Nueva actividad asignada', 'icon': 'CalendarPlus', 'color': '#00a5df'},
    'actividad_recordatorio': {'title': 'Recordatorio de actividad', 'icon': 'Clock', 'color': '#00a5df'},
    'participacion_rechazada': {'title': 'Participación rechazada', 'icon': 'UserX', 'color': '#dc2626'},
    'sala_reservada': {'title': 'Sala de Juntas reservada', 'icon': 'Bookmark', 'color': '#00a5df'},
    'sala_cancelada': {'title': 'Reserva cancelada', 'icon': 'Ban', 'color': '#8a8b8b'},
    'vacacion_solicitada': {'title': 'Solicitud de vacaciones', 'icon': 'Palmtree', 'color': '#ec9032'},
    'vacacion_aprobada': {'title': 'Solicitud aprobada', 'icon': 'CalendarCheck', 'color': '#16a34a'},
    'vacacion_rechazada': {'title': 'Solicitud rechazada', 'icon': 'CalendarX', 'color': '#dc2626'},
}


async def create_notification(user_id, ntype, message, related_id=None, related_type=None,
                              actor_name=None, actor_avatar=None):
    meta = NOTIFICATION_META.get(ntype, {'title': 'Notificación', 'icon': 'Bell', 'color': '#1e395e'})
    doc = {
        'id': new_id(),
        'user_id': user_id,
        'type': ntype,
        'title': meta['title'],
        'icon': meta['icon'],
        'color': meta['color'],
        'message': message,
        'read': False,
        'related_id': related_id,
        'related_type': related_type,
        'actor_name': actor_name,
        'actor_avatar': actor_avatar,
        'created_at': now_iso(),
    }
    await db.notifications.insert_one(doc)
    _fire_push(user_id, meta['title'], message, related_type)
    return doc


async def notify_admins(ntype, message, exclude_user_id=None, **kwargs):
    admins = await db.users.find({'role': 'admin', 'status': 'approved'}, {'_id': 0, 'id': 1}).to_list(100)
    for a in admins:
        if a['id'] == exclude_user_id:
            continue
        await create_notification(a['id'], ntype, message, **kwargs)


async def notify_area_managers(area, ntype, message, exclude_user_id=None, **kwargs):
    """Notify Jefe/Gerente/Director of a given área.

    The Director comercial oversees every area, so they're always notified
    regardless of the requester's area.
    """
    managers = await db.users.find({
        'status': 'approved',
        '$or': [
            {'area': area, 'position': {'$in': ['Jefe', 'Gerente', 'Director comercial']}},
            {'position': 'Director comercial'},
        ],
    }, {'_id': 0, 'id': 1}).to_list(100)
    seen = set()
    for m in managers:
        if m['id'] == exclude_user_id or m['id'] in seen:
            continue
        seen.add(m['id'])
        await create_notification(m['id'], ntype, message, **kwargs)


async def log_activity(actor_id, actor_name, actor_avatar, action, target=None, target_type=None):
    """Recent activity feed (visible to all)."""
    doc = {
        'id': new_id(),
        'actor_id': actor_id,
        'actor_name': actor_name,
        'actor_avatar': actor_avatar,
        'action': action,  # human readable e.g. 'creó una actividad'
        'target': target,
        'target_type': target_type,
        'created_at': now_iso(),
    }
    await db.activity_log.insert_one(doc)
    return doc
