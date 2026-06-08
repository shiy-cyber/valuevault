# ValueVault — Plataforma de Activos

Aplicación web completa de gestión e inteligencia de activos de inversión.
Migración del HTML único a una arquitectura **frontend React + backend Express (serverless) + libSQL/Turso**, conservando íntegramente el diseño original (dorado/verde/rojo, Playfair Display + DM Mono, dark/light) y añadiendo integraciones reales de datos.

```
valuevault/
├── backend/          Lógica de la API (Express, reutilizable local + serverless)
│   ├── app.js        createApp(): todas las rutas (assets, notes, config, lookup, sectors…)
│   ├── server.js     Arranque LOCAL (escucha en :3001)
│   ├── db.js         libSQL: file: en local · Turso en producción · esquema + semilla
│   ├── alphavantage.js  Proxy de Alpha Vantage (clave en servidor, llamadas ≤1 req/s)
│   ├── sectors.js    Yahoo v8: sectores, cotización, histórico
│   └── .env          ALPHA_VANTAGE_KEY, PORT
├── netlify/functions/
│   └── api.js        Función serverless: envuelve app.js con serverless-http
├── frontend/         SPA React + Vite + Chart.js
│   └── src/          App.jsx · components/ · lib/ · data/constants.js · styles.css
├── package.json      Deps de las funciones (libSQL, express, serverless-http)
├── netlify.toml      Build + funciones + redirect /api/* + SPA fallback
└── DEPLOY.md         Guía de despliegue (GitHub → Turso → Netlify)
```

## Características

- **Dashboard** — KPIs (activos, **rendimiento medio / P&L %**, riesgo bajo, notas) + últimos activos expandibles + **botón "Actualizar precios"** (Yahoo en vivo).
- **Mis Activos** — filas con ~30 métricas (valoración, EPS, calidad, solidez, dividendo, mercado), **gráfico histórico de precio** al expandir (1M/6M/1A/5A), filtros por estrategia / horizonte / riesgo, enlaces a insiders (OpenInsider, WhaleWisdom, Finviz, SEC EDGAR).
- **Watchlist** — lista de seguimiento separada de la cartera (activos vigilados sin poseer, marcados con ★).
- **Comparador** — enfrenta 2-3 activos métrica a métrica resaltando el mejor (verde) y el peor (rojo) según la dirección de cada ratio.
- **Gráficos** — donuts (Chart.js) por estrategia, sector, riesgo y horizonte.
- **Stock Screener** — abre **Finviz** con los filtros aplicados en la URL, más Yahoo Finance y Stock Analysis, y 6 herramientas complementarias.
- **Aprendizaje** — notas vinculables a activos, búsqueda y filtro por tema.
- **Tendencias** — heatmap + líneas + barras + tabla de los 10 ETFs sectoriales (XLK, XLV, XLF, XLE, XLY, XLI, XLRE, XLU, XLB, XLC) con **datos reales de Yahoo Finance** y periodos 1m/3m/6m/1y/YTD.
- **Macro Research** — 37 fuentes organizadas en 6 categorías.
- **Autocompletado de tickers** vía **Alpha Vantage** (precio, P/E, P/B, PEG, EV/EBITDA, P/Sales, EPS, ROE, ROA, márgenes, Beta, 52W High/Low, Market Cap).
- Persistencia en **SQLite** (activos, notas, configuración/tema). Export a JSON y reset.
- **Responsive** con sidebar colapsable en móvil. Dark/Light con preferencia persistida.

## Integraciones de datos

| Integración | Cómo | Notas |
|---|---|---|
| **Alpha Vantage** | `GET /api/lookup/:ticker` (proxy servidor) | Clave en `backend/.env`. Plan gratuito = **25 peticiones/día**; al agotarse devuelve un aviso (gestionado en la UI). |
| **Yahoo Finance** | `GET /api/sectors` y `/api/quote/:symbol` | Endpoint público `query1.finance.yahoo.com/v8/finance/chart`, sin clave ni límite. Cache de 10 min en servidor. |

## Puesta en marcha local

Requisito: **Node ≥ 22** (usa `node:sqlite` integrado, sin dependencias nativas).

### 1) Backend
```powershell
cd backend
npm install
npm run dev          # o npm start  →  http://localhost:3001
```
La base de datos se crea y se siembra automáticamente en `backend/data/valuevault.db` (4 activos + 6 notas).

### 2) Frontend
```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173
```
En desarrollo, Vite hace **proxy de `/api`** al backend (`:3001`), así que no hay que tocar CORS.

Abre **http://localhost:5173**.

## Despliegue gratuito — TODO en Netlify + Turso

El backend corre como **función serverless de Netlify** (`netlify/functions/api.js`, que envuelve la misma app Express con `serverless-http`) y la base de datos vive en **Turso** (SQLite en la nube). Una sola plataforma, datos persistentes, sin servidores que dormir.

👉 **Guía paso a paso en [`DEPLOY.md`](./DEPLOY.md)** (GitHub → Turso → Netlify + variables de entorno).

Resumen: defines en Netlify `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `ALPHA_VANTAGE_KEY`; `netlify.toml` ya configura el build, las funciones y el redirect `/api/* → función`. La primera petición crea el esquema y siembra los datos en Turso automáticamente.

> En **local** se usa una base SQLite en fichero (`backend/data/valuevault.db`); en **producción**, Turso. Lo decide la variable `TURSO_DATABASE_URL`. Mismo código.

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado |
| GET/POST | `/api/assets` | Listar / crear activo |
| PUT/DELETE | `/api/assets/:id` | Actualizar / borrar |
| GET/POST | `/api/notes` | Listar / crear nota |
| DELETE | `/api/notes/:id` | Borrar nota |
| GET | `/api/config` · PUT `/api/config/:key` | Configuración (tema) |
| GET | `/api/export` | Backup JSON |
| POST | `/api/assets/refresh-prices` | Actualiza el precio de toda la cartera (Yahoo) |
| GET | `/api/lookup/:ticker` | Alpha Vantage (llamadas secuenciales, ≤1 req/s) |
| GET | `/api/sectors` | Tendencias sectoriales (Yahoo) |
| GET | `/api/quote/:symbol` | Cotización puntual (Yahoo) |
| GET | `/api/history/:symbol?range=` | Histórico de precio (1mo/6mo/1y/5y) para el gráfico |
