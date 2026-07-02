# plan.md — Fix de empalmes (double-booking) en Agenda HERCO360

## 1) Objectives
- Eliminar el bug que permite crear/editar reuniones empalmadas en **mismo horario**.
- Validar empalmes en **ambos**: **Sala de Juntas** (reservas) y **participantes** (personas).
- Asegurar que actividades de **Vacaciones** (`is_vacation=True`) **NO** bloqueen horario.
- Cuando exista choque: **bloqueo duro** con **HTTP 409** y mensaje en **español**.
- Cerrar con pruebas usando **testing_agent** (backend + frontend) y checklist de despliegue en Render.

## 2) Implementation Steps

### Phase 1 — Backend fix (core workflow)
**User stories (core):**
1. Como usuario, quiero que el sistema me impida guardar una reunión si la Sala de Juntas ya está reservada a esa hora.
2. Como usuario, quiero que el sistema me impida guardar una reunión si cualquiera de los participantes ya tiene otra reunión a esa hora.
3. Como usuario, quiero poder crear reuniones aunque exista un marcador de Vacaciones en ese rango (no debe bloquear).
4. Como creador de una reunión, quiero poder editarla sin crear empalmes con otras reservas/actividades.
5. Como usuario, quiero ver un error claro en español cuando haya choque de horario.

**Backend tasks (routes_activities.py):**
- Agregar helper `_times_overlap(startA,endA,startB,endB)` usando comparación de strings `HH:MM` (asumiendo formato consistente).
- Agregar helper async `_check_conflicts(date, start_time, end_time, participant_ids, uses_meeting_room, *, exclude_activity_id=None)`:
  - **Room conflict**: consultar `reservations` por `date` y traslape de `start_time/end_time`, excluyendo:
    - `activity_id == exclude_activity_id` (en update)
    - estados `Cancelada`/`Finalizada` (no bloquean)
  - **Participants conflict**: consultar `activities` por `date` y traslape, donde:
    - NO tenga `is_vacation=True`
    - `id != exclude_activity_id`
    - y el evento afecte a cualquiera de los participantes **o** al creador si aplica (definir set efectivo: `participant_ids + [user.id]` si corresponde a regla de negocio).
- Wire-in en `create_activity`:
  - Antes de insertar, validar **todas** las fechas de recurrencia (`dates = _gen_dates(...)`) llamando `_check_conflicts(...)` por cada `dt`.
  - Si hay choque, abortar con `HTTPException(409, detail=...)`.
- Wire-in en `update_activity`:
  - Validar con `_check_conflicts(..., exclude_activity_id=activity_id)` antes de aplicar cambios.
- Mensajes de error (español):
  - Sala: `"La Sala de Juntas ya está reservada en este horario."`
  - Participantes: `"Uno o más participantes ya tienen una reunión en este horario."`
  - (Opcional) genérico: `"Ya existe un empalme de horario."`

### Phase 2 — Testing (testing_agent obligatorio)
**User stories (test end-to-end):**
1. Como usuario, al intentar reservar Sala en el mismo horario, quiero recibir 409 y mensaje claro.
2. Como usuario, al invitar a alguien ocupado en ese horario, quiero recibir 409.
3. Como usuario, quiero poder crear una reunión que coincide con un marcador de Vacaciones sin bloqueo.
4. Como usuario, al editar una reunión y moverla a un horario ocupado, quiero recibir 409.
5. Como usuario móvil, quiero que el modal/UX muestre el error sin romper el flujo.

**Backend tests (mínimo):**
- Crear actividad A (sin sala) con participante X; intentar crear actividad B mismo `date/start/end` con X ⇒ 409.
- Crear actividad con `uses_meeting_room=True`; intentar otra con sala mismo horario ⇒ 409.
- Crear actividad que se traslape parcialmente (ej. 10:00-11:00 vs 10:30-11:30) ⇒ 409.
- Confirmar que actividad `is_vacation=True` no dispara conflicto.

**Frontend tests (mínimo):**
- Desde `ActivityModal`, intentar guardar con choque (sala/participantes) y verificar que:
  - se muestra el error (toast/alert)
  - no se crea el evento en calendario

### Phase 3 — Deploy & verification
**User stories (release):**
1. Como admin, quiero desplegar el fix y confirmar en producción que ya no permite empalmes.
2. Como usuario, quiero que el comportamiento sea idéntico en desktop y móvil.
3. Como usuario, quiero que el error aparezca sin recargar la página.
4. Como usuario, quiero que los eventos recurrentes fallen completos si cualquier ocurrencia choca (sin crear series “a medias”).
5. Como equipo, queremos evitar regresiones en Sala/Agenda tras el despliegue.

**Release checklist:**
- Recordatorio al usuario: **“Save to GitHub”** en el editor y confirmar que **Render redeploy** ocurrió (backend y frontend).
- Probar en `cctvherco.com` creando 2 reuniones en mismo horario (con sala y con mismos participantes).

## 3) Next Actions
1. Implementar helpers y conflicto en `/app/backend/routes_activities.py`.
2. Ejecutar **testing_agent** (backend + frontend) y registrar resultados.
3. Entregar instrucciones de verificación en producción + recordatorio de **Save to GitHub** y redeploy en Render.

## 4) Success Criteria
- No es posible crear/editar reuniones empalmadas por **sala** o **participantes**.
- Vacaciones (`is_vacation=True`) no bloquean.
- La API responde **HTTP 409** con mensajes en español.
- Pruebas del **testing_agent** pasan y el flujo de Agenda/Sala sigue funcional.
- Confirmación en Render (redeploy) y validación manual en producción.

---

### Future (no ahora)
- Alertas de stock bajo, editar/eliminar artículos, traspasos, ajuste físico, métricas de valor de inventario.
