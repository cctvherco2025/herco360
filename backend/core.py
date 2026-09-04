"""Core utilities: DB connection, security (JWT + bcrypt), dependencies, serialization helpers."""
import os
import uuid
import bcrypt
import jwt
from pathlib import Path
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---- Mongo ----
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---- Security config ----
JWT_SECRET = os.environ.get('JWT_SECRET', 'herco360-super-secret-key-change-me')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_DAYS = 7

security = HTTPBearer(auto_error=True)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    payload = {
        'sub': user_id,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    """Absolute instant in UTC ISO-8601. Use for stored `created_at` timestamps."""
    return datetime.now(timezone.utc).isoformat()


# ---- Company local time ----
# Stored dates/times for agenda and the meeting room are LOCAL wall-clock
# (Honduras, UTC-6, no DST). The server runs in UTC, so anything that compares
# stored data against "now" must use these helpers instead of datetime.now().
APP_UTC_OFFSET_HOURS = float(os.environ.get('APP_UTC_OFFSET_HOURS', '-6'))
_APP_TZ = timezone(timedelta(hours=APP_UTC_OFFSET_HOURS))


def now_local() -> datetime:
    """Current company wall-clock time as a naive datetime."""
    return datetime.now(timezone.utc).astimezone(_APP_TZ).replace(tzinfo=None)


def today_local_str() -> str:
    return now_local().strftime('%Y-%m-%d')


def local_hm() -> str:
    return now_local().strftime('%H:%M')


def serialize_doc(doc):
    """Recursively make a Mongo document JSON-safe. Removes _id, converts datetimes."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        clean = {}
        for k, v in doc.items():
            if k == '_id':
                continue
            clean[k] = serialize_doc(v)
        return clean
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('sub')
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail='Token expirado')
    except Exception:
        raise HTTPException(status_code=401, detail='Token inválido')

    user = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=401, detail='Usuario no encontrado')
    if user.get('status') != 'approved':
        raise HTTPException(status_code=403, detail='Cuenta pendiente de aprobación')
    user.pop('password_hash', None)
    return user


async def require_admin(user=Depends(get_current_user)):
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Se requieren permisos de administrador')
    return user


USER_PUBLIC_FIELDS = {'_id': 0, 'password_hash': 0}

# ---- Inventory module access control ----
# Allowed: Tienda staff, store managers, Jefe ECCP, Operación manager, Director comercial, admins.
# Per-user overrides (user['module_access']) can grant/revoke access manually.
GATED_MODULES = ('inventario', 'reportes', 'cams', 'formulario', 'rutina')


def _module_override(user, module):
    """Return True/False if a manual override exists for this module, else None."""
    return (user.get('module_access') or {}).get(module)


def can_access_inventory(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'inventario')
    if ov is not None:
        return bool(ov)
    area = (user.get('area') or '').strip()
    if area == 'Tienda':
        return True
    if cargo == 'Jefe' and area == 'ECCP':
        return True
    if cargo == 'Gerente' and area in ('Operación Tienda', 'Tienda'):
        return True
    return False


async def require_inventory_access(user=Depends(get_current_user)):
    if not can_access_inventory(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Inventario')
    return user


# ---- Reports module access control ----
# The Reports module belongs to ECCP (owners) who deliver reports to Tienda.
# Access is limited to ECCP, Tienda and admins. Per-user overrides apply.
def can_access_reports(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'reportes')
    if ov is not None:
        return bool(ov)
    area = (user.get('area') or '').strip()
    return area in ('ECCP', 'Tienda')


async def require_access_manager(user=Depends(get_current_user)):
    """Only Admins and the Director comercial may grant/revoke module access."""
    if user.get('role') == 'admin' or (user.get('position') or '').strip() == 'Director comercial':
        return user
    raise HTTPException(status_code=403, detail='No tienes permiso para gestionar accesos')


async def require_reports_access(user=Depends(get_current_user)):
    if not can_access_reports(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Reportes')
    return user


# ---- Reportes CAMS module access control ----
# Base access: admins and Director comercial. Anyone else needs a manual override.
def can_access_cams(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'cams')
    if ov is not None:
        return bool(ov)
    return False


async def require_cams_access(user=Depends(get_current_user)):
    if not can_access_cams(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Reportes CAMS')
    return user


# ---- Formulario (auditorías FLOS) module access control ----
# Base access: admins, Director comercial y Gerentes. Per-user overrides apply.
def can_access_formulario(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'formulario')
    if ov is not None:
        return bool(ov)
    return cargo == 'Gerente'


async def require_formulario_access(user=Depends(get_current_user)):
    if not can_access_formulario(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo Formulario')
    return user


# ---- Rutina Operativa (evaluación mensual de Gerentes) access control ----
# Ven el historial: admins, Director comercial, Gerentes (quienes la llenan) y
# el Jefe de Operación Tienda (supervisa la operación de todas las tiendas).
# Per-user overrides apply on top of that baseline.
def can_access_rutina(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'rutina')
    if ov is not None:
        return bool(ov)
    if cargo == 'Gerente':
        return True
    area = (user.get('area') or '').strip()
    if cargo == 'Jefe' and area == 'Operación Tienda':
        return True
    return False


async def require_rutina_access(user=Depends(get_current_user)):
    if not can_access_rutina(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Rutina Operativa')
    return user


def can_fill_rutina(user) -> bool:
    """Solo quienes efectivamente llenan la rutina cada mes: Gerentes, y
    admins/Director comercial para soporte. El Jefe de Operación puede
    consultarla (can_access_rutina) pero no crear evaluaciones."""
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    return cargo in ('Director comercial', 'Gerente')
