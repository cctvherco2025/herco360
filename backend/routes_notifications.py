"""Notification routes."""
from fastapi import APIRouter, Depends, HTTPException
from core import db, get_current_user, serialize_doc

router = APIRouter(prefix='/notifications', tags=['notifications'])


@router.get('')
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return serialize_doc(items)


@router.get('/unread-count')
async def unread_count(user=Depends(get_current_user)):
    count = await db.notifications.count_documents({'user_id': user['id'], 'read': False})
    return {'count': count}


@router.post('/{notif_id}/read')
async def mark_read(notif_id: str, user=Depends(get_current_user)):
    await db.notifications.update_one({'id': notif_id, 'user_id': user['id']}, {'$set': {'read': True}})
    return {'message': 'ok'}


@router.post('/read-all')
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many({'user_id': user['id'], 'read': False}, {'$set': {'read': True}})
    return {'message': 'ok'}
