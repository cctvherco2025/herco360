# plan.md — HERCO360 (Premium Corporate SaaS)

## 1) Objectives
- **Status update:** V1 has expanded beyond the original MVP scope and is **complete**, seeded, and tested end-to-end (**99% overall**, no critical bugs).
- Maintain and polish a **premium, modern SaaS experience** (Linear/Notion/Vercel feel + soft neumorphism) in Spanish with **light/dark mode**.
- Keep architecture ready for expansions (e.g., **multiple meeting rooms**, inventory evolution, richer calendar interactions).
- Prepare for brand finalization:
  - Swap placeholder “HERCO” wordmark with official PNG/SVG once delivered.
  - Replace the **sample inventory article catalog** with the official article list once provided.
- Continue production hardening: stability, accessibility, validation consistency, permissions enforcement.

## 2) Implementation Steps

### Phase 1 — Core Flow Validation (NO separate POC)
**Completed (historical):** No separate POC required; incremental validation happened during Phase 2 build.

### Phase 2 — V1 App Development (MVP + Enhancements)
**Completed and verified visually + end-to-end tested (Iteration 1: 96%, Iteration 2: 99%).**

#### Backend (FastAPI + MongoDB motor, /api)
**Delivered:**
1. Project scaffolding: settings, db connection, serialization helpers, UUID ids.
2. Auth:
   - ✅ POST /auth/register (**auto-approved** user creation; returns **token + user**)
   - ✅ POST /auth/login (JWT)
   - ✅ GET /auth/me
   - ✅ Seed initial admin: **Kevin Armas** (approved, role=admin)
3. Users:
   - ✅ GET /users (filters by status)
   - ✅ PATCH /users/me (profile)
   - ✅ Admin endpoints still supported (approve/reject/role), though V1 registration no longer requires approval:
     - ✅ POST /users/{id}/approve, POST /users/{id}/reject
     - ✅ PATCH /users/{id}/role
4. Activities (Agenda core):
   - ✅ CRUD endpoints + date range filters
   - ✅ Participant responses accept/reject
   - ✅ **Color-based activities** (free color picker) instead of fixed categories
   - ✅ Migration/backfill:
     - Existing `category` values migrated into `color` and `category` removed
   - ✅ Optional meeting room reservation generation when uses_meeting_room=true
5. Meeting Room + Reservations:
   - ✅ Seed one room, but model supports many
   - ✅ Reservations CRUD + status transitions (Reservada/Cancelada/Finalizada)
   - ✅ Derived room status (Disponible/Reservada/Ocupada) based on time window
   - ✅ Overlap/conflict detection (returns 409 on overlaps — correct behavior)
6. Notifications:
   - ✅ GET /notifications, POST /notifications/{id}/read, POST /notifications/read-all
   - ✅ Auto-generate types:
     - usuario aprobado (also used as informational “nuevo colega se unió”)
     - actividad asignada
     - participación rechazada
     - sala reservada
     - sala cancelada
     - (historical) usuario pendiente de aprobación remains supported but is no longer the default flow
7. Dashboard + Search:
   - ✅ GET /dashboard (stats + today timeline + recent activity feed)
   - ✅ GET /search?q= (users + activities)
8. Seed script:
   - ✅ Realistic demo data: users (Kevin, Samuel, Omar, Walter, María, Roberto), activities, reservations, notifications, activity feed
   - ✅ User fields now include **position (cargo)** and **area** (área)
9. **Inventario module (NEW)**:
   - ✅ Access control guard on backend (403 if not allowed)
   - ✅ Catalog (autocomplete source):
     - GET /inventory/catalog?q=
     - POST /inventory/catalog (upsert)
   - ✅ Stock:
     - GET /inventory/summary (per-sucursal totals)
     - GET /inventory/stock?sucursal=&q=
   - ✅ Intake (Productos):
     - POST /inventory/intake (adds stock to sucursal and logs an `entrada` movement)
   - ✅ Movements (Movimientos):
     - POST /inventory/movement (logs a `salida` and **deducts only from source sucursal**; requires description; optional solicitante; insufficient stock = 409)
     - GET /inventory/movements
   - ✅ Inventory seed:
     - Sample catalog + demo stock across sucursales H1/H2/H4/H5/H6

