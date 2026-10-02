"""Agenda activity reminders.

A lightweight in-process loop (started from server.py) scans upcoming activities
every POLL_SECONDS and notifies the creator and every participant who hasn't
rejected when an activity enters one of its reminder windows.

Each activity carries `reminder_offsets` (minutes before start, e.g. [60, 15])
and `reminders_sent` (offsets already fired). When `reminder_offsets` is not set
the DEFAULT_REMINDER_OFFSETS are used, so activities get a 1-hour and a 15-minute
reminder even if nobody configured one. `reminder_offsets == []` means no reminder.

Times in the DB (`date` = YYYY-MM-DD, `start_time` = HH:MM) are LOCAL wall-clock
for the company (Honduras, UTC-6, no DST). The server runs in UTC, so we shift by
APP_UTC_OFFSET_HOURS to compare against "now".
"""
import os
import asyncio
import logging
from datetime import datetime, timedelta

from core import db, now_local, APP_UTC_OFFSET_HOURS
from notifications import create_notification
import recurrence as rec
import promo_plazos
import tareas

logger = logging.getLogger("reminders")

POLL_SECONDS = int(os.environ.get("REMINDER_POLL_SECONDS", "60"))


def _parse_offsets(raw: str, fallback):
    try:
        vals = sorted({int(x.strip()) for x in raw.split(",") if x.strip()}, reverse=True)
        return [v for v in vals if 0 < v <= 24 * 60] or fallback
    except Exception:
        return fallback


# Applied when an activity has no reminder configured. Override with
# DEFAULT_REMINDER_OFFSETS="60,15" (comma-separated minutes-before).
DEFAULT_REMINDER_OFFSETS = _parse_offsets(
    os.environ.get("DEFAULT_REMINDER_OFFSETS", "60,15"), [60, 15]
)
# Widest lead we support (bounds the DB query).
MAX_LEAD_MINUTES = 24 * 60

_task = None


def _start_dt(activity):
    try:
        return datetime.strptime(
            f"{activity['date']} {activity['start_time']}", "%Y-%m-%d %H:%M"
        )
    except Exception:
        return None


def _effective_offsets(activity) -> list:
    """Reminder offsets for this activity, honouring the legacy single field."""
    raw = activity.get("reminder_offsets")
    if isinstance(raw, list):
        return sorted({int(x) for x in raw if isinstance(x, (int, float)) and x > 0}, reverse=True)
    legacy = activity.get("reminder_minutes")
    if isinstance(legacy, int):
        return [legacy] if legacy > 0 else []
    return list(DEFAULT_REMINDER_OFFSETS)


def _humanize(minutes: float) -> str:
    """Human "time until" label from the real remaining minutes."""
    m = max(1, int(round(minutes)))
    if m >= 1440:
        d = round(m / 1440)
        return "mañana" if d == 1 else f"en {d} días"
    if m >= 50:
        h = round(m / 60)
        return "en 1 hora" if h <= 1 else f"en {h} horas"
    return "en 1 minuto" if m == 1 else f"en {m} minutos"


def _pendientes(sueltas, series, now, horizon):
    """(actividad, inicio, clave) de cada inicio próximo a revisar.

    `clave(offset)` es lo que se guarda en `reminders_sent`: el offset (int) en
    una actividad suelta, o "YYYY-MM-DD|offset" en una serie con RRULE, porque
    cada repetición lleva sus propios recordatorios."""
    for a in sueltas:
        start = _start_dt(a)
        if start:
            yield a, start, (lambda off: off)
    for a in series:
        try:
            # sin las repeticiones eliminadas o editadas aparte (esas avisan por su cuenta)
            dias = rec.fechas(a["rrule"], a["date"], a["start_time"], now.date(), horizon.date(),
                              excluir=a.get("exdates"))
            hh, mm = map(int, a["start_time"].split(":"))
        except Exception as e:  # pragma: no cover
            logger.warning(f"reminder: regla inválida en {a.get('id')}: {e}")
            continue
        for d in dias:
            yield a, datetime(d.year, d.month, d.day, hh, mm), (lambda off, d=d: f"{d.isoformat()}|{off}")


async def _scan_and_send() -> None:
    now = now_local()
    horizon = now + timedelta(minutes=MAX_LEAD_MINUTES)
    hoy, tope = now.strftime("%Y-%m-%d"), horizon.strftime("%Y-%m-%d")
    sueltas = await db.activities.find({
        "date": {"$gte": hoy, "$lte": tope},
        "rrule": {"$exists": False},
        "is_vacation": {"$ne": True},
    }, {"_id": 0}).to_list(1000)
    # Series con RRULE vigentes: sus repeticiones se calculan aquí.
    series = await db.activities.find({
        "rrule": {"$exists": True},
        "date": {"$lte": tope},
        "$or": [{"serie_hasta": None}, {"serie_hasta": {"$gte": hoy}}],
        "is_vacation": {"$ne": True},
    }, {"_id": 0}).to_list(1000)
    for a in series:
        # Limpia las marcas de repeticiones de días anteriores ("2026-09-29|60" < "2026-09-30").
        if any(isinstance(x, str) and x < hoy for x in (a.get("reminders_sent") or [])):
            await db.activities.update_one({"id": a["id"]}, {"$pull": {"reminders_sent": {"$lt": hoy}}})

    for a, start, clave in _pendientes(sueltas, series, now, horizon):
        offsets = _effective_offsets(a)
        if not offsets:
            continue
        delta_min = (start - now).total_seconds() / 60.0
        if delta_min < 0:
            continue
        sent = set(a.get("reminders_sent") or [])
        due = sorted(x for x in offsets if clave(x) not in sent and delta_min <= x)
        if not due:
            continue

        # Claim every due offset in one atomic update so a slow tick can't
        # double-send. If another worker/tick already claimed the nearest one,
        # modified_count is 0 and we skip.
        fire_for = clave(due[0])  # smallest = most urgent / most accurate label
        claimed = await db.activities.update_one(
            {"id": a["id"], "reminders_sent": {"$nin": [fire_for]}},
            {"$addToSet": {"reminders_sent": {"$each": [clave(x) for x in due]}}},
        )
        if claimed.modified_count == 0:
            continue

        recipients = {a.get("created_by")}
        for p in a.get("participants", []):
            if p.get("status") != "rejected":
                recipients.add(p.get("user_id"))
        recipients.discard(None)

        msg = f"'{a['title']}' empieza {_humanize(delta_min)} · {a['start_time']}"
        for uid in recipients:
            try:
                await create_notification(
                    uid, "actividad_recordatorio", msg,
                    related_id=a["id"], related_type="activity",
                    # un recordatorio que llega después de que empezó no sirve:
                    # el servicio push lo guarda solo hasta la hora de inicio
                    push_ttl=int(delta_min * 60),
                )
            except Exception as e:  # pragma: no cover
                logger.warning(f"reminder notify failed for {uid}: {e}")


async def _loop() -> None:
    logger.info(
        f"Reminder loop started (poll {POLL_SECONDS}s, tz UTC{APP_UTC_OFFSET_HOURS:+g}, "
        f"default offsets {DEFAULT_REMINDER_OFFSETS})"
    )
    while True:
        try:
            await _scan_and_send()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover
            logger.warning(f"reminder scan error: {e}")
        # Promociones del mes: recordatorios y vencimientos de tareas y tickets
        try:
            await promo_plazos.revisar_vencimientos()
            await tareas.revisar_tareas()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover
            logger.warning(f"promo plazos error: {e}")
        await asyncio.sleep(POLL_SECONDS)


def start() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


async def stop() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
