# plan.md — HERCO360 (Premium Corporate SaaS)

## 1) Objectives
- **Status update:** Phase 2 (V1 MVP) is **complete**, seeded, and tested end-to-end (**96% overall**, no critical bugs).
- Maintain and polish a **premium, modern SaaS experience** (Linear/Notion/Vercel feel + soft neumorphism) in Spanish with **light/dark mode**.
- Harden the platform for production readiness: stability, accessibility, edge-case handling, and UX refinements.
- Prepare for brand finalization: **swap placeholder “HERCO” wordmark** with the official PNG/SVG once delivered.
- Keep architecture ready for V2 expansions (e.g., **multiple meeting rooms**, advanced calendar features).

## 2) Implementation Steps

### Phase 1 — Core Flow Validation (NO separate POC)
**Completed (historical):** No separate POC required; incremental validation happened during Phase 2 build.

### Phase 2 — V1 App Development (MVP)
**Completed and verified visually + end-to-end tested.**

#### Backend (FastAPI + MongoDB motor, /api)
**Delivered:**
1. Project scaffolding: settings, db connection, serialization helpers, UUID ids.
2. Auth:
   - ✅ POST /auth/register (creates pending user)
   - ✅ POST /auth/login (JWT)
   - ✅ GET /auth/me
   - ✅ Seed initial admin: **Kevin Armas** (approved, role=admin)
3. Users (admin-gated):
   - ✅ GET /users (filters: pending/approved)
   - ✅ POST /users/{id}/approve, POST /users/{id}/reject
   - ✅ PATCH /users/{id}/role
   - ✅ PATCH /users/me (profile)
4. Activities (Agenda core):
   - ✅ CRUD endpoints + date range filters
   - ✅ Participant responses accept/reject
   - ✅ Category support (Reunión, Auditoría, Capacitación, Seguimiento, Reporte, Personal)
   - ✅ Optional meeting room reservation generation when uses_meeting_room=true
5. Meeting Room + Reservations:
   - ✅ Seed one room, but model supports many
   - ✅ Reservations CRUD + status transitions (Reservada/Cancelada/Finalizada)
   - ✅ Derived room status (Disponible/Reservada/Ocupada) based on time window
   - ✅ Overlap/conflict detection (returns 409 on overlaps — correct behavior)
6. Notifications:
   - ✅ GET /notifications, POST /notifications/{id}/read, POST /notifications/read-all
   - ✅ Auto-generate for 6 types:
     - usuario pendiente de aprobación
     - usuario aprobado
     - actividad asignada
     - participación rechazada
     - sala reservada
     - sala cancelada
7. Dashboard + Search:
   - ✅ GET /dashboard (stats + today timeline + recent activity feed)
   - ✅ GET /search?q= (users + activities)
8. Seed script:
   - ✅ Realistic demo data: users (Kevin, Samuel, Omar, Walter, María), pending user (Roberto), activities, reservations, notifications, recent activity feed.

#### Frontend (React + Tailwind + shadcn/ui + framer-motion)
**Delivered:**
1. App foundation:
   - ✅ Theme system (light/dark persisted)
   - ✅ AuthContext (JWT, axios interceptors)
   - ✅ Protected routes
2. Premium shell:
   - ✅ Floating rounded sidebar + user card + “Nueva actividad” CTA
   - ✅ Glass header: global search (popover), notifications (bell+badge), theme toggle, avatar menu
3. Auth screens:
   - ✅ Login + Register (HERCO placeholder wordmark)
   - ✅ Pending approval screen
4. Dashboard (Inicio):
   - ✅ Greeting + date
   - ✅ 4 KPI cards
   - ✅ Today timeline (card-based)
   - ✅ Recent activity feed
   - ✅ Mini-calendar with Día/Semana/Mes toggle + “Nueva actividad”
5. Agenda (main):
   - ✅ Month/Week/Day views (Google Calendar–style experience)
   - ✅ Event cards color-coded by category
   - ✅ Create/Edit activity modal
   - ✅ Participant accept/reject UI + notifications
6. Sala de Juntas:
   - ✅ Hero status card + reservations (reserve/cancel/finalize)
   - ✅ Single room V1; multi-room ready
