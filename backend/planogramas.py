"""Planogramas: maquetas 3D de tiendas (páginas HTML completas).

Cada planograma es un archivo de la carpeta `planogramas/`; para agregar uno
se pone el archivo y se suma a PLANOGRAMAS con sus datos. Solo entra quien
tiene el módulo «Planogramas», que no se enciende solo ni para los admins: se
da persona por persona en Jerarquía y permisos › Personas.

`vista` de cada zona es una de las vistas del planograma (general, planta,
entrada, pasillo, cajas, maquinas, bodega, mezz) o 'cliente' (modo cliente).
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from core import require_modulo

router = APIRouter(prefix='/planogramas', tags=['planogramas'])

CARPETA = Path(__file__).parent / 'planogramas'

PLANOGRAMAS = [
    {
        'id': 'ingco-local-02', 'archivo': 'ingco-local-02.html',
        'nombre': 'Tienda INGCO · Local 02', 'marca': 'INGCO-STORE', 'local': 'Local 02', 'area_m2': 250,
        'descripcion': 'Planograma 3D según planos, con productos y precios INGCO de Herco.',
        'actualizado': '2026-11-06',
        'datos': {'productos': 215, 'unidades': 11273, 'valor': 4570000, 'camaras': 14},
        'zonas': [
            {'nombre': 'Góndolas 1 a 4', 'detalle': 'Inalámbricas, eléctricas, corte y manuales', 'color': '#e09a1f', 'vista': 'pasillo'},
            {'nombre': 'Paredes', 'detalle': 'Accesorios, seguridad, motosierras, escaleras', 'color': '#5d6b7a', 'vista': 'general'},
            {'nombre': 'Islas de máquinas', 'detalle': 'Generadores, compresores, sierras', 'color': '#b5651d', 'vista': 'maquinas'},
            {'nombre': 'Bodega y mezzanine', 'detalle': 'Inventario, taller y garantías', 'color': '#a07a48', 'vista': 'bodega'},
        ],
    },
]


def _publico(p: dict) -> dict:
    return {k: v for k, v in p.items() if k != 'archivo'}


@router.get('')
async def lista(user=Depends(require_modulo('planogramas'))):
    return [_publico(p) for p in PLANOGRAMAS]


@router.get('/{pid}')
async def ver(pid: str, user=Depends(require_modulo('planogramas'))):
    p = next((x for x in PLANOGRAMAS if x['id'] == pid), None)
    if not p:
        raise HTTPException(status_code=404, detail='Planograma no encontrado')
    try:
        html = (CARPETA / p['archivo']).read_bytes()
    except OSError:
        raise HTTPException(status_code=404, detail='Planograma no encontrado')
    return Response(content=html, media_type='text/html; charset=utf-8',
                    headers={'Cache-Control': 'no-store'})
