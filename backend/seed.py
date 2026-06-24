"""Seed realistic demo data for HERCO360. Idempotent: runs only if no admin exists."""
from datetime import datetime, timedelta
from urllib.parse import quote
from core import db, hash_password, new_id, now_iso

DEMO_PASSWORD = 'Herco360!'

# Map legacy categories -> colors (used for seeding & migrating existing data)
CATEGORY_COLOR = {
    'Reunión': '#00a5df', 'Auditoría': '#712146', 'Capacitación': '#e0a800',
    'Seguimiento': '#3cbef6', 'Reporte': '#1e395e', 'Personal': '#ec9032',
}


def avatar(name, bg='1e395e'):
    return f"https://ui-avatars.com/api/?name={quote(name)}&background={bg}&color=fff&bold=true"


def d(offset):
    return (datetime.now() + timedelta(days=offset)).strftime('%Y-%m-%d')


async def seed_if_needed():
    admin = await db.users.find_one({'role': 'admin'})
    if admin:
        return  # already seeded

    # ---- Users ----
    users = [
        {'name': 'Kevin Armas', 'email': 'kevin.armas@herco.com', 'role': 'admin',
         'position': 'Director comercial', 'area': 'ECCP', 'bg': '1e395e'},
        {'name': 'Samuel González', 'email': 'samuel.gonzalez@herco.com', 'role': 'user',
         'position': 'Gerente', 'area': 'Negocios País', 'bg': '00a5df'},
        {'name': 'Omar Hernández', 'email': 'omar.hernandez@herco.com', 'role': 'user',
         'position': 'Jefe', 'area': 'Operación Tienda', 'bg': 'ec9032'},
        {'name': 'Walter Vásquez', 'email': 'walter.vasquez@herco.com', 'role': 'user',
         'position': 'Coordinador', 'area': 'Tienda', 'bg': '712146'},
        {'name': 'María Pérez', 'email': 'maria.perez@herco.com', 'role': 'user',
         'position': 'Coordinador', 'area': 'Auditoría', 'bg': '3cbef6'},
    ]
    user_docs = {}
    for u in users:
        doc = {
            'id': new_id(), 'name': u['name'], 'email': u['email'],
            'password_hash': hash_password(DEMO_PASSWORD), 'role': u['role'],
            'status': 'approved', 'position': u['position'], 'area': u['area'],
            'avatar_url': avatar(u['name'], u['bg']), 'phone': '', 'created_at': now_iso(),
        }
        await db.users.insert_one(doc)
        user_docs[u['name']] = doc

    # one pending user for the approval queue demo
    pending = {
        'id': new_id(), 'name': 'Roberto Mejía', 'email': 'roberto.mejia@herco.com',
        'password_hash': hash_password(DEMO_PASSWORD), 'role': 'user', 'status': 'pending',
        'position': 'Coordinador', 'area': 'Caja', 'avatar_url': avatar('Roberto Mejía', '8a8b8b'),
        'phone': '', 'created_at': now_iso(),
    }
    await db.users.insert_one(pending)

    kevin = user_docs['Kevin Armas']
    samuel = user_docs['Samuel González']
    omar = user_docs['Omar Hernández']
    walter = user_docs['Walter Vásquez']
    maria = user_docs['María Pérez']

    def participant(u, status='invited'):
        return {'user_id': u['id'], 'name': u['name'], 'avatar_url': u['avatar_url'], 'status': status}

    # ---- Meeting room ----
    room = {
        'id': new_id(), 'name': 'Sala de Juntas Principal', 'capacity': 12,
        'location': 'Piso 3 - Edificio Corporativo HERCO', 'status': 'Disponible',
        'created_at': now_iso(),
    }
    await db.rooms.insert_one(room)

    # ---- Activities (relative to today and this week) ----
    activities = [
        {'title': 'Auditoría Etiquetas H1', 'category': 'Auditoría', 'date': d(0),
         'start_time': '09:00', 'end_time': '10:30', 'creator': kevin,
         'parts': [participant(omar), participant(samuel)],
         'desc': 'Revisión de etiquetado y cumplimiento normativo primer semestre.', 'room': False},
        {'title': 'Reunión KPI Comercial', 'category': 'Reunión', 'date': d(0),
         'start_time': '11:00', 'end_time': '12:00', 'creator': samuel,
         'parts': [participant(walter), participant(omar), participant(kevin, 'accepted')],
         'desc': 'Análisis de indicadores de venta y metas mensuales.', 'room': True},
        {'title': 'Seguimiento Plan de Acción', 'category': 'Seguimiento', 'date': d(0),
         'start_time': '15:00', 'end_time': '16:00', 'creator': kevin,
         'parts': [participant(samuel)],
         'desc': 'Seguimiento de pendientes del plan estratégico.', 'room': False},
        {'title': 'Capacitación Nuevos Productos', 'category': 'Capacitación', 'date': d(1),
         'start_time': '09:00', 'end_time': '11:00', 'creator': maria,
         'parts': [participant(samuel), participant(walter)],
         'desc': 'Inducción sobre la nueva línea de herramientas eléctricas.', 'room': True},
        {'title': 'Reunión Dirección', 'category': 'Reunión', 'date': d(2),
         'start_time': '10:00', 'end_time': '11:30', 'creator': kevin,
         'parts': [participant(samuel), participant(omar), participant(maria)],
         'desc': 'Reunión mensual de dirección general.', 'room': True},
        {'title': 'Reporte Inventario Trimestral', 'category': 'Reporte', 'date': d(3),
         'start_time': '14:00', 'end_time': '15:30', 'creator': walter,
         'parts': [participant(omar)],
         'desc': 'Consolidación del reporte de inventario Q2.', 'room': False},
        {'title': 'Revisión Personal 1:1', 'category': 'Personal', 'date': d(4),
         'start_time': '16:00', 'end_time': '16:30', 'creator': kevin,
         'parts': [participant(walter)],
         'desc': 'Conversación de desarrollo profesional.', 'room': False},
        {'title': 'Auditoría Procesos Logística', 'category': 'Auditoría', 'date': d(-2),
         'start_time': '08:30', 'end_time': '10:00', 'creator': omar,
         'parts': [participant(walter)],
         'desc': 'Auditoría interna de procesos de bodega.', 'room': False},
    ]

    for a in activities:
        doc = {
            'id': new_id(), 'title': a['title'], 'color': CATEGORY_COLOR.get(a['category'], '#00a5df'), 'date': a['date'],
            'start_time': a['start_time'], 'end_time': a['end_time'], 'description': a['desc'],
            'location': room['name'] if a['room'] else '', 'participants': a['parts'],
            'uses_meeting_room': a['room'], 'created_by': a['creator']['id'],
            'created_by_name': a['creator']['name'], 'created_by_avatar': a['creator']['avatar_url'],
            'created_at': now_iso(),
        }
        await db.activities.insert_one(doc)
        if a['room']:
            await db.reservations.insert_one({
                'id': new_id(), 'room_id': room['id'], 'room_name': room['name'],
                'activity_id': doc['id'], 'title': a['title'], 'date': a['date'],
                'start_time': a['start_time'], 'end_time': a['end_time'], 'status': 'Reservada',
                'reserved_by': a['creator']['id'], 'reserved_by_name': a['creator']['name'],
                'notes': a['desc'], 'created_at': now_iso(),
            })

    # ---- Recent activity feed ----
    logs = [
        (kevin, 'creó una actividad', 'Auditoría Etiquetas H1', 'activity', 15),
        (samuel, 'creó una reunión', 'Reunión KPI Comercial', 'activity', 45),
        (omar, 'reservó la Sala de Juntas', 'Reunión KPI Comercial', 'reservation', 60),
        (maria, 'rechazó su participación', 'Reunión Dirección', 'activity', 120),
        (walter, 'creó una actividad', 'Reporte Inventario Trimestral', 'activity', 180),
        (kevin, 'aprobó un usuario', 'María Pérez', 'user', 240),
    ]
    for actor, action, target, ttype, mins in logs:
        await db.activity_log.insert_one({
            'id': new_id(), 'actor_id': actor['id'], 'actor_name': actor['name'],
            'actor_avatar': actor['avatar_url'], 'action': action, 'target': target,
            'target_type': ttype,
            'created_at': (datetime.now() - timedelta(minutes=mins)).astimezone().isoformat(),
        })

    # ---- Notifications for Kevin (admin) ----
    notifs = [
        ('usuario_pendiente', 'Roberto Mejía solicitó acceso a HERCO360', 'Roberto Mejía',
         avatar('Roberto Mejía', '8a8b8b'), 20),
        ('participacion_rechazada', 'María Pérez rechazó su participación en \'Reunión Dirección\'',
         'María Pérez', maria['avatar_url'], 120),
        ('sala_reservada', "Sala de Juntas reservada para 'Reunión KPI Comercial'",
         'Samuel González', samuel['avatar_url'], 50),
    ]
    meta_map = {
        'usuario_pendiente': ('Nuevo usuario pendiente', 'UserPlus', '#ec9032'),
        'participacion_rechazada': ('Participación rechazada', 'UserX', '#dc2626'),
        'sala_reservada': ('Sala de Juntas reservada', 'Bookmark', '#00a5df'),
    }
    for ntype, msg, an, aa, mins in notifs:
        title, icon, color = meta_map[ntype]
        await db.notifications.insert_one({
            'id': new_id(), 'user_id': kevin['id'], 'type': ntype, 'title': title,
            'icon': icon, 'color': color, 'message': msg, 'read': False,
            'related_id': None, 'related_type': None, 'actor_name': an, 'actor_avatar': aa,
            'created_at': (datetime.now() - timedelta(minutes=mins)).astimezone().isoformat(),
        })

    print('[SEED] HERCO360 demo data created successfully.')



