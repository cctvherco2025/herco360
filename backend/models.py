"""Pydantic models / schemas for HERCO360."""
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

EVENT_CATEGORIES = ['Reunión', 'Auditoría', 'Capacitación', 'Seguimiento', 'Reporte', 'Personal']
ROOM_STATES = ['Disponible', 'Ocupada', 'Reservada', 'Cancelada', 'Finalizada']
SUCURSALES = ['H1', 'H2', 'H4', 'H5', 'H6']


# ---- Auth ----
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=4)
    position: Optional[str] = 'Colaborador'
    area: Optional[str] = ''
    sucursal: Optional[str] = ''


class LoginInput(BaseModel):
    email: EmailStr
    password: str


# ---- Users ----
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    area: Optional[str] = None
    sucursal: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None


class RoleUpdate(BaseModel):
    role: str  # admin | user


# ---- Activities ----
class Participant(BaseModel):
    user_id: str
    name: str
    avatar_url: Optional[str] = None
    status: str = 'invited'  # invited | accepted | rejected


class ActivityInput(BaseModel):
    title: str
    color: str = '#00a5df'  # user-picked color (replaces fixed categories)
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    description: Optional[str] = ''
    location: Optional[str] = ''
    participant_ids: List[str] = []
    uses_meeting_room: bool = False


class RespondInput(BaseModel):
    response: str  # accepted | rejected


# ---- Reservations ----
class ReservationInput(BaseModel):
    room_id: Optional[str] = None
    title: str
    date: str
    start_time: str
    end_time: str
    activity_id: Optional[str] = None
    notes: Optional[str] = ''



# ---- Inventory ----
class InventoryIntake(BaseModel):
    article: str
    quantity: int
    sucursal: str


class InventoryMovementInput(BaseModel):
    article: str
    quantity: int
    sucursal: str  # source branch where stock is deducted
    description: str
    solicitante: Optional[str] = ''


class CatalogItemInput(BaseModel):
    name: str


# ---- Reports ----
REPORT_TYPES = [
    {'id': 'auditoria_etiqueta', 'label': 'Auditoría de etiqueta de precio', 'color': '#712146', 'icon': 'Tag'},
    {'id': 'productos_faltantes', 'label': 'Productos faltantes', 'color': '#ec9032', 'icon': 'PackageX'},
    {'id': 'recorrido_tienda', 'label': 'Recorrido tienda', 'color': '#00a5df', 'icon': 'Footprints'},
]


class ReportReviewInput(BaseModel):
    comment: Optional[str] = ''

