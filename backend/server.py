from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

from core import client
from seed import seed_if_needed, migrate_activity_colors, seed_inventory
import routes_auth, routes_users, routes_activities, routes_rooms, routes_notifications, routes_dashboard, routes_inventory, routes_reports, routes_public
import storage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title='HERCO360 API')

api_router = APIRouter(prefix='/api')


@api_router.get('/')
async def root():
    return {'message': 'HERCO360 API', 'status': 'ok'}


# Mount feature routers under /api
api_router.include_router(routes_auth.router)
api_router.include_router(routes_users.router)
api_router.include_router(routes_activities.router)
api_router.include_router(routes_rooms.router)
api_router.include_router(routes_rooms.res_router)
api_router.include_router(routes_notifications.router)
api_router.include_router(routes_dashboard.router)
api_router.include_router(routes_inventory.router)
api_router.include_router(routes_reports.router)
api_router.include_router(routes_public.router)

app.include_router(api_router)

_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()]
_allow_all = ('*' in _cors_origins) or (not _cors_origins)
app.add_middleware(
    CORSMiddleware,
    # A wildcard origin cannot be combined with credentials per the CORS spec.
    # The app authenticates with Bearer tokens (no cookies), so disabling
    # credentials when allowing all origins is safe and avoids browser blocks.
    allow_origins=['*'] if _allow_all else _cors_origins,
    allow_credentials=not _allow_all,
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event('startup')
async def startup():
    try:
        await seed_if_needed()
        await migrate_activity_colors()
        await seed_inventory()
    except Exception as e:
        logger.error(f'Seed error: {e}')
    try:
        await storage.init_storage()
        logger.info('Object storage initialized')
    except Exception as e:
        logger.error(f'Storage init failed: {e}')


@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()
