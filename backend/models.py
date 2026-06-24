"""Pydantic models / schemas for HERCO360."""
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

EVENT_CATEGORIES = ['Reunión', 'Auditoría', 'Capacitación', 'Seguimiento', 'Reporte', 'Personal']
ROOM_STATES = ['Disponible', 'Ocupada', 'Reservada', 'Cancelada', 'Finalizada']


# ---- Auth ----
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=4)
    position: Optional[str] = 'Colaborador'


class LoginInput(BaseModel):
    email: EmailStr
    password: str


# ---- Users ----
class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
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
    category: str = 'Reunión'
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