#### Frontend (React + Tailwind + shadcn/ui + framer-motion)
**Delivered:**
1. App foundation:
   - ✅ Theme system (light/dark persisted)
   - ✅ AuthContext (JWT, axios interceptors)
   - ✅ Protected routes
   - ✅ Register auto-login when backend returns token
2. Premium shell:
   - ✅ Floating rounded sidebar + user card + “Nueva actividad” CTA
   - ✅ Glass header: global search (popover), notifications (bell+badge), theme toggle, avatar menu
3. Auth screens:
   - ✅ Login
   - ✅ Register (updated):
     - ✅ **Cargo dropdown**: Jefe, Coordinador, Gerente, Director comercial
     - ✅ **Área dropdown**: ECCP, Negocios País, Negocios Remotos, Caja, Ferrecréditos, Operación Tienda, Centro de Servicio, Tienda, Auditoría
   - ✅ Pending approval screen retained (historical), but no longer part of default flow
4. Dashboard (Inicio):
   - ✅ Greeting + date
   - ✅ 4 KPI cards
   - ✅ Today timeline (card-based)
   - ✅ Recent activity feed
   - ✅ Mini-calendar with Día/Semana/Mes toggle + “Nueva actividad”
   - ✅ **Click a date/slot opens new activity with that date prefilled**
5. Agenda (main):
   - ✅ Month/Week/Day views (Google Calendar–style experience)
   - ✅ **Click a date/slot opens new activity with that date prefilled**
   - ✅ Create/Edit activity modal
   - ✅ Participant accept/reject UI + notifications
   - ✅ **Color picker** (palette + custom color) replacing category selection
6. Sala de Juntas:
   - ✅ Hero status card + reservations (reserve/cancel/finalize)
   - ✅ **Reservations calendar** (Month/Week/Day) showing booked slots and click-to-reserve for a chosen date
   - ✅ Single room V1; multi-room ready
7. Usuarios:
   - ✅ Team directory
   - ✅ Admin role management
   - ✅ Displays position + area
8. Configuración:
   - ✅ Profile edit
   - ✅ Theme preferences
   - ✅ **Cargo + Área** editable via dropdowns
9. **Inventario module (NEW)**:
   - ✅ Sidebar item shown only if access rule passes
   - ✅ Route guard: /inventario redirects to / if unauthorized
   - ✅ Three tabs:
     - ✅ Productos: article autocomplete from catalog + quantity + sucursal + save intake + recent entries
     - ✅ Tiendas: per-sucursal cards + stock table + search
     - ✅ Movimientos: rebaja/salida form (description required, solicitante optional) + movement history
   - ✅ ArticleAutocomplete component implemented for usability

**Phase 2 user stories (minimum 5)**
✅ Completed (expanded)
1. Registro con acceso inmediato (auto-aprobado) y datos de cargo + área.
2. Dashboard con actividades, sala, notificaciones y mini-calendario.
3. Crear/editar actividad desde Agenda/Dashboard con fecha pre-seleccionada por click.
4. Participante acepta/rechaza su participación.
5. Sala de Juntas con calendario de reservas y click-to-reserve.
6. Actividades con color libre (sin categorías fijas).
7. Inventario: inventariar artículos, ver stock por sucursal, registrar rebajas con descripción.

**End of Phase 2: Testing**
✅ Completed
- Iteration 1: 96% overall. No critical bugs.
- Iteration 2: **99% overall** (backend 98%, frontend 100%). Zero bugs.
- Minor flags were non-bugs:
  - 409 overlap detection is correct behavior.

### Phase 3 — Hardening + UX Polish (production-friendly)
**Next active phase.**

