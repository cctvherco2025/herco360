from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

from core import client
from seed import seed_if_needed, migrate_activity_colors, seed_inventory
import routes_auth, routes_users, routes_activities, routes_rooms, routes_notifications, routes_dashboard, routes_inventory

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

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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


@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()
