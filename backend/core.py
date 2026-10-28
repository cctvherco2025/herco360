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


def _iso_utc(dt: datetime) -> str:
    """ISO-8601 UTC con milisegundos y sufijo 'Z'.

    `datetime.isoformat()` emite microsegundos (6 dígitos) y offset '+00:00';
    Safari / iOS / WebViews viejos no parsean eso y devuelven Invalid Date (se
    veía como "Hace NaN min" y, si algo hacía toISOString()/Intl encima, la
    pantalla quedaba en blanco). Milisegundos + 'Z' lo parsea cualquier
    navegador."""
    return dt.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def now_iso() -> str:
    """Absolute instant in UTC ISO-8601. Use for stored `created_at` timestamps."""
    return _iso_utc(datetime.now(timezone.utc))


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
        return _iso_utc(doc) if doc.tzinfo else doc.isoformat()
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

# ---- Departamentos ----
# La app la usan departamentos con operaciones distintas y totalmente
# separados: cada uno ve solo a su gente y sus datos (agenda, vacaciones,
# tareas, activos, formularios). La estructura (departamentos, áreas en árbol
# y cargos con nivel de mando) vive en la base: ver organizacion.py.
# Los usuarios y datos sin el campo son de Ventas Retail (los de siempre).
#
# Roles: el super admin (role admin + super_admin) ve y administra todo y
# crea departamentos; un admin administra solo su departamento.
RETAIL = 'Ventas Retail'
LOGISTICA = 'Logística'
GERENTE_LOGISTICA = 'Gerente de Logística'
# Jefe de departamento por nombre de cargo: solo para usuarios que todavía no
# tienen `nivel` (antes de la migración de organizacion.asegurar).
JEFES_DEPTO = {'Director comercial': RETAIL, GERENTE_LOGISTICA: LOGISTICA}


def departamento_de(user) -> str:
    return (user or {}).get('departamento') or RETAIL


def es_retail(user) -> bool:
    return departamento_de(user) == RETAIL


def es_super_admin(user) -> bool:
    u = user or {}
    return u.get('role') == 'admin' and bool(u.get('super_admin'))


def es_jefe_depto(user) -> bool:
    """El jefe del departamento (nivel jefe_depto): Director comercial en
    Retail, Gerente de Logística en Logística, el que se defina en otros."""
    u = user or {}
    if u.get('nivel'):
        return u['nivel'] == 'jefe_depto'
    return JEFES_DEPTO.get((u.get('position') or '').strip()) == departamento_de(u)


def filtro_departamento(depto: str, campo='departamento') -> dict:
    """Filtro de Mongo de un departamento. Lo de Retail no siempre tiene el
    campo (datos de antes): se incluye lo que no lo tiene."""
    return {campo: {'$in': [None, RETAIL]}} if depto == RETAIL else {campo: depto}


def filtro_depto(user, campo='departamento') -> dict:
    """Lo del departamento de `user` (vacío para el super admin, que ve todo)."""
    if es_super_admin(user):
        return {}
    return filtro_departamento(departamento_de(user), campo)


def mismo_depto(a, b) -> bool:
    return departamento_de(a) == departamento_de(b)


def filtro_usuarios_depto(depto: str) -> dict:
    """Filtro de usuarios de un departamento (para avisos y validaciones)."""
    return filtro_departamento(depto)


def ve_depto(user, depto) -> bool:
    """¿Puede ver lo de ese departamento? (el suyo; el super admin, todos)."""
    return es_super_admin(user) or departamento_de(user) == (depto or RETAIL)


async def require_retail(user=Depends(get_current_user)):
    """Módulos de Ventas Retail sin permiso propio (p. ej. Sala de Juntas)."""
    if not es_super_admin(user) and not es_retail(user):
        raise HTTPException(status_code=403, detail='Este módulo es de Ventas Retail')
    return user


