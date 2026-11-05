"""Promociones del mes: revisores por categoría.

Además del jefe y el gerente de cada tienda, algunas categorías las revisa
otra persona por tienda (p. ej. Pinturas y Revestimiento: el Jefe de Negocios
de esa tienda). Lo configuran los admins de Promociones desde la pantalla.

Reglas guardadas en db.config {_id: 'promo_revisores_categoria', reglas: [...]}:
  {'id', 'categorias': ['Pinturas', 'Revestimiento'],
   'por_tienda': {'Herco Max': {'id', 'name'}, ...}}
La categoría se reconoce por su nombre, sin importar mayúsculas ni tildes.

En esas categorías:
  - la persona revisa junto con el jefe y el gerente de la tienda;
  - si se abre un seguimiento, lo valida esa persona (ya no el jefe ni el
    gerente, que lo siguen viendo).

Las reglas se tienen en memoria (el servidor corre en un solo proceso) para
que las comprobaciones de permisos sigan siendo síncronas; `cargar()` las
refresca de la base cada minuto como máximo y al guardarlas.
"""
import time
import unicodedata

from core import db, PROMO_TIENDAS, new_id, now_iso

_ID = 'promo_revisores_categoria'
_cache = {'reglas': [], 'at': 0.0}
REFRESCO_S = 60


def norm(s) -> str:
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode()
    return ' '.join(s.lower().split())


async def cargar(forzar: bool = False) -> list:
    if forzar or time.time() - _cache['at'] > REFRESCO_S:
        doc = await db.config.find_one({'_id': _ID}, {'_id': 0}) or {}
        _cache['reglas'] = doc.get('reglas') or []
        _cache['at'] = time.time()
    return _cache['reglas']


def reglas() -> list:
    return _cache['reglas']


def extras(tienda: str, categoria: str) -> list:
    """Quienes revisan esa categoría de esa tienda además del jefe y el gerente: [{'id', 'name'}]."""
    c = norm(categoria)
    out = []
    for r in reglas():
        if c in {norm(x) for x in r.get('categorias') or []}:
            p = (r.get('por_tienda') or {}).get(tienda)
            if p and p.get('id') and all(o['id'] != p['id'] for o in out):
                out.append({'id': p['id'], 'name': p.get('name')})
    return out


def extras_ids(tienda: str, categoria: str) -> list:
    return [p['id'] for p in extras(tienda, categoria)]


def revisa(user: dict, tienda: str, categoria: str) -> bool:
    return bool(user) and user.get('id') in extras_ids(tienda, categoria)


def pares_de(user: dict) -> list:
    """[(tienda, categoria_normalizada)] que la persona revisa por estas reglas."""
    uid = (user or {}).get('id')
    out = []
    for r in reglas():
        for tienda, p in (r.get('por_tienda') or {}).items():
            if p and p.get('id') == uid:
                out += [(tienda, norm(c)) for c in r.get('categorias') or []]
    return out


def le_toca(user: dict, tienda: str, categoria: str) -> bool:
    return (tienda, norm(categoria)) in pares_de(user)


async def guardar(reglas_in: list, user: dict) -> list:
    """Valida y guarda las reglas. Cada persona debe existir y estar aprobada."""
    tiendas = set(PROMO_TIENDAS.values())
    limpias = []
    ids = {p.get('id') for r in reglas_in for p in (r.get('por_tienda') or {}).values() if p and p.get('id')}
    users = {u['id']: u for u in await db.users.find({'id': {'$in': list(ids)}, 'status': 'approved'},
                                                    {'_id': 0, 'id': 1, 'name': 1}).to_list(500)}
    for r in reglas_in:
        cats, vistas = [], set()
        for c in r.get('categorias') or []:
            c = ' '.join(str(c or '').split())[:60]
            if c and norm(c) not in vistas:
                cats.append(c)
                vistas.add(norm(c))
        por = {}
        for tienda, p in (r.get('por_tienda') or {}).items():
            if tienda in tiendas and p and p.get('id') in users:
                por[tienda] = {'id': p['id'], 'name': users[p['id']]['name']}
        if cats and por:
            limpias.append({'id': r.get('id') or new_id(), 'categorias': cats, 'por_tienda': por})
    await db.config.update_one({'_id': _ID}, {'$set': {'reglas': limpias, 'updated_by': user.get('name'),
                                                        'updated_at': now_iso()}}, upsert=True)
    await cargar(forzar=True)
    return limpias


def resumen_de(user: dict) -> list:
    """Para la pantalla: [{'tienda', 'categorias': [...]}] que la persona revisa por estas reglas."""
    out = {}
    for r in reglas():
        for tienda, p in (r.get('por_tienda') or {}).items():
            if p and p.get('id') == (user or {}).get('id'):
                out.setdefault(tienda, [])
                out[tienda] += [c for c in r.get('categorias') or [] if c not in out[tienda]]
    return [{'tienda': t, 'categorias': cs} for t, cs in out.items()]
