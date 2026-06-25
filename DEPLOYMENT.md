# 🚀 Guía de Despliegue — HERCO360

Stack de producción:
- **MongoDB Atlas** — base de datos
- **Cloudflare R2** — almacenamiento de archivos (informes Excel/Word, imágenes)
- **Render** — hosting del backend (FastAPI) y frontend (React)
- **GoDaddy** — dominio

> El código ya está preparado para este stack. Solo necesitas crear las cuentas,
> obtener credenciales y cargarlas como variables de entorno. **No hace falta tocar código.**

---

## ✅ Checklist de credenciales a obtener
| Servicio | Dato que necesitas |
|---|---|
| MongoDB Atlas | `MONGO_URL` (cadena de conexión SRV) |
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| Render | cuenta conectada a GitHub |
| GoDaddy | acceso al panel DNS de tu dominio |

---

## 1) MongoDB Atlas
1. Crea una cuenta en https://www.mongodb.com/atlas y un **cluster** (el gratuito M0 sirve para iniciar).
2. **Database Access** → crea un usuario con contraseña (rol *Read and write to any database*).
3. **Network Access** → agrega `0.0.0.0/0` (o las IPs de Render) para permitir la conexión.
4. **Connect → Drivers** → copia la cadena `mongodb+srv://...`. Esa es tu `MONGO_URL`.
5. Define `DB_NAME=herco360`.

## 2) Cloudflare R2
1. En el panel de Cloudflare → **R2** → *Create bucket* (ej. `herco360-reportes`).
2. Copia tu **Account ID** (aparece en R2; es tu `R2_ACCOUNT_ID`).
3. **Manage R2 API Tokens** → *Create API Token* con permiso **Object Read & Write** sobre ese bucket.
   - Te dará `Access Key ID` (= `R2_ACCESS_KEY_ID`) y `Secret Access Key` (= `R2_SECRET_ACCESS_KEY`).
4. El endpoint se arma solo: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` (no necesitas configurarlo salvo que uses uno personalizado en `R2_ENDPOINT`).

> Los archivos NO se hacen públicos: se descargan a través del backend con autenticación.

## 3) Subir el código a GitHub
```bash
git init && git add . && git commit -m "HERCO360"
git remote add origin https://github.com/TU_USUARIO/herco360.git
git push -u origin main
```
El repo ya incluye `render.yaml`, así que Render puede crear todo automáticamente.

## 4) Desplegar en Render (Blueprint)
1. En https://render.com → **New → Blueprint** → selecciona tu repo.
2. Render detecta `render.yaml` y propone 2 servicios: **herco360-api** y **herco360-web**.
3. Completa las variables marcadas (Environment) del **backend (herco360-api)**:
   - `MONGO_URL`, `CORS_ORIGINS`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
   - `DB_NAME=herco360`, `STORAGE_PROVIDER=r2`, `JWT_SECRET` (autogenerada)
4. En el **frontend (herco360-web)** define:
   - `REACT_APP_BACKEND_URL` = URL del backend (al inicio usa la de Render, ej. `https://herco360-api.onrender.com`).
5. **Deploy**. Cuando el backend esté arriba, comprueba `https://herco360-api.onrender.com/api/` → debe responder `{"message":"HERCO360 API","status":"ok"}`.

> Nota: para subir informes de hasta **50 MB** sin cortes usa un plan **Starter** o superior en el backend (el plan Free tiene límites de memoria/tiempo).

## 5) Dominio en GoDaddy + Render
Recomendado: dominio para el frontend y subdominio para la API.
- Frontend: `app.tudominio.com` (o `tudominio.com`)
- Backend: `api.tudominio.com`

**En Render:** en cada servicio → *Settings → Custom Domains* → agrega el dominio. Render te dirá qué registro crear.

**En GoDaddy** (DNS Management) agrega:
| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `api` | `herco360-api.onrender.com` |
| CNAME | `app` | `herco360-web.onrender.com` |

> Si usas el dominio raíz (`tudominio.com`) para el frontend, sigue la instrucción de Render
> (suele pedir un registro `A`/`ALIAS` o usar `www` con CNAME). Render valida y emite el **SSL** automáticamente.

## 6) Ajuste final (importante)
Una vez que el dominio funcione, actualiza y vuelve a desplegar:
- Backend `CORS_ORIGINS` = `https://app.tudominio.com`
- Frontend `REACT_APP_BACKEND_URL` = `https://api.tudominio.com`
  (cambiar esta variable requiere **re-build** del frontend en Render).

---

## 🔓 Acceso público a la Sala de Juntas (sin cuenta)
Hay una página pública para que cualquier persona reserve la sala **sin iniciar sesión**:
- URL: `https://app.tudominio.com/sala`  (en preview: `.../sala`)
- Solo pide el **nombre** para reservar. El invitado puede **cancelar su propia reserva**
  (se guarda un token en su navegador). Los **lunes** siguen bloqueados para Dirección Comercial.
- Estas reservas también aparecen en la Sala de Juntas interna para el personal con cuenta.
- Comparte ese enlace (o un acceso directo / QR) con quienes no tendrán usuario.

## 🔐 Primer usuario administrador
El registro crea usuarios normales (auto-aprobados). Para tener un **admin**, tras el primer
registro marca tu usuario como admin en Atlas:
```js
// En MongoDB Atlas → Collections → base "herco360" → colección "users"
db.users.updateOne({ email: "tu-correo@herco.com" }, { $set: { role: "admin" } })
```

## 🧪 Verificación post-deploy
- [ ] `GET /api/` responde OK.
- [ ] Puedes registrarte e iniciar sesión.
- [ ] En **Reportes**, subes un Excel/Word y lo vuelves a **descargar** (valida R2).
- [ ] En **Sala de Juntas**, los **lunes** aparecen bloqueados.
- [ ] En **Agenda**, una actividad **recurrente** genera la serie.
- [ ] El SSL (candado) está activo en ambos dominios.

## ℹ️ Notas técnicas
- El backend elige el almacenamiento solo: si hay credenciales R2 (o `STORAGE_PROVIDER=r2`) usa **R2**;
  en el preview de Emergent usa el almacenamiento interno. No requiere cambios de código.
- Variables sensibles nunca van al repo (usa `.env.example` como plantilla).
- El backend escucha en `$PORT` (lo define Render). El frontend es un sitio estático (build de CRA).