async def migrate_activity_colors():
    """Backfill `color` on activities created before the color feature (derive from legacy category)."""
    legacy = await db.activities.find({'color': {'$exists': False}}, {'_id': 0, 'id': 1, 'category': 1}).to_list(2000)
    for a in legacy:
        color = CATEGORY_COLOR.get(a.get('category'), '#00a5df')
        await db.activities.update_one({'id': a['id']}, {'$set': {'color': color}, '$unset': {'category': ''}})
    if legacy:
        print(f'[MIGRATE] Backfilled color on {len(legacy)} activities.')



# Official HERCO article catalog (provided by the client)
SAMPLE_ARTICLES = [
    'Safety clips. Stop lock 6 mm Color: White',
    'Safety clips. Stop lock 8 mm Color: White',
    'Standard Pegboard hooks 35cm from base to price holder 6mm include price tag',
    'Standard hook for load bar 30cm from base to price holder 8mm include price tag',
    'Extra price holder for hook',
    'Wire basket, 1000mm*470*250mm',
    'Wire basket, 1250mm*470*250mm',
    'Divider for basket',
    'Hook For Basin, with one 1.25m load bar',
    'Load Bar for above hooks, 1.25 m',
    'Load Bar for above hooks, 1.00 m',
    'Load bar 1.10 m',
    'Wire divid 470*170',
    'Front wire fence L1000 *H170mm',
    'Front wire fence L1250 *H170mm',
    'Wire divider 470*200mm',
    'Wire divider L570*H200mm',
    'Front wir 1250*95mm',
    'Front wir 1000*95mm',
    'Front wir 1100*95mm',
    'Dual hook',
    'Load Bar for below hooks 1.00 m',
    'Load Bar for below hooks 1.25 m',
    'For Screws or other small items 1000mm*470mm',
    'Promotion Stand 1200x800x850mm',
    'H:1050-2100mm (height adjustable) Base Size: 310x250x2mm',
    'Blue cart basket HBE-R-5 465x415x475mm',
    'Cargo Cart Size:1290*425*1616mm Max. loading capacity: 500KGS',
    'Plastic Clip Display Strip 30*750mm',
    'Plastic Clip Display Strip 20*740mm',
    '6-Step Warehouse Platform Step Ladder with Handrail and Wheels LT-11 Weight Capacity 300kg',
    'Standard Pegboard hooks 35cm from base to price holder 6mm',
    'Standard Pegboard hooks 12cm from base to price holder 6mm include price tag',
    'Single prong hooks for pegboard Standard s 12cm from base to tip (White) Wire diameter 6mm',
    'Special piece for cable reel placement.',
    'Strong Magnetic Force Label Holder for Warehouse Rack (color white)',
    'Sign Holder for rack',
    'Poster Magnetic Sign Holder C4 Model: HBE-SH-CX-C4',
    'PVC tag holder 1100 mm',
    'PVC tag holder 1000 mm',
    'PVC tag holder 1230 mm',
    'Load Bar for Dual hook, 1000mm 50x20x2mm',
    'Wire divider 570*200mm',
    'Wire divider L470*H95mm',
    'Shelf 1100*570 + Include the lower accessory that supports the shelf (for each shelf).',
    'Shelf 1000*470 + Include the lower accessory that supports the shelf (for each shelf).',
    'Shelf 1250*470 + Include the lower accessory that supports the shelf (for each shelf).',
    'Support for gondola shelf tray (bracket) 470',
    'Transparent plastic anti-theft display case. (dimensions: 170 mm x 120 mm x 112 mm)',
    'Detacher for above Transparent plastic anti-theft display case',
    'soft labels',
    'Hard tag Size: 51 mm frequency 58 khz. Color White. Bar: 33mm',
]