1. Backend hardening:
   - Add indexes:
     - users.email unique
     - activities date ranges
     - reservations room_id+date
     - inventory_stock: (sucursal, article_key)
     - inventory_catalog: name_key
     - inventory_movements: created_at + sucursal
   - Tighten validation and consistent error responses (especially time ranges and overlaps).
   - Add pagination for:
     - notifications
     - activity_log
     - inventory movements / stock listing
   - Optional: add audit entries for key actions (reservation cancel, inventory movement creation).

2. Frontend polish:
   - Accessibility pass (focus states, keyboard navigation, reduced-motion behavior).
   - Skeleton loaders / empty states for:
     - Agenda, Inventario (stock/movements), Usuarios, Notifications
   - Deep-links from notifications to related activity/reservation (when related_id exists).
   - Refine global search UX:
     - Ctrl+K shortcut + focus management
     - data-testid coverage for open/close/results

3. Inventory (Inventario) productization:
   - Replace **sample article list** with the official catalog when provided.
   - Add bulk import UI for catalog (CSV upload) if requested.
   - Add role/area rule configurability (admin settings) if requested.
   - Consider per-user sucursal scoping (optional future) if requested.

4. Brand finalization:
   - Replace placeholder HERCO logo with official PNG/SVG when provided.
   - Confirm spacing/contrast compliance in both themes.

**Phase 3 user stories (minimum 5)**
1. Como usuario, quiero estados vacíos elegantes y carga fluida (skeletons) en Agenda e Inventario.
2. Como usuario, quiero que la app sea accesible (focus visible, teclado, contraste AA).
3. Como usuario, quiero buscar globalmente con atajos (Ctrl+K) y resultados claros.
4. Como usuario, quiero abrir una notificación y navegar al elemento relacionado.
5. Como auditor/gerente, quiero listas de inventario y movimientos con paginación y filtros robustos.

**End of Phase 3: Testing**
- Run 1 round of end-to-end testing focused on:
  - Inventory permissions + key flows (intake/movement/stock)
  - Reservation overlap edge cases
  - Notification deep links
  - Modal open/close reliability
  - Theme persistence + contrast

### Phase 4+ — Extensions (on request)
- Activate and expose **multiple meeting rooms** in UI/logic.
- Advanced agenda features (drag/drop, resize, recurring events, ICS export) if requested.
- Enhanced notification preferences (per-type toggles).
- Inventory extensions (as specified later by the user):
  - Multi-sucursal transfers (if needed) with optional add-to-destination semantics
  - Approval workflow for movements (if needed)
  - Reports/exports (PDF/Excel)

## 3) Next Actions
1. **Inventory catalog finalization:** user provides the official article list; replace sample catalog and seed.
2. **Brand finalization:** user provides official HERCO logo asset; swap placeholder.
3. **Polish/Hardening sprint (Phase 3):**
   - Add DB indexes
   - Add pagination and robust filters (inventory movements/stock)
   - Add skeleton/empty states
   - Add notification deep-links
   - Add Ctrl+K global search shortcut
4. Re-run Testing Agent after Phase 3 changes and capture screenshots for light/dark modes.

## 4) Success Criteria
- Premium SaaS look/feel maintained (no ERP/table-heavy UI).
- Registration is frictionless: cargo + área captured, immediate access, stable auth.
- Agenda/Sala de Juntas: click-to-create/reserve interactions feel fast and intuitive.
- Inventario:
  - Correct access control rules (backend + frontend)
  - Intake increases stock correctly
  - Movements (rebajas) deduct only from source sucursal and require descriptions
  - Tiendas view accurately reflects per-branch inventory
- Reliability improvements: no blocking overlays, consistent close behaviors, stable navigation.
- Accessibility: focus visible, keyboard friendly, WCAG AA contrast in both themes.
- End-to-end tests pass with no critical bugs (and improved stability in modal/search/inventory flows).