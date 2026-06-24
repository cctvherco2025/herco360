{
  "brand": {
    "product_name": "HERCO360 - Plataforma Corporativa HERCO",
    "design_personality": [
      "premium enterprise SaaS (Linear/Stripe-like)",
      "minimalista, respirable, productivo",
      "elegante (sin look ERP)",
      "calendario-first (Agenda como módulo principal)",
      "light-mode first con dark-mode premium"
    ],
    "ui_language": "es-ES",
    "do_not": [
      "No tablas como layout principal (solo cuando sea estrictamente necesario)",
      "No look Bootstrap/ERP clásico",
      "No contenedores centrados tipo landing",
      "No gradients oscuros/saturados (ver reglas al final)",
      "No usar transition: all"
    ]
  },

  "typography": {
    "google_fonts": {
      "heading": {
        "family": "Space Grotesk",
        "weights": ["400", "500", "600", "700"],
        "usage": "H1/H2, títulos de módulos, números KPI"
      },
      "body": {
        "family": "IBM Plex Sans",
        "weights": ["400", "500", "600"],
        "usage": "UI general, labels, tablas puntuales, formularios"
      }
    },
    "tailwind_font_setup": {
      "note": "En index.css importar Google Fonts y setear font-family en body. Mantener fallback system-ui.",
      "body_class": "font-[var(--font-body)]",
      "heading_class": "font-[var(--font-heading)] tracking-[-0.02em]"
    },
    "type_scale": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-[-0.03em]",
      "h2": "text-base md:text-lg font-medium text-muted-foreground",
      "section_title": "text-lg font-semibold",
      "card_title": "text-sm font-medium",
      "kpi_number": "text-2xl font-semibold tracking-[-0.02em]",
      "body": "text-sm md:text-base",
      "caption": "text-xs text-muted-foreground"
    }
  },

  "color_system": {
    "institutional_palette_hex": {
      "primary_navy": "#1e395e",
      "secondary_light_blue": "#3cbef6",
      "secondary_cyan": "#00a5df",
      "accent_yellow": "#fed300",
      "accent_orange": "#ec9032",
      "complement_maroon": "#712146",
      "neutral_gray": "#8a8b8b",
      "black": "#000000",
      "white": "#ffffff"
    },
    "semantic_tokens_light": {
      "background": "#f6f7fb",
      "surface": "#ffffff",
      "surface_2": "#fbfcff",
      "text": "#0b1220",
      "text_muted": "#5b667a",
      "border": "rgba(30,57,94,0.12)",
      "ring": "rgba(60,190,246,0.45)",
      "primary": "#1e395e",
      "primary_hover": "#162c49",
      "primary_foreground": "#ffffff",
      "accent": "#00a5df",
      "accent_hover": "#0093c7",
      "warning": "#fed300",
      "warning_foreground": "#1e395e",
      "success": "#16a34a",
      "danger": "#dc2626",
      "info": "#3cbef6"
    },
    "semantic_tokens_dark": {
      "background": "#0b1220",
      "surface": "#0f1a2e",
      "surface_2": "#101f36",
      "text": "#eef3ff",
      "text_muted": "rgba(238,243,255,0.72)",
      "border": "rgba(60,190,246,0.16)",
      "ring": "rgba(60,190,246,0.35)",
      "primary": "#3cbef6",
      "primary_hover": "#2aaee6",
      "primary_foreground": "#07101d",
      "accent": "#fed300",
      "accent_hover": "#f3c800",
      "warning": "#ec9032",
      "warning_foreground": "#07101d",
      "success": "#22c55e",
      "danger": "#ef4444",
      "info": "#00a5df"
    },
    "event_category_colors": {
      "Reunión": {
        "solid": "#00a5df",
        "tint_bg_light": "rgba(0,165,223,0.12)",
        "tint_bg_dark": "rgba(0,165,223,0.18)"
      },
      "Auditoría": {
        "solid": "#712146",
        "tint_bg_light": "rgba(113,33,70,0.10)",
        "tint_bg_dark": "rgba(113,33,70,0.22)"
      },
      "Capacitación": {
        "solid": "#fed300",
        "tint_bg_light": "rgba(254,211,0,0.18)",
        "tint_bg_dark": "rgba(254,211,0,0.16)"
      },
      "Seguimiento": {
        "solid": "#3cbef6",
        "tint_bg_light": "rgba(60,190,246,0.14)",
        "tint_bg_dark": "rgba(60,190,246,0.18)"
      },
      "Reporte": {
        "solid": "#1e395e",
        "tint_bg_light": "rgba(30,57,94,0.10)",
        "tint_bg_dark": "rgba(30,57,94,0.28)"
      },
      "Personal": {
        "solid": "#ec9032",
        "tint_bg_light": "rgba(236,144,50,0.14)",
        "tint_bg_dark": "rgba(236,144,50,0.18)"
      }
    },
    "meeting_room_states": {
      "Disponible": {
        "solid": "#16a34a",
        "icon": "CheckCircle",
        "badge_variant": "success"
      },
      "Ocupada": {
        "solid": "#dc2626",
        "icon": "XCircle",
        "badge_variant": "destructive"
      },
      "Reservada": {
        "solid": "#00a5df",
        "icon": "Bookmark",
        "badge_variant": "info"
      },
      "Cancelada": {
        "solid": "#8a8b8b",
        "icon": "Ban",
        "badge_variant": "secondary"
      },
      "Finalizada": {
        "solid": "#1e395e",
        "icon": "Flag",
        "badge_variant": "outline"
      }
    },
    "allowed_gradients": {
      "hero_header_only_max_20vh": [
        "linear-gradient(135deg, rgba(60,190,246,0.18), rgba(0,165,223,0.10), rgba(254,211,0,0.10))",
        "radial-gradient(600px circle at 20% 10%, rgba(254,211,0,0.18), transparent 55%), radial-gradient(700px circle at 80% 0%, rgba(60,190,246,0.16), transparent 60%)"
      ],
      "logo_sphere": "radial-gradient(circle at 30% 30%, #fed300 0%, #ec9032 55%, rgba(236,144,50,0.0) 72%)"
    }
  },

  "design_tokens_css": {
    "instructions": "Crear/actualizar tokens en /app/frontend/src/index.css dentro de :root y .dark. Mantener shadcn variables HSL pero mapearlas a HERCO. Evitar gradients en áreas de lectura.",
    "css_variables": {
      "fonts": {
        "--font-heading": "'Space Grotesk', ui-sans-serif, system-ui",
        "--font-body": "'IBM Plex Sans', ui-sans-serif, system-ui"
      },
      "radius": {
        "--radius": "14px",
        "--radius-sm": "10px",
        "--radius-lg": "18px"
      },
      "shadows_light": {
        "--shadow-xs": "0 1px 0 rgba(30,57,94,0.06)",
        "--shadow-sm": "0 6px 18px rgba(30,57,94,0.08)",
        "--shadow-md": "0 14px 40px rgba(30,57,94,0.10)",
        "--shadow-float": "0 18px 60px rgba(30,57,94,0.14)"
      },
      "shadows_dark": {
        "--shadow-sm": "0 10px 30px rgba(0,0,0,0.35)",
        "--shadow-md": "0 18px 60px rgba(0,0,0,0.45)",
        "--shadow-float": "0 22px 70px rgba(0,0,0,0.55)"
      },
      "spacing": {
        "--page-gutter": "clamp(16px, 3vw, 28px)",
        "--card-pad": "18px",
        "--card-pad-lg": "22px"
      }
    },
    "noise_overlay_css": "/* optional subtle grain */\n.noise-overlay{position:relative;}\n.noise-overlay:before{content:'';position:absolute;inset:0;pointer-events:none;background-image:url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"120\" height=\"120\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.9\" numOctaves=\"3\" stitchTiles=\"stitch\"/></filter><rect width=\"120\" height=\"120\" filter=\"url(%23n)\" opacity=\"0.08\"/></svg>');mix-blend-mode:soft-light;opacity:.35;border-radius:inherit;}"
  },

  "layout": {
    "grid": {
      "desktop": "12-col, max-w-[1280px] para contenido principal (pero NO centrar todo el app; solo centrar el contenido dentro del área main)",
      "main_shell": "Sidebar flotante + header sticky + main scrollable",
      "page_padding": "px-[var(--page-gutter)] py-6",
      "cards": "gap-4 md:gap-6"
    },
    "shell_structure": {
      "sidebar": {
        "style": "floating pill sidebar (muy redondeada), con blur sutil y sombra",
        "width": "w-[264px] (expanded), w-[76px] (collapsed rail)",
        "position": "fixed left-4 top-4 bottom-4",
        "container_classes": "rounded-[22px] bg-white/80 dark:bg-[color:var(--surface)]/70 backdrop-blur-xl border border-[color:var(--border)] shadow-[var(--shadow-float)]",
        "sections": [
          "Logo/Workspace (arriba)",
          "Nav principal (Inicio, Agenda, Sala de Juntas, Usuarios, Configuración)",
          "CTA 'Nueva actividad' (sticky near bottom)",
          "User card (abajo)"
        ]
      },
      "header": {
        "style": "top header minimal, sticky, con search central y acciones a la derecha",
        "position": "sticky top-0 z-30",
        "container_classes": "bg-transparent",
        "inner_bar_classes": "mt-4 rounded-[18px] bg-white/70 dark:bg-[color:var(--surface)]/60 backdrop-blur-xl border border-[color:var(--border)] shadow-[var(--shadow-sm)] px-3 md:px-4 py-2 flex items-center gap-2"
      },
      "main": {
        "style": "área principal con cards flotantes y mucho whitespace",
        "classes": "min-h-screen pl-[92px] md:pl-[304px] pr-4 md:pr-6"
      }
    }
  },

  "components": {
    "component_path": {
      "button": "/app/frontend/src/components/ui/button.jsx",
      "card": "/app/frontend/src/components/ui/card.jsx",
      "badge": "/app/frontend/src/components/ui/badge.jsx",
      "avatar": "/app/frontend/src/components/ui/avatar.jsx",
      "input": "/app/frontend/src/components/ui/input.jsx",
      "dropdown_menu": "/app/frontend/src/components/ui/dropdown-menu.jsx",
      "popover": "/app/frontend/src/components/ui/popover.jsx",
      "dialog": "/app/frontend/src/components/ui/dialog.jsx",
      "sheet": "/app/frontend/src/components/ui/sheet.jsx",
      "tabs": "/app/frontend/src/components/ui/tabs.jsx",
      "calendar": "/app/frontend/src/components/ui/calendar.jsx",
      "command": "/app/frontend/src/components/ui/command.jsx",
      "scroll_area": "/app/frontend/src/components/ui/scroll-area.jsx",
      "separator": "/app/frontend/src/components/ui/separator.jsx",
      "switch": "/app/frontend/src/components/ui/switch.jsx",
      "sonner_toast": "/app/frontend/src/components/ui/sonner.jsx"
    },
    "button_system": {
      "shape": "Professional / Corporate con toque premium: radius 10-12px, altura cómoda",
      "primary": {
        "classes": "rounded-[12px] bg-[color:var(--primary)] text-white shadow-[var(--shadow-xs)] hover:bg-[color:var(--primary_hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        "micro_interaction": "hover: translateY(-1px) + shadow-sm; active: scale(0.98)"
      },
      "secondary": {
        "classes": "rounded-[12px] bg-white text-[color:var(--primary)] border border-[color:var(--border)] hover:bg-[color:var(--surface_2)]",
        "micro_interaction": "hover: shadow-xs; active: scale(0.99)"
      },
      "ghost": {
        "classes": "rounded-[12px] hover:bg-[rgba(60,190,246,0.10)] text-[color:var(--text)]",
        "micro_interaction": "hover: subtle background wash"
      }
    },
    "card_system": {
      "base_classes": "rounded-[18px] bg-white dark:bg-[color:var(--surface)] border border-[color:var(--border)] shadow-[var(--shadow-sm)]",
      "hover": "hover:shadow-[var(--shadow-md)] hover:-translate-y-[1px] transition-[box-shadow,transform] duration-200",
      "header": "flex items-start justify-between gap-3",
      "kpi_icon": "size-10 rounded-full grid place-items-center bg-[rgba(60,190,246,0.14)] text-[color:var(--primary)]"
    },
    "inputs": {
      "search": {
        "pattern": "Command palette style (shadcn Command) + Input fallback",
        "classes": "h-10 rounded-[14px] bg-white/70 dark:bg-[color:var(--surface_2)]/70 border border-[color:var(--border)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        "placeholder": "Buscar actividades, usuarios, salas…"
      }
    }
  },

  "calendar_agenda": {
    "primary_module": true,
    "views": ["Día", "Semana", "Mes"],
    "view_toggle": {
      "component": "Tabs",
      "classes": "rounded-[14px] bg-white/70 dark:bg-[color:var(--surface)]/60 backdrop-blur border border-[color:var(--border)] p-1"
    },
    "month_grid": {
      "cell": {
        "classes": "rounded-[14px] border border-[color:var(--border)] bg-white dark:bg-[color:var(--surface)] p-2 min-h-[112px]",
        "hover": "hover:shadow-[var(--shadow-sm)] transition-[box-shadow] duration-200"
      },
      "day_number": "text-xs font-medium text-[color:var(--text_muted)]",
      "event_chip": {
        "classes": "mt-1 w-full rounded-full px-2 py-1 text-xs font-medium truncate border",
        "structure": "left color-dot + title + optional time",
        "max_visible": 3,
        "overflow_indicator": "text-xs text-[color:var(--text_muted)] mt-1"
      }
    },
    "week_day_timeline": {
      "time_rail": "sticky left column with hours",
      "now_indicator": "thin line + dot using accent cyan",
      "event_block": {
        "classes": "rounded-[14px] px-2 py-1.5 shadow-[var(--shadow-xs)] border",
        "interaction": "hover expands slightly; click opens quick-view popover; double click opens edit dialog"
      }
    },
    "legend": {
      "placement": "right side panel on desktop; collapsible Sheet on mobile",
      "component": "Badge + Separator",
      "classes": "flex flex-wrap gap-2"
    },
    "create_edit_modal": {
      "component": "Dialog",
      "opening_motion": "framer-motion scale(0.98)->1 + fade, 180-220ms",
      "fields": [
        "Título",
        "Categoría (Select)",
        "Fecha y hora (Calendar + time inputs)",
        "Participantes (Command multi-select)",
        "Sala (opcional)",
        "Notas (Textarea)"
      ],
      "footer_actions": ["Cancelar", "Guardar actividad"],
      "data_testids": {
        "open": "agenda-new-activity-button",
        "title": "activity-form-title-input",
        "category": "activity-form-category-select",
        "date": "activity-form-date-picker",
        "participants": "activity-form-participants-command",
        "submit": "activity-form-submit-button"
      }
    }
  },

  "pages": {
    "auth": {
      "login_register": {
        "layout": "split-screen en desktop (izq: branding, der: form). En mobile: stacked.",
        "background": "muy claro con overlay de noise + 2 blobs suaves (cyan/yellow) en esquinas (max 20% viewport)",
        "card": "glass card: bg-white/70 backdrop-blur-xl border border-[color:var(--border)] rounded-[22px] shadow-[var(--shadow-float)]",
        "logo": "HERCO wordmark + esfera gradiente amarillo->naranja",
        "pending_approval_state": "pantalla con Card + Badge 'Pendiente de aprobación' + CTA 'Cerrar sesión'"
      }
    },
    "dashboard_inicio": {
      "header_copy": "Buenos días, Kevin",
      "sections": [
        "4 KPI cards (Actividades de hoy, Próximas actividades/Notificaciones, Estado Sala de Juntas, Usuarios pendientes)",
        "Timeline de hoy (cards apiladas, no tabla)",
        "Actividad reciente (feed con avatars + time-ago)",
        "Mini calendario semanal con toggle Día/Semana/Mes + CTA Nueva actividad"
      ]
    },
    "agenda": {
      "layout": "main calendar + right rail (legend + upcoming list). En mobile: right rail en Sheet.",
      "primary_actions": ["Nueva actividad", "Hoy", "Cambiar vista"],
      "empty_state": "Ilustración abstracta suave + copy: 'No hay actividades programadas' + CTA"
    },
    "sala_de_juntas": {
      "layout": "hero card con estado actual + grid de salas (si aplica) + lista de reservas",
      "status_card": "large card con badge de estado + próximos bloques horarios",
      "reservation_create": "Dialog desde botón 'Reservar sala'"
    },
    "usuarios": {
      "layout": "cards de usuario (Avatar + rol + estado) + panel 'Pendientes'",
      "actions": "Aprobar/Rechazar con botones compactos",
      "avoid": "no tabla como vista principal"
    },
    "configuracion": {
      "layout": "two-column settings (nav izquierda en desktop, tabs en mobile)",
      "sections": ["Perfil", "Preferencias", "Notificaciones", "Seguridad"]
    }
  },

  "motion": {
    "library": "framer-motion",
    "principles": [
      "Transiciones cortas (160-220ms) para hover/press",
      "Modales: fade + scale",
      "Sidebar collapse: width + opacity stagger",
      "Theme toggle: crossfade + subtle background wash"
    ],
    "recommended_variants": {
      "card_hover": "whileHover={{ y: -2 }} transition={{ duration: 0.18 }}",
      "modal": "initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}"
    },
    "no_universal_transition": true
  },

  "accessibility": {
    "requirements": [
      "WCAG AA contrast (especialmente en dark mode)",
      "Focus visible: ring 2px con --ring",
      "Targets táctiles >= 44px",
      "prefers-reduced-motion: reducir animaciones no esenciales",
      "Estados (Disponible/Ocupada/etc) no solo por color: incluir icono + texto"
    ]
  },

  "data_testid_policy": {
    "rule": "Todos los elementos interactivos y elementos informativos clave deben incluir data-testid en kebab-case.",
    "examples": [
      "data-testid=\"topbar-global-search\"",
      "data-testid=\"topbar-notifications-button\"",
      "data-testid=\"topbar-theme-toggle\"",
      "data-testid=\"sidebar-nav-agenda\"",
      "data-testid=\"dashboard-today-activities-card\"",
      "data-testid=\"meeting-room-status-badge\""
    ]
  },

  "image_urls": {
    "auth_background": [
      {
        "url": "https://images.unsplash.com/photo-1651488829517-95af02975dd5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MDV8MHwxfHNlYXJjaHwxfHxzb2Z0JTIwZ2xhc3Ntb3JwaGlzbSUyMGFic3RyYWN0JTIwYmFja2dyb3VuZCUyMGxpZ2h0fGVufDB8fHx0ZWFsfDE3ODIyNTk3Mjl8MA&ixlib=rb-4.1.0&q=85",
        "description": "Fondo abstracto suave para Login/Register (usar con overlay blanco y blur; no competir con el formulario)."
      }
    ],
    "logo_sphere_reference": [
      {
        "url": "https://images.unsplash.com/photo-1658998765625-8fb3f5bfeb97?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTB8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZ3JhZGllbnQlMjBzcGhlcmUlMjBhYnN0cmFjdHxlbnwwfHx8eWVsbG93fDE3ODIyNTk3MjR8MA&ixlib=rb-4.1.0&q=85",
        "description": "Referencia visual para esfera/elemento circular del logo (amarillo->naranja)."
      }
    ],
    "dashboard_ambient": [
      {
        "url": "https://images.pexels.com/photos/28035054/pexels-photo-28035054.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "description": "Imagen ambiental opcional (muy sutil) para empty states o panel lateral; usar con opacidad baja y blur."
      }
    ]
  },

  "instructions_to_main_agent": [
    "Actualizar /app/frontend/src/App.css: eliminar estilos CRA demo (App-header etc) y dejarlo vacío o solo utilidades específicas del shell.",
    "Actualizar /app/frontend/src/index.css: reemplazar tokens :root/.dark por el sistema HERCO (mantener estructura shadcn).",
    "Implementar layout shell: Sidebar flotante fixed + Header sticky + Main con padding-left responsivo.",
    "Usar shadcn/ui para: Dialog, DropdownMenu, Command (búsqueda global), Tabs (Día/Semana/Mes), Calendar (date picker), Sonner (toasts).",
    "Agenda: construir Month/Week/Day views custom (div grid) con chips; NO usar tablas. Inspiración Google Calendar solo en experiencia visual.",
    "Añadir data-testid a: navegación, botones principales, inputs, toggles, badges de estado, cards KPI, items de timeline, items de feed.",
    "Micro-interacciones: hover lift en cards, press scale en botones, modal opening con framer-motion, theme toggle con crossfade.",
    "Dark mode: fondo profundo azul-negro (#0b1220) + cards #0f1a2e; mantener acentos HERCO sin gradients oscuros."
  ],

  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>  \n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
