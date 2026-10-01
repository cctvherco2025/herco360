"""Auth routes: register, login, me."""
from fastapi import APIRouter, HTTPException, Depends
from core import (db, hash_password, verify_password, create_access_token, new_id, now_iso, get_current_user,
                  CARGOS_SOLO_ADMIN)
from models import RegisterInput, LoginInput, ChangePasswordInput
from notifications import notify_admins

router = APIRouter(prefix='/auth', tags=['auth'])


def avatar_for(name):
    from urllib.parse import quote
    return f"https://ui-avatars.com/api/?name={quote(name)}&background=1e395e&color=fff&bold=true"


@router.post('/register')
async def register(data: RegisterInput):
    existing = await db.users.find_one({'email': data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail='El correo ya está registrado')
    # Los cargos de mando (Director comercial, Gerente, Jefe, Jefe de tienda)
    # dan acceso a más módulos: solo los asigna un administrador.
    if (data.position or '').strip() in CARGOS_SOLO_ADMIN:
        raise HTTPException(status_code=400,
                            detail='Ese cargo lo asigna un administrador. Regístrate con tu cargo actual.')
    user = {
        'id': new_id(),
        'name': data.name,
        'email': data.email.lower(),
        'password_hash': hash_password(data.password),
        'role': 'user',
        'status': 'pending',  # un administrador la aprueba antes de poder entrar
        'position': data.position or 'Colaborador',
        'area': data.area or '',
        'sucursal': (data.sucursal or '') if (data.area == 'Tienda') else 'Casa Matriz',
        'avatar_url': avatar_for(data.name),
        'phone': '',
        'created_at': now_iso(),
    }
    await db.users.insert_one(user)
    await notify_admins('usuario_pendiente', f"{data.name} pidió acceso a HERCO360: apruébalo en Usuarios",
                        related_id=user['id'], related_type='user',
                        actor_name=data.name, actor_avatar=user['avatar_url'])
    return {'message': 'Cuenta creada. Un administrador debe aprobarla antes de que puedas entrar.',
            'status': 'pending'}


@router.post('/login')
async def login(data: LoginInput):
    user = await db.users.find_one({'email': data.email.lower()})
    if not user or not verify_password(data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail='Credenciales incorrectas')
    if user['status'] == 'pending':
        raise HTTPException(status_code=403, detail='Tu cuenta aún está pendiente de aprobación')
    if user['status'] == 'rejected':
        raise HTTPException(status_code=403, detail='Tu solicitud de acceso fue rechazada')
    token = create_access_token(user['id'])
    user.pop('password_hash', None)
    user.pop('_id', None)
    return {'token': token, 'user': user}


# Antes cambiaba la contraseña de cualquiera con solo su correo. Ahora la
# restablece un administrador (Usuarios → Editar) y cada quien cambia la suya
# con la actual (/auth/change-password).
@router.post('/reset-password')
async def reset_password():
    raise HTTPException(status_code=410,
                        detail='Pide a un administrador que restablezca tu contraseña.')


@router.post('/change-password')
async def change_password(data: ChangePasswordInput, user=Depends(get_current_user)):
    doc = await db.users.find_one({'id': user['id']}, {'password_hash': 1})
    if not doc or not verify_password(data.current_password, doc['password_hash']):
        raise HTTPException(status_code=400, detail='La contraseña actual no es correcta')
    await db.users.update_one({'id': user['id']}, {'$set': {'password_hash': hash_password(data.new_password)}})
    return {'message': 'Contraseña actualizada'}


@router.get('/me')
async def me(user=Depends(get_current_user)):
    return user
