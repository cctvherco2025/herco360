"""Agenda activity reminders.

A lightweight in-process loop (started from server.py) scans upcoming activities
every POLL_SECONDS and, when one is within its `reminder_minutes` window, sends a
notification to the creator and every participant who hasn't rejected. The
activity is then flagged `reminder_sent=True` so it fires only once; editing the
date/time re-arms it (see routes_activities.update_activity).

Times in the DB (`date` = YYYY-MM-DD, `start_time` = HH:MM) are LOCAL wall-clock
for the company (Honduras, UTC-6, no DST). The server runs in UTC, so we shift by
APP_UTC_OFFSET_HOURS to compare against "now".
"""
import os
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from core import db
from notifications import create_notification

logger = logging.getLogger("reminders")

POLL_SECONDS = int(os.environ.get("REMINDER_POLL_SECONDS", "60"))
APP_UTC_OFFSET_HOURS = float(os.environ.get("APP_UTC_OFFSET_HOURS", "-6"))
# Widest lead we support (used only to bound the DB query). 1 day.
MAX_LEAD_MINUTES = 24 * 60

_APP_TZ = timezone(timedelta(hours=APP_UTC_OFFSET_HOURS))

_task = None


def _now_local() -> datetime:
    return datetime.now(timezone.utc).astimezone(_APP_TZ).replace(tzinfo=None)


def _start_dt(activity) -> datetime | None:
    try:
        return datetime.strptime(
            f"{activity['date']} {activity['start_time']}", "%Y-%m-%d %H:%M"
        )
    except Exception:
        return None


async def _scan_and_send() -> None:
    now = _now_local()
    horizon = now + timedelta(minutes=MAX_LEAD_MINUTES)
    query = {
        "date": {"$gte": now.strftime("%Y-%m-%d"), "$lte": horizon.strftime("%Y-%m-%d")},
        "is_vacation": {"$ne": True},
        "reminder_sent": {"$ne": True},
    }
    activities = await db.activities.find(query, {"_id": 0}).to_list(1000)
    for a in activities:
        lead = a.get("reminder_minutes")
        if not isinstance(lead, int) or lead <= 0:
            continue
        start = _start_dt(a)
        if not start:
            continue
        delta_min = (start - now).total_seconds() / 60.0
        # Fire once the activity is inside its lead window but hasn't started yet.
        if delta_min < 0 or delta_min > lead:
            continue

        # Atomically claim this reminder so a slow tick can't double-send.
        claimed = await db.activities.update_one(
            {"id": a["id"], "reminder_sent": {"$ne": True}},
            {"$set": {"reminder_sent": True, "reminder_sent_at": now.isoformat()}},
        )
        if claimed.modified_count == 0:
            continue

        recipients = {a.get("created_by")}
        for p in a.get("participants", []):
            if p.get("status") != "rejected":
                recipients.add(p.get("user_id"))
        recipients.discard(None)

        msg = f"'{a['title']}' empieza a las {a['start_time']}"
        for uid in recipients:
            try:
                await create_notification(
                    uid, "actividad_recordatorio", msg,
                    related_id=a["id"], related_type="activity",
                )
            except Exception as e:  # pragma: no cover
                logger.warning(f"reminder notify failed for {uid}: {e}")


async def _loop() -> None:
    logger.info(
        f"Reminder loop started (poll {POLL_SECONDS}s, tz UTC{APP_UTC_OFFSET_HOURS:+g})"
    )
    while True:
        try:
            await _scan_and_send()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # pragma: no cover
            logger.warning(f"reminder scan error: {e}")
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
