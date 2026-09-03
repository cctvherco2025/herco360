"""Web Push (VAPID) delivery for HERCO360.

The rest of the app calls `send_push_to_user(user_id, payload)` — typically from
`notifications.create_notification`, so every in-app notification also reaches
the user's registered browsers/devices.

Configuration (environment):
    VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed EC P-256 point ("B..." / "04..")
    VAPID_PRIVATE_KEY  base64url, 32-byte raw EC P-256 private key
    VAPID_SUBJECT       contact URI, e.g. "mailto:soporte@herco.com"

If the keys are absent (local dev), every function degrades to a silent no-op so
notifications keep working without push.

Subscriptions live in the `push_subscriptions` collection:
    { id, user_id, endpoint (unique), keys: {p256dh, auth}, user_agent, created_at }
Expired endpoints (HTTP 404/410) are pruned automatically on send.
"""
import os
import json
import asyncio
import logging

from core import db

logger = logging.getLogger("push")

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:soporte@herco.com").strip()


def is_configured() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def _send_one(subscription_info: dict, data: str) -> int:
    """Send a single Web Push message. Returns the HTTP status code (or 0 on error)."""
    from pywebpush import webpush, WebPushException
    try:
        resp = webpush(
            subscription_info=subscription_info,
            data=data,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUBJECT},
            timeout=10,
        )
        return getattr(resp, "status_code", 201)
    except WebPushException as e:
        return getattr(getattr(e, "response", None), "status_code", 0) or 0
    except Exception as e:  # pragma: no cover - network/lib edge cases
        logger.warning(f"web push error: {e}")
        return 0


def _deliver_sync(subs: list, payload: dict) -> list:
    """Blocking fan-out. Returns endpoints that must be pruned (expired/gone)."""
    data = json.dumps(payload)
    dead = []
    for s in subs:
        info = {"endpoint": s["endpoint"], "keys": s.get("keys", {})}
        code = _send_one(info, data)
        if code in (404, 410):
            dead.append(s["endpoint"])
    return dead


async def send_push_to_user(user_id: str, payload: dict) -> None:
    """Fire-and-forget push to every browser/device the user has registered.

    `payload` is delivered verbatim to the service worker; expected shape:
        { "title": str, "body": str, "url": str, "icon": str, "tag": str }
    Never raises — push must not be able to break the request that triggered it.
    """
    try:
        if not is_configured():
            return
        subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
        if not subs:
            return
        dead = await asyncio.to_thread(_deliver_sync, subs, payload)
        if dead:
            await db.push_subscriptions.delete_many({"endpoint": {"$in": dead}})
    except Exception as e:  # pragma: no cover
        logger.warning(f"send_push_to_user failed for {user_id}: {e}")
