"""Reglas de acceso de antes de los perfiles (copia congelada de core.py).

Solo se usan para comparar: el simulacro y la migración de acceso.py
calculan con estas reglas lo que cada persona puede hoy y lo comparan con lo
que le da su perfil. No las uses en rutas: el acceso real lo decide
acceso.py. Se borran cuando ya no haga falta volver atrás.
"""
from fastapi import Depends, HTTPException

from core import get_current_user, es_retail, es_super_admin, es_jefe_depto, GERENTE_LOGISTICA


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


# ---- Inventory module access control ----
# Allowed: Tienda staff, store managers, Jefe ECCP, Operación manager, Director comercial, admins.
# Per-user overrides (user['module_access']) can grant/revoke access manually.
GATED_MODULES = (
    'inventario', 'reportes', 'cams', 'formulario', 'rutina',
    'formularios_principal', 'promociones_mes', 'formularios_custom',
    'rutina_schema', 'formulario_schema', 'vacaciones', 'promociones_admin',
    'guardias', 'recorridos', 'etiquetas', 'activos', 'etiquetas_ver',
)


def _module_override(user, module):
    """Return True/False if a manual override exists for this module, else None."""
    return (user.get('module_access') or {}).get(module)


@solo_retail
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
@solo_retail
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


# ---- Vacaciones ----
# Históricamente abierto a cualquier usuario logueado, y sigue así por defecto.
# Se puede quitar por usuario (override manual en module_access.vacaciones).
def can_access_vacaciones(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    if (user.get('position') or '').strip() == 'Director comercial':
        return True
    ov = _module_override(user, 'vacaciones')
    if ov is not None:
        return bool(ov)
    return True


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


# ---- Reportes CAMS module access control ----
# Base access: admins and Director comercial. Anyone else needs a manual override.
@solo_retail
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
@solo_retail
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


# Editar el esquema (criterios/puntajes/acciones) de la auditoría FLOS:
# permiso independiente y asignable — admin/Director comercial siempre True,
# cualquier otro usuario solo por override manual desde Organigrama (default
# False; no se infiere de can_access_formulario).
@solo_retail
def can_edit_flos_schema(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    return bool(_module_override(user, 'formulario_schema'))


async def require_flos_schema_editor(user=Depends(get_current_user)):
    if not can_edit_flos_schema(user):
        raise HTTPException(status_code=403, detail='No tienes permiso para editar el esquema de la auditoría FLOS')
    return user


# ---- Rutina Operativa (evaluación mensual de Gerentes) access control ----
# Ven el historial: admins, Director comercial, Gerentes (quienes la llenan) y
# el Jefe de Operación Tienda (supervisa la operación de todas las tiendas).
# Per-user overrides apply on top of that baseline.
@solo_retail
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


# Editar el esquema (preguntas/opciones/puntajes) de Rutina Operativa: permiso
# independiente y asignable — admin/Director comercial siempre True, para
# cualquier otro usuario solo por override manual desde Organigrama (default
# False; no se infiere de can_access_rutina).
@solo_retail
def can_edit_rutina_schema(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    return bool(_module_override(user, 'rutina_schema'))


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


@solo_retail
def can_admin_promos(user) -> bool:
    """"Administrar Promociones del mes": ver y administrar TODAS las
    publicaciones de Promociones como si fueran propias (abrirlas aunque no
    esté en la audiencia, ver todas las respuestas/historial/resultados,
    editar, eliminar). No viene por rol: se otorga por usuario
    (module_access.promociones_admin). Admin y Director comercial ya lo tienen."""
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    if (user.get('position') or '').strip() == 'Director comercial':
        return True
    return bool(_module_override(user, 'promociones_admin'))


def can_manage_promos(user) -> bool:
    """Quién puede crear/publicar "Promociones del mes": admins, Director
    comercial y Gerentes — el mismo grupo que ya define can_access_formulario."""
    return can_access_formulario(user)


# ---- Formularios: permisos independientes del menú padre "Formulario" ----
# formularios.principal -> pantalla /formularios (Hub) y su listado de
# formularios personalizados. formularios.promocionesMes -> tarjeta/pantalla
# "Promociones del mes". formularios.crearPersonalizado -> botón "Haz tu form
# personalizado". Los tres tienen override manual con prioridad absoluta sobre
# cualquier default de rol (se consulta primero; si existe, ni se evalúa el
# default) — así un admin puede otorgar o revocar cada uno sin que un cambio
# de rol futuro lo reactive/desactive solo.
#
# formularios.principal es el único con default "heredado": si nunca se ha
# tocado el override, arranca habilitado para quien por rol ya tiene FLOS o
# Rutina Operativa (para que un Gerente nuevo no dependa de que un admin le
# active el Hub a mano). formularios.crearPersonalizado NO hereda de nada —
# es una capacidad extra que un admin debe habilitar expresamente.
def can_access_formularios_principal(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'formularios_principal')
    if ov is not None:
        return bool(ov)
    if not es_retail(user):
        return True  # otros departamentos: sus formularios personalizados (los de tienda no aplican)
    return (can_access_formulario(user) or can_access_rutina(user) or can_access_guardias(user)
            or can_access_recorridos(user) or can_access_etiquetas(user))


async def require_formularios_principal_access(user=Depends(get_current_user)):
    if not can_access_formularios_principal(user):
        raise HTTPException(status_code=403, detail='No tienes acceso al módulo Formularios')
    return user


@solo_retail
def can_access_promociones_mes(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    if cargo == 'Director comercial':
        return True
    ov = _module_override(user, 'promociones_mes')
    if ov is not None:
        return bool(ov)
    return True  # históricamente visible para cualquier usuario logueado


async def require_promociones_mes_access(user=Depends(get_current_user)):
    if not can_access_promociones_mes(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a Promociones del mes')
    return user


async def require_promo_access(user=Depends(get_current_user)):
    if not (can_access_promociones_mes(user) and can_manage_promos(user)):
        raise HTTPException(status_code=403, detail='No tienes permiso para administrar Promociones del mes')
    return user


def can_create_custom_formulario(user) -> bool:
    """formularios.crearPersonalizado — botón "Haz tu form personalizado".
    Permiso independiente: no se infiere de FLOS/Rutina, solo override
    manual (admin y el jefe de cada departamento exceptuados)."""
    if not user:
        return False
    if user.get('role') == 'admin' or es_jefe_depto(user):
        return True
    return bool(_module_override(user, 'formularios_custom'))


@solo_retail
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


# ---- Revisión de Guardias (ECCP) ----
# Registrar: Coordinador y Jefe del área ECCP por defecto; se puede dar o
# quitar por usuario desde Organigrama (module_access.guardias). Admin y
# Director comercial NO registran por el solo hecho de serlo (solo si además
# son Coordinador/Jefe ECCP), pero ven, editan y eliminan todo.
@solo_retail
def can_fill_guardias(user) -> bool:
    if not user:
        return False
    ov = _module_override(user, 'guardias')
    if ov is not None:
        return bool(ov)
    cargo = (user.get('position') or '').strip()
    area = (user.get('area') or '').strip()
    return area == 'ECCP' and cargo in ('Coordinador', 'Jefe')


@solo_retail
def can_admin_guardias(user) -> bool:
    if not user:
        return False
    return user.get('role') == 'admin' or (user.get('position') or '').strip() == 'Director comercial'


def can_access_guardias(user) -> bool:
    return can_fill_guardias(user) or can_admin_guardias(user)


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


# ---- Recorridos Preventivos en Tienda (ECCP) ----
# Mismo esquema que Revisión de Guardias, con su propio permiso asignable
# ('recorridos'): registra Coordinador/Jefe ECCP; administra admin/Director.
@solo_retail
def can_fill_recorridos(user) -> bool:
    if not user:
        return False
    ov = _module_override(user, 'recorridos')
    if ov is not None:
        return bool(ov)
    cargo = (user.get('position') or '').strip()
    area = (user.get('area') or '').strip()
    return area == 'ECCP' and cargo in ('Coordinador', 'Jefe')


def can_admin_recorridos(user) -> bool:
    return can_admin_guardias(user)


def can_access_recorridos(user) -> bool:
    return can_fill_recorridos(user) or can_admin_recorridos(user)


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


# ---- Auditoría de Etiquetas de Precios (ECCP) ----
# Mismo esquema que Guardias/Recorridos con su propio permiso ('etiquetas').
@solo_retail
def can_fill_etiquetas(user) -> bool:
    if not user:
        return False
    ov = _module_override(user, 'etiquetas')
    if ov is not None:
        return bool(ov)
    cargo = (user.get('position') or '').strip()
    area = (user.get('area') or '').strip()
    return area == 'ECCP' and cargo in ('Coordinador', 'Jefe')


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


@solo_retail
def can_ver_todas_etiquetas(user) -> bool:
    """Ver (solo lectura) las auditorías de etiquetas de todas las tiendas:
    permiso por persona desde Jerarquía (module_access.etiquetas_ver), p. ej.
    para un gerente de Operación Tienda."""
    return bool(user) and bool(_module_override(user, 'etiquetas_ver'))


def etiquetas_solo_su_tienda(user) -> str:
    """Si la persona ve Auditoría de Etiquetas solo por ser gerente de una
    tienda: esa tienda (en solo lectura). '' si ve todas (registra,
    administra o tiene el permiso de ver todas)."""
    if can_fill_etiquetas(user) or can_admin_etiquetas(user) or can_ver_todas_etiquetas(user):
        return ''
    return sucursal_gerente_tienda(user)


def can_access_etiquetas(user) -> bool:
    """Registran (ECCP) y administran: todas. Con el permiso "ver todas":
    todas, en solo lectura. Los gerentes de tienda: las de su tienda, en solo
    lectura."""
    return (can_fill_etiquetas(user) or can_admin_etiquetas(user) or can_ver_todas_etiquetas(user)
            or bool(sucursal_gerente_tienda(user)))


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
# admin, el jefe del departamento (Director comercial / Gerente de Logística) o
# el permiso asignable 'activos' (Organigrama). Cada categoría
# tiene además sus responsables, que registran y editan solo sus activos;
# eso se valida en routes_activos.py contra la base.
def can_admin_activos(user) -> bool:
    if not user:
        return False
    if user.get('role') == 'admin' or es_jefe_depto(user):
        return True
    return bool(_module_override(user, 'activos'))


async def require_activos_admin(user=Depends(get_current_user)):
    if not can_admin_activos(user):
        raise HTTPException(status_code=403, detail='Solo quien administra Activos puede hacer esta acción')
    return user


def tiene_tarea(user, accion: str) -> bool:
    """permisos.tiene de antes: los admins todo; los demás, lo calculado en users.permisos."""
    u = user or {}
    return u.get('role') == 'admin' or accion in (u.get('permisos') or [])


def acceso_de_antes(u) -> tuple:
    """Lo que la persona puede con estas reglas, con los nombres del catálogo
    de acceso.py. Devuelve (permisos, permisos de adentro que hoy tiene sin
    su módulo y por eso no usa)."""
    import acceso
    disponible = es_super_admin(u) or es_retail(u)
    v = {k: disponible or k not in acceso.SOLO_RETAIL for k in acceso.SIN_CANDADO}
    v.update({
        'vacaciones': can_access_vacaciones(u),
        'reportes': can_access_reports(u),
        'cams': can_access_cams(u),
        'inventario': can_access_inventory(u),
        'flos': can_access_formulario(u),
        'flos.esquema': can_edit_flos_schema(u),
        'rutina': can_access_rutina(u),
        'rutina.llenar': can_fill_rutina(u),
        'rutina.esquema': can_edit_rutina_schema(u),
        'guardias': can_access_guardias(u),
        'guardias.registrar': can_fill_guardias(u),
        'recorridos': can_access_recorridos(u),
        'recorridos.registrar': can_fill_recorridos(u),
        'etiquetas': can_access_etiquetas(u),
        'etiquetas.registrar': can_fill_etiquetas(u),
        'etiquetas.todas': can_access_etiquetas(u) and etiquetas_solo_su_tienda(u) == '',
        'promos': can_access_promociones_mes(u),
        'promos.publicar': can_manage_promos(u),
        'promos.admin': can_admin_promos(u),
        'formularios': can_access_formularios_principal(u),
        'formularios.crear': can_create_custom_formulario(u),
        'activos.administrar': can_admin_activos(u),
    })
    for k, m in acceso.MODULO_DE.items():
        if m == 'tareas':
            v[k] = tiene_tarea(u, k)
    sueltos = []
    for k, m in acceso.MODULO_DE.items():  # lo de adentro solo sirve con el módulo
        if v.get(k) and not v.get(m):
            sueltos.append(k)
        v[k] = bool(v.get(k)) and bool(v.get(m))
    return {k for k, x in v.items() if x}, sueltos