# Initial demo stock spread across branches (uses official articles)
DEMO_STOCK = [
    ('Safety clips. Stop lock 6 mm Color: White', 'H1', 500),
    ('Safety clips. Stop lock 8 mm Color: White', 'H1', 420),
    ('Dual hook', 'H1', 300),
    ('Standard Pegboard hooks 35cm from base to price holder 6mm include price tag', 'H1', 250),
    ('Wire basket, 1000mm*470*250mm', 'H2', 60),
    ('Wire basket, 1250mm*470*250mm', 'H2', 45),
    ('Divider for basket', 'H2', 120),
    ('Load Bar for above hooks, 1.25 m', 'H2', 80),
    ('Shelf 1000*470 + Include the lower accessory that supports the shelf (for each shelf).', 'H4', 40),
    ('Shelf 1100*570 + Include the lower accessory that supports the shelf (for each shelf).', 'H4', 35),
    ('Support for gondola shelf tray (bracket) 470', 'H4', 90),
    ('PVC tag holder 1000 mm', 'H4', 150),
    ('Sign Holder for rack', 'H5', 70),
    ('Strong Magnetic Force Label Holder for Warehouse Rack (color white)', 'H5', 110),
    ('Transparent plastic anti-theft display case. (dimensions: 170 mm x 120 mm x 112 mm)', 'H5', 65),
    ('Promotion Stand 1200x800x850mm', 'H6', 12),
    ('Cargo Cart Size:1290*425*1616mm Max. loading capacity: 500KGS', 'H6', 5),
    ('6-Step Warehouse Platform Step Ladder with Handrail and Wheels LT-11 Weight Capacity 300kg', 'H6', 8),
]


async def seed_inventory():
    """Seed inventory catalog + demo stock if empty (idempotent)."""
    if await db.inventory_catalog.count_documents({}) == 0:
        for name in SAMPLE_ARTICLES:
            await db.inventory_catalog.insert_one({
                'id': new_id(), 'name': name, 'name_key': name.lower(), 'created_at': now_iso(),
            })
        print(f'[SEED] Inventory catalog created ({len(SAMPLE_ARTICLES)} articles).')

    if await db.inventory_stock.count_documents({}) == 0:
        for article, suc, qty in DEMO_STOCK:
            await db.inventory_stock.insert_one({
                'id': new_id(), 'article': article, 'article_key': article.lower(),
                'sucursal': suc, 'quantity': qty, 'created_at': now_iso(), 'updated_at': now_iso(),
            })
            await db.inventory_movements.insert_one({
                'id': new_id(), 'type': 'entrada', 'article': article, 'sucursal': suc,
                'quantity': qty, 'description': 'Inventario inicial', 'solicitante': '',
                'registered_by': None, 'registered_by_name': 'Sistema',
                'registered_by_avatar': None, 'created_at': now_iso(),
            })
        print(f'[SEED] Inventory demo stock created ({len(DEMO_STOCK)} entries).')
