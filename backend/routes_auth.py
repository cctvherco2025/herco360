"""Auth routes: register, login, me."""
from fastapi import APIRouter, HTTPException, Depends
from core import db, hash_password, verify_password, create_access_token, new_id, now_iso, get_current_user
from models import RegisterInput, LoginInput
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
    user = {
        'id': new_id(),
        'name': data.name,
        'email': data.email.lower(),
        'password_hash': hash_password(data.password),
        'role': 'user',
        'status': 'approved',  # auto-approved: account is created with immediate access
        'position': data.position or 'Colaborador',
        'area': data.area or '',
        'sucursal': (data.sucursal or '') if (data.area == 'Tienda') else 'Casa Matriz',
        'avatar_url': avatar_for(data.name),
        'phone': '',
        'created_at': now_iso(),
    }
    await db.users.insert_one(user)
    # Inform admins that a new colleague joined (informational, no approval needed)
    await notify_admins('usuario_aprobado', f"{data.name} se unió a HERCO360",
                        related_id=user['id'], related_type='user',
                        actor_name=data.name, actor_avatar=user['avatar_url'])
    token = create_access_token(user['id'])
    user.pop('password_hash', None)
    user.pop('_id', None)
    return {'message': 'Cuenta creada correctamente', 'status': 'approved', 'token': token, 'user': user}


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


@router.get('/me')
async def me(user=Depends(get_current_user)):
    return user
