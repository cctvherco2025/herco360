"""Quién puede qué en un formulario del constructor (formato 2).

Siempre pueden todo quien lo creó y los admins de su departamento (y el super
admin). A los demás se les da por acción en la pestaña Permisos: cada acción
guarda un criterio (cargos, áreas, sucursales, personas) y, ya resuelto en ids,
`permisos_resueltos` (formularios_asignaciones.py lo mantiene al día).

Llenar no es un permiso de aquí: lo da la pestaña Asignaciones
(`audiencia_resueltos`). Revisar lo da Supervisión. Crear formularios sigue en
Perfiles (formularios.crear). Sin dependencias de las rutas, para que
routes_formularios_custom.py y formularios_v2.py lo puedan usar los dos.
"""
from core import RETAIL, departamento_de, es_jefe_depto, es_super_admin

ACCIONES = ('resultados', 'exportar', 'modificar', 'editar', 'publicar', 'asignar', 'eliminar')


def depto_form(form: dict) -> str:
    return (form or {}).get('departamento') or RETAIL


def mismo_depto(user: dict, form: dict) -> bool:
    return es_super_admin(user) or departamento_de(user) == depto_form(form)


def gestiona(user: dict, form: dict) -> bool:
    """Quien lo creó o un admin de su departamento: puede todo, también dar permisos."""
    return form.get('creator_id') == user.get('id') or (user.get('role') == 'admin' and mismo_depto(user, form))


def puede(user: dict, form: dict, accion: str) -> bool:
    if gestiona(user, form):
        return True
    if not mismo_depto(user, form):
        return False
    # el Director comercial sigue viendo los resultados de su departamento, como en todo
    if accion == 'resultados' and es_jefe_depto(user):
        return True
    return user.get('id') in ((form.get('permisos_resueltos') or {}).get(accion) or [])


def puede_llenar(user: dict, form: dict) -> bool:
    if gestiona(user, form) or es_super_admin(user):
        return True
    return form.get('estado') == 'publicado' and mismo_depto(user, form) and user.get('id') in (form.get('audiencia_resueltos') or [])


def mis_permisos(user: dict, form: dict) -> dict:
    return {**{a: puede(user, form, a) for a in ACCIONES}, 'permisos': gestiona(user, form)}


def entra_al_constructor(user: dict, form: dict) -> bool:
    return any(puede(user, form, a) for a in ('editar', 'publicar', 'asignar'))


def ve_formulario(user: dict, form: dict) -> bool:
    """Le toca llenarlo o tiene alguna acción sobre él."""
    return puede_llenar(user, form) or any(puede(user, form, a) for a in ACCIONES)
