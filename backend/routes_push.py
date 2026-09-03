"""Web Push subscription endpoints.

The browser fetches the VAPID public key, subscribes via the Push API and sends
the resulting subscription here. Delivery itself lives in `push.py` and is
triggered from `notifications.create_notification`.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict

from core import db, get_current_user, new_id, now_iso
import push

router = APIRouter(prefix='/push', tags=['push'])


class PushSubscriptionInput(BaseModel):
    endpoint: str
    keys: Dict[str, str]  # {p256dh, auth}
    user_agent: str = ''


class PushUnsubscribeInput(BaseModel):
    endpoint: str


@router.get('/vapid-public-key')
async def vapid_public_key(user=Depends(get_current_user)):
    if not push.is_configured():
        raise HTTPException(status_code=503, detail='Las notificaciones push no están configuradas en el servidor')
    return {'key': push.VAPID_PUBLIC_KEY}


@router.post('/subscribe')
async def subscribe(data: PushSubscriptionInput, user=Depends(get_current_user)):
    if not data.endpoint or not data.keys.get('p256dh') or not data.keys.get('auth'):
        raise HTTPException(status_code=400, detail='Suscripción push inválida')
    doc = {
        'user_id': user['id'],
        'endpoint': data.endpoint,
        'keys': {'p256dh': data.keys['p256dh'], 'auth': data.keys['auth']},
        'user_agent': (data.user_agent or '')[:300],
        'updated_at': now_iso(),
    }
    await db.push_subscriptions.update_one(
        {'endpoint': data.endpoint},
        {'$set': doc, '$setOnInsert': {'id': new_id(), 'created_at': now_iso()}},
        upsert=True,
    )
    return {'message': 'ok'}


@router.post('/unsubscribe')
async def unsubscribe(data: PushUnsubscribeInput, user=Depends(get_current_user)):
    await db.push_subscriptions.delete_one({'endpoint': data.endpoint, 'user_id': user['id']})
    return {'message': 'ok'}
