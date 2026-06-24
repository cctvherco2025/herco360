# plan.md — HERCO360 (Premium Corporate SaaS)

## 1) Objectives
- Deliver a premium, modern SaaS experience (Linear/Notion/Vercel + soft neumorphism) in Spanish with light/dark modes.
- Build a working MVP with: JWT auth + role-based access, pending user approvals, Agenda (main module), Sala de Juntas (single room V1, multi-room ready), Usuarios admin module, Configuración, and functional Notificaciones.
- Seed realistic demo data (users, activities, reservations, notifications) so the app looks “alive” from first run.

## 2) Implementation Steps

### Phase 1 — Core Flow Validation (NO separate POC)
Rationale: Level 2 app (CRUD + simple JWT auth + internal logic). Proceed directly to MVP build with incremental testing.
- Confirm core workflows in dev as we implement: register→pending→admin approve→login→create activity→assign participants→notifications.

### Phase 2 — V1 App Development (MVP)
**Backend (FastAPI + MongoDB motor, /api)**
1. Project scaffolding: settings, db connection, common response/error helpers, UUID ids, datetime serialization.
2. Auth:
   - POST /auth/register (creates pending user)
   - POST /auth/login (JWT)
   - GET /auth/me
   - Seed initial admin: Kevin Armas (approved, role=admin)
3. Users (admin-gated):
   - GET /users (filters: pending/approved)
   - POST /users/{id}/approve, POST /users/{id}/reject
   - PATCH /users/{id}/role
   - PATCH /users/me (profile)
4. Activities (Agenda core):
   - CRUD endpoints + filters (range/category/participant)
   - Participant responses accept/reject
   - If uses_meeting_room=true, create/update/cancel associated reservation with conflict checks
5. Meeting Room + Reservations:
   - Seed one room, but model supports many
   - CRUD reservations + status transitions (reservada/cancelada/finalizada)
   - GET room status (derived from reservations “now”)
6. Notifications:
   - GET /notifications (per user), POST /notifications/{id}/read, POST /notifications/read-all
   - Auto-generate on: user pending, user approved, activity assigned, participation rejected, room reserved, room cancelled
7. Dashboard + Search:
   - GET /dashboard (cards + today timeline + recent activity feed)
   - GET /search?q= (users + activities)
8. Seed script:
   - Users: Kevin(admin), Samuel, Omar, Walter (approved)
   - Sample activities across categories + participants
   - Sample reservations + recent activity + notifications

**Frontend (React + Tailwind + shadcn/ui + framer-motion)**
1. App foundation:
   - ThemeContext (light/dark, persisted)
   - AuthContext (JWT, axios interceptors)
   - Protected routes + role guards
2. Premium shell:
   - Floating rounded sidebar (Inicio/Agenda/Sala de Juntas/Usuarios/Configuración) + user card
   - Header: global search, notifications bell+badge dropdown, theme toggle, avatar menu
3. Auth screens:
   - Login + Register (HERCO placeholder wordmark)
   - Pending approval screen/state
4. Dashboard (Inicio):
   - Greeting + date
   - 4 cards (Hoy, Sala, Notificaciones, Pendientes)
   - Today timeline (cards, not tables)
   - Recent activity panel
   - Weekly mini calendar + Día/Semana/Mes toggle + “Nueva actividad”
5. Agenda (main):
   - Custom calendar grid Month/Week/Day (date-fns)
   - Event cards color-coded by category
   - Create/Edit modal (title, category, time, participants, optional room)
   - Participant accept/reject UI + notifications
6. Sala de Juntas:
   - Single room status card + reservation creation modal
   - Reservation list (cards) + cancel/finalize actions
7. Usuarios (admin):
   - Pending approvals queue + approve/reject
   - Users list + role change
8. Configuración:
   - Profile edit + preferences (theme)
9. Micro-interactions:
   - Hover elevation, smooth modal transitions, animated theme switch

**Phase 2 user stories (minimum 5)**
1. Como visitante, quiero registrarme para solicitar acceso y ver el estado “Pendiente de aprobación”.
2. Como administrador (Kevin), quiero aprobar/rechazar usuarios para controlar el acceso a la plataforma.
3. Como usuario, quiero ver mi Dashboard con actividades de hoy, estado de Sala de Juntas y notificaciones.
4. Como usuario, quiero crear una actividad desde Agenda con participantes y categoría para organizar mi semana.
5. Como participante, quiero aceptar o rechazar mi participación para mantener la agenda actualizada.
6. Como usuario, quiero reservar/cancelar la Sala de Juntas asociada a una actividad.

**End of Phase 2: Testing**
- Run 1 round of end-to-end testing (auth + approvals + agenda CRUD + room reservation + notifications + theme persistence). Fix all issues.

### Phase 3 — Hardening + UX Polish (production-friendly)
1. Backend hardening:
   - Strong validation, consistent error codes, conflict handling for overlapping reservations
   - Indexes for email, dates, room_id
   - Expand audit/recent activity feed consistency
2. Frontend polish:
   - Better empty states, skeleton loading, keyboard shortcuts (esc close modal)
   - Search results overlay (activities/users)
   - More refined motion + accessibility pass
3. Notifications refinement:
   - Type icons/colors, deep-links to related objects, mark-read patterns

**Phase 3 user stories (minimum 5)**
1. Como usuario, quiero buscar globalmente actividades y usuarios sin cambiar de módulo.
2. Como usuario, quiero ver estados vacíos elegantes cuando no hay actividades o notificaciones.
3. Como usuario, quiero que el sistema evite reservas solapadas para no duplicar la Sala.
4. Como usuario, quiero abrir una notificación y navegar al evento/reserva relacionada.
5. Como administrador, quiero ver un feed confiable de actividad reciente para auditoría ligera.

**End of Phase 3: Testing**
- Run 1 round of end-to-end testing focused on edge cases (overlaps, permission checks, notification deep links).

### Phase 4+ — Extensions (on request)
- Activate multiple meeting rooms UI/logic.
- Replace placeholder logo with official asset.
- Advanced calendar features (drag/drop, resize, recurring events) if requested.

## 3) Next Actions
1. Create repo structure (backend/frontend), env templates, and seed data plan.
2. Implement backend auth + approvals + notifications generation first (core workflow).
3. Implement frontend shell + login/register + pending approval UX.
4. Build Agenda month/week/day + create/edit modal + participant responses.
5. Add Sala de Juntas reservations + conflict checks + notification hooks.
6. Run Testing Agent end-to-end; fix until stable.

## 4) Success Criteria
- Premium SaaS look/feel (no ERP/table-heavy UI), light/dark polished, smooth interactions.
- Registration creates pending user; admin can approve; approved user can login.
- Agenda supports month/week/day views; CRUD activities; participants can accept/reject.
- Sala de Juntas can be reserved/cancelled; overlaps prevented; status reflects current.
- Notifications are generated for all required types and can be read/marked read.
- Seed data loads and dashboard shows realistic content on first run.
- End-to-end test pass with no critical bugs in core flows.