7. Usuarios:
   - ✅ Admin pending approvals queue
   - ✅ Team directory
   - ✅ Role management (admin)
8. Configuración:
   - ✅ Profile edit + theme preferences
9. Micro-interactions:
   - ✅ Card hover lift, smooth transitions, modal animations, theme toggle animation

**Phase 2 user stories (minimum 5)**
✅ Completed
1. Registro con estado “Pendiente de aprobación”.
2. Admin aprueba/rechaza usuarios.
3. Dashboard con actividades, sala y notificaciones.
4. Crear/editar actividad desde Agenda con participantes y categoría.
5. Participante acepta/rechaza su participación.
6. Reservar/cancelar/finalizar Sala de Juntas.

**End of Phase 2: Testing**
✅ Completed
- End-to-end testing completed (96% overall). No critical bugs.
- Minor flags were non-bugs:
  - 409 overlap detection is correct behavior.
  - Global search is a popover trigger button (not a persistent input).

### Phase 3 — Hardening + UX Polish (production-friendly)
**Next active phase.**

1. Backend hardening:
   - Add indexes: email unique, activities date ranges, reservations room_id+date.
   - Tighten validation and consistent error responses (especially time ranges and overlaps).
   - Add richer audit entries for key actions (approve/reject, reservation cancel).
   - Optional: add pagination for activity_log and notifications.

2. Frontend polish:
   - Improve accessibility (focus states audit, keyboard navigation, reduced-motion behavior).
   - Improve modal robustness:
     - Ensure close actions always fully remove overlay (fix any edge cases from automated testing).
     - Add explicit data-testids for reservation modal actions to avoid selector ambiguity.
   - Empty states + skeleton loaders (Agenda, Notifications, Usuarios) to feel even more premium.
   - Deep-links from notifications to related activity/reservation (when related_id exists).
   - Refine global search UX:
     - Add keyboard shortcut hint (e.g., Ctrl+K) and focus management.
     - Add data-testid coverage for search open/close + results.

3. Brand finalization:
   - Replace placeholder HERCO logo with official PNG/SVG when provided.
   - Confirm spacing/contrast compliance with the official asset in both themes.

**Phase 3 user stories (minimum 5)**
1. Como usuario, quiero buscar globalmente con atajos y resultados claros.
2. Como usuario, quiero estados vacíos elegantes y carga fluida.
3. Como usuario, quiero que la app sea accesible (focus visible, teclado, contraste AA).
4. Como usuario, quiero abrir una notificación y navegar al elemento relacionado.
5. Como administrador, quiero un feed de actividad reciente más completo y consistente.

**End of Phase 3: Testing**
- Run 1 round of end-to-end testing focused on:
  - Reservation overlap edge cases
  - Permissions/role checks
  - Notification deep links
  - Modal open/close reliability
  - Theme persistence + contrast

### Phase 4+ — Extensions (on request)
- Activate and expose **multiple meeting rooms** in UI/logic.
- Advanced agenda features (drag/drop, resize, recurring events, ICS export) if requested.
- Enhanced notification preferences (per-type toggles).
- Replace placeholder logo with the official asset (once provided) — if not completed in Phase 3.

## 3) Next Actions
1. **Polish/Hardening sprint (Phase 3):**
   - Add DB indexes + stricter validation.
   - Improve modal overlay close reliability and add testids.
   - Add notification deep-links.
   - Add skeleton/empty states.
2. Incorporate **official HERCO logo** as soon as it’s provided (PNG/SVG).
3. Re-run Testing Agent after fixes and capture screenshots for light/dark modes.

## 4) Success Criteria
- Premium SaaS look/feel maintained (no ERP/table-heavy UI).
- Reliability improvements: no blocking overlays, consistent close behaviors, stable navigation.
- Accessibility: focus visible, keyboard friendly, WCAG AA contrast in both themes.
- Notifications deep-link correctly and read-state behavior remains consistent.
- Multiple-room readiness preserved; official logo integration completed when supplied.
- End-to-end tests pass with no critical bugs (and improved stability in modal/search flows).