def solo_retail(fn):
    """Módulos de Ventas Retail (tiendas, ECCP, promociones…): los demás
    departamentos no los ven aunque tengan un permiso manual o sean admins de
    su departamento; el super admin sí."""
    def envuelta(user, *args, **kwargs):
        if user and not es_super_admin(user) and not es_retail(user):
            return False
        return fn(user, *args, **kwargs)
    envuelta.__name__ = fn.__name__
    envuelta.__doc__ = fn.__doc__
    return envuelta


# ---- Acceso a los módulos ----
# Qué puede hacer cada persona lo deciden los perfiles (acceso.py): el perfil
# de su cargo y área con sus excepciones, o el acceso total fijo de los admins
# y del jefe del departamento. Estas funciones solo preguntan; sobre qué (su
# tienda, su área, su gente) lo sigue decidiendo cada módulo. Las reglas de
# antes quedaron en acceso_legacy.py para comparar.
def _puede(user, permiso: str) -> bool:
    import acceso  # evita la importación circular
    return bool(user) and acceso.tiene(user, permiso)


def puede_modulo(user, *modulos) -> bool:
    """¿Tiene alguno de estos módulos? (manda el interruptor de su perfil)"""
    return any(_puede(user, m) for m in modulos)


def require_modulo(*modulos):
    """Dependencia de las rutas de un módulo: sin el módulo encendido no entra,
    aunque sea responsable de algo o tenga cosas asignadas en él."""
    async def dependencia(user=Depends(get_current_user)):
        if not puede_modulo(user, *modulos):
            import acceso
            nombre = next((n for _, m, n, _, _ in acceso.MODULOS if m == modulos[0]), modulos[0])
            raise HTTPException(status_code=403, detail=f'No tienes acceso a {nombre}')
        return user
    return dependencia


def can_access_inventory(user) -> bool:
    return _puede(user, 'inventario')


