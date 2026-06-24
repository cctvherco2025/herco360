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
    return datetime.now(timezone.utc).isoformat()


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
