# Desplegar ValueVault en Netlify + Turso (gratis)

Arquitectura en producción:

```
Navegador ──► Netlify
               ├── Frontend estático (React)         → /
               └── Función serverless (Express)       → /api/*  ──► Turso (SQLite en la nube)
                       proxy Alpha Vantage + Yahoo
```

Todo gratis, datos persistentes (Turso), sin servidores que mantener. No hay que tocar código: solo crear cuentas y definir 3 variables de entorno.

---

## 1) Subir el proyecto a GitHub

Netlify despliega desde un repositorio. Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "ValueVault: app completa (React + serverless + Turso)"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/valuevault.git
git push -u origin main
```

> El `.gitignore` ya excluye `node_modules`, `.env` y la base local. Tu clave de Alpha Vantage NO se sube (está en `.env`, ignorado).

---

## 2) Crear la base de datos en Turso

1. Crea cuenta en **https://turso.tech** (gratis, login con GitHub).
2. Instala la CLI y crea la base (o hazlo desde el panel web):

```bash
# Instalar CLI (Windows: usar WSL o el instalador de su web)
turso auth login
turso db create valuevault
turso db show valuevault --url            # → libsql://valuevault-<org>.turso.io
turso db tokens create valuevault         # → un token largo
```

Apunta los dos valores: **la URL** (`libsql://…`) y **el token**.

> No hace falta crear tablas ni meter datos: la primera vez que se llame a la API, la función crea el esquema y siembra los 4 activos + 6 notas de ejemplo automáticamente.

---

## 3) Crear el sitio en Netlify

1. Entra en **https://netlify.com** (gratis, login con GitHub).
2. **Add new site → Import an existing project →** elige tu repo `valuevault`.
3. Netlify detecta `netlify.toml` solo. Confirma:
   - Build command: `npm install && npm --prefix frontend install && npm --prefix frontend run build`
   - Publish directory: `frontend/dist`
   - Functions directory: `netlify/functions`
4. Antes de desplegar, en **Site settings → Environment variables**, añade:

   | Variable | Valor |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://valuevault-….turso.io` (paso 2) |
   | `TURSO_AUTH_TOKEN` | el token de Turso (paso 2) |
   | `ALPHA_VANTAGE_KEY` | tu clave Alpha Vantage (`VAN3GADW10EX9IFT`) |

5. **Deploy site**. En ~1-2 min tendrás una URL tipo `https://tu-sitio.netlify.app`.

---

## 4) Comprobar

- Abre `https://tu-sitio.netlify.app` → debe cargar el Dashboard con los 4 activos.
- `https://tu-sitio.netlify.app/api/health` → `{"ok":true,...}`.
- Pulsa **"Actualizar precios"** → trae precios reales de Yahoo.
- Añade un activo y recarga → debe seguir ahí (persistencia en Turso ✓).

---

## Notas

- **Dominio propio:** Netlify permite cambiar el subdominio gratis (Site settings → Domain) o conectar un dominio tuyo.
- **Coste:** plan gratuito de Netlify (100 GB/mes, 125k invocaciones de función) y de Turso (500 DBs, 9 GB) — de sobra para uso personal.
- **Seguridad:** las claves viven solo como variables de entorno en Netlify, nunca en el repo. El frontend nunca ve la clave de Alpha Vantage (la usa la función).
- **Local sigue igual:** `cd backend && npm run dev` + `cd frontend && npm run dev`. En local se usa una base SQLite en fichero (`backend/data/valuevault.db`); en producción, Turso. El mismo código.
- **Cómo distingue el entorno:** si existe `TURSO_DATABASE_URL` usa Turso (cliente web, sin binario nativo); si no, fichero local.
```