async def require_inventory_access(user=Depends(get_current_user)):
    if not can_access_inventory(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Inventario')
    return user


def can_access_reports(user) -> bool:
    return _puede(user, 'reportes')


def can_access_vacaciones(user) -> bool:
    return _puede(user, 'vacaciones')


async def require_vacaciones_access(user=Depends(get_current_user)):
    if not can_access_vacaciones(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Vacaciones')
    return user


async def require_access_manager(user=Depends(get_current_user)):
    """Dan y quitan accesos: los admins (a todos) y el jefe de cada
    departamento (Director comercial / Gerente de Logística), solo a su gente."""
    if user.get('role') == 'admin' or es_jefe_depto(user):
        return user
    raise HTTPException(status_code=403, detail='No tienes permiso para gestionar accesos')


async def require_reports_access(user=Depends(get_current_user)):
    if not can_access_reports(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Reportes')
    return user


def can_access_cams(user) -> bool:
    return _puede(user, 'cams')


async def require_cams_access(user=Depends(get_current_user)):
    if not can_access_cams(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo de Reportes CAMS')
    return user


def can_access_formulario(user) -> bool:
    return _puede(user, 'flos')


async def require_formulario_access(user=Depends(get_current_user)):
    if not can_access_formulario(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo Formulario')
    return user


def can_edit_flos_schema(user) -> bool:
    return _puede(user, 'flos.esquema')


async def require_flos_schema_editor(user=Depends(get_current_user)):
    if not can_edit_flos_schema(user):
        raise HTTPException(status_code=403, detail='No tienes permiso para editar el esquema de la auditoría FLOS')
    return user


def can_access_rutina(user) -> bool:
    return _puede(user, 'rutina')


async def require_rutina_access(user=Depends(get_current_user)):
    if not can_access_rutina(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Rutina Operativa')
    return user


def can_edit_rutina_schema(user) -> bool:
    return _puede(user, 'rutina.esquema')


async def require_rutina_schema_editor(user=Depends(get_current_user)):
    if not can_edit_rutina_schema(user):
        raise HTTPException(status_code=403, detail='No tienes permiso para editar el esquema de Rutina Operativa')
    return user


# Cargos que solo asigna un admin desde Usuarios: dan permisos sobre una tienda
# (el jefe de tienda revisa Promociones del mes de su sucursal), así que nadie
# se los pone solo al registrarse ni desde "Mi perfil".
JEFE_TIENDA = 'Jefe de tienda'
# Cargos de mando: solo un administrador los asigna (no se eligen al
# registrarse; nadie cambia su propio cargo, área ni tienda).
CARGOS_SOLO_ADMIN = {JEFE_TIENDA, 'Jefe', 'Gerente', 'Director comercial', GERENTE_LOGISTICA}

# Promociones del mes: tiendas que participan, por la sucursal del perfil.
# Por ahora solo Herco Max y Herco Centro (las que tienen coordinadores y jefe).
PROMO_TIENDAS = {'H1': 'Herco Max', 'H2': 'Herco Centro', 'H6': 'Herco JT'}


def tienda_promos(user) -> str:
    """Tienda de Promociones de la persona según su sucursal ('' si no participa)."""
    return PROMO_TIENDAS.get(((user or {}).get('sucursal') or '').strip(), '')


def es_jefe_tienda(user) -> bool:
    return ((user or {}).get('position') or '').strip() == JEFE_TIENDA and bool(tienda_promos(user))


def es_gerente_tienda(user) -> bool:
    u = user or {}
    return ((u.get('position') or '').strip() == 'Gerente' and (u.get('area') or '').strip() == 'Tienda'
            and bool(tienda_promos(u)))


def es_revisor_tienda(user) -> bool:
    """Revisa Promociones del mes de su tienda: jefe o gerente de tienda."""
    return es_jefe_tienda(user) or es_gerente_tienda(user)


def es_coordinador_tienda(user) -> bool:
    """Contesta Promociones del mes: Coordinador del área Tienda de una tienda
    que participa. Los coordinadores de otros departamentos no."""
    u = user or {}
    return ((u.get('position') or '').strip() == 'Coordinador' and (u.get('area') or '').strip() == 'Tienda'
            and bool(tienda_promos(u)))


def can_admin_promos(user) -> bool:
    """"Administrar Promociones del mes": ver y administrar TODAS las
    publicaciones como si fueran propias (abrirlas aunque no esté en la
    audiencia, ver todas las respuestas, historial y resultados, editar,
    eliminar)."""
    return _puede(user, 'promos.admin')


def can_manage_promos(user) -> bool:
    """Crear y publicar "Promociones del mes"."""
    return _puede(user, 'promos.publicar')


def can_access_formularios_principal(user) -> bool:
    """Pantalla /formularios (Hub) y su listado de formularios personalizados."""
    return _puede(user, 'formularios')


async def require_formularios_principal_access(user=Depends(get_current_user)):
    if not can_access_formularios_principal(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo Formularios')
    return user


def can_access_promociones_mes(user) -> bool:
    return _puede(user, 'promos')


async def require_promociones_mes_access(user=Depends(get_current_user)):
    if not can_access_promociones_mes(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Promociones del mes')
    return user


async def require_promo_access(user=Depends(get_current_user)):
    if not (can_access_promociones_mes(user) and can_manage_promos(user)):
        raise HTTPException(status_code=403, detail='No tienes permiso para administrar Promociones del mes')
    return user


def can_create_custom_formulario(user) -> bool:
    """Botón "Haz tu form personalizado"."""
    return _puede(user, 'formularios.crear')


def can_fill_rutina(user) -> bool:
    """Llenar la rutina del mes (la consultan más personas: can_access_rutina)."""
    return _puede(user, 'rutina.llenar')


# ---- Revisión de Guardias, Recorridos Preventivos y Auditoría de Etiquetas (ECCP) ----
# Registran quienes tienen el permiso (Coordinador y Jefe de ECCP); los
# administran (ven, editan y eliminan todo) los admins y el Director comercial.
def can_fill_guardias(user) -> bool:
    return _puede(user, 'guardias.registrar')


@solo_retail
def can_admin_guardias(user) -> bool:
    if not user:
        return False
    return user.get('role') == 'admin' or (user.get('position') or '').strip() == 'Director comercial'


def can_access_guardias(user) -> bool:
    return _puede(user, 'guardias')


async def require_guardias_access(user=Depends(get_current_user)):
    if not can_access_guardias(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Revisión de Guardias')
    return user


async def require_guardias_fill(user=Depends(get_current_user)):
    if not can_fill_guardias(user):
        raise HTTPException(status_code=403, detail='Solo los coordinadores ECCP pueden registrar evaluaciones de guardias')
    return user


async def require_guardias_admin(user=Depends(get_current_user)):
    if not can_admin_guardias(user):
        raise HTTPException(status_code=403, detail='Solo un administrador puede editar o eliminar evaluaciones de guardias')
    return user


def can_fill_recorridos(user) -> bool:
    return _puede(user, 'recorridos.registrar')


def can_admin_recorridos(user) -> bool:
    return can_admin_guardias(user)


def can_access_recorridos(user) -> bool:
    return _puede(user, 'recorridos')


async def require_recorridos_access(user=Depends(get_current_user)):
    if not can_access_recorridos(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Recorridos Preventivos')
    return user


async def require_recorridos_fill(user=Depends(get_current_user)):
    if not can_fill_recorridos(user):
        raise HTTPException(status_code=403, detail='Solo los coordinadores ECCP pueden registrar recorridos')
    return user


async def require_recorridos_admin(user=Depends(get_current_user)):
    if not can_admin_recorridos(user):
        raise HTTPException(status_code=403, detail='Solo un administrador puede hacer esta acción en Recorridos Preventivos')
    return user


def can_fill_etiquetas(user) -> bool:
    return _puede(user, 'etiquetas.registrar')


def can_admin_etiquetas(user) -> bool:
    return can_admin_guardias(user)


def sucursal_gerente_tienda(user) -> str:
    """La tienda del gerente de tienda (Gerente del área Tienda de Retail),
    o '' si no lo es."""
    u = user or {}
    if not es_retail(u) or (u.get('position') or '').strip() != 'Gerente' or (u.get('area') or '').strip() != 'Tienda':
        return ''
    suc = (u.get('sucursal') or '').strip()
    return '' if suc in ('', 'Casa Matriz') else suc


def can_ver_todas_etiquetas(user) -> bool:
    """Ver las auditorías de etiquetas de todas las tiendas."""
    return _puede(user, 'etiquetas.todas')


SIN_TIENDA = '—'  # no coincide con ninguna sucursal


def etiquetas_solo_su_tienda(user) -> str:
    """'' si ve las auditorías de todas las tiendas; si no, la única tienda
    que ve (el gerente de tienda, la suya; quien no tiene tienda, ninguna)."""
    if can_ver_todas_etiquetas(user):
        return ''
    return sucursal_gerente_tienda(user) or SIN_TIENDA


def can_access_etiquetas(user) -> bool:
    return _puede(user, 'etiquetas')


async def require_etiquetas_access(user=Depends(get_current_user)):
    if not can_access_etiquetas(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Auditoría de Etiquetas')
    return user


async def require_etiquetas_fill(user=Depends(get_current_user)):
    if not can_fill_etiquetas(user):
        raise HTTPException(status_code=403, detail='Solo los coordinadores ECCP pueden registrar auditorías de etiquetas')
    return user


async def require_etiquetas_admin(user=Depends(get_current_user)):
    if not can_admin_etiquetas(user):
        raise HTTPException(status_code=403, detail='Solo un administrador puede hacer esta acción en Auditoría de Etiquetas')
    return user


# ---- Activos (de cualquier categoría: CCTV, herramientas, vehículos…) ----
# Administrar (crear categorías y manejar todos los activos de SU departamento):
# quien tiene el permiso. Cada categoría tiene además sus responsables, que
# registran y editan solo sus activos; eso se valida en routes_activos.py.
def can_admin_activos(user) -> bool:
    return _puede(user, 'activos.administrar')


async def require_activos_admin(user=Depends(get_current_user)):
    if not can_admin_activos(user):
        raise HTTPException(status_code=403, detail='Solo quien administra Activos puede hacer esta acción')
    return user
