// ─────────────────────────────────────────────────────────────
// Base de datos vía libSQL (@libsql/client).
// El MISMO cliente sirve para:
//   · Local        → file:./data/valuevault.db
//   · Producción   → Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)
// API asíncrona. Persiste activos, notas y configuración.
// ─────────────────────────────────────────────────────────────
// En producción (Turso) usamos el cliente web (JS puro, sin binario nativo,
// ideal para serverless). En local, el cliente nativo con modo file:.
const remote = !!process.env.TURSO_DATABASE_URL;
const url = process.env.TURSO_DATABASE_URL || 'file:./data/valuevault.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

// Cliente con init PEREZOSO (sin top-level await) → permite empaquetar como
// CommonJS en Netlify, que es lo que espera su arranque de funciones.
let _db;
async function getDb() {
  if (_db) return _db;
  let createClient;
  if (remote) {
    ({ createClient } = await import('@libsql/client/web')); // literal → empaquetable (JS puro)
  } else {
    const localPkg = '@libsql/client';
    ({ createClient } = await import(localPkg));              // variable → solo local (nativo)
  }
  _db = createClient(authToken ? { url, authToken } : { url });
  return _db;
}

// ─── Helpers asíncronos ──────────────────────────────────────
export const get = async (sql, args = []) => (await (await getDb()).execute({ sql, args })).rows[0] ?? null;
export const all = async (sql, args = []) => (await (await getDb()).execute({ sql, args })).rows;
export const run = async (sql, args = []) => {
  const r = await (await getDb()).execute({ sql, args });
  return {
    changes: Number(r.rowsAffected || 0),
    lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
  };
};

// ─── Columnas numéricas/JSON para (de)serialización ──────────
// shares = tamaño de posición · target/stop = precio objetivo / invalidación
// fxEntry = tipo de cambio (EUR por 1 ud. de la divisa del activo) en la compra
// roic = retorno sobre capital invertido · fcfy = FCF yield (%) · wacc = coste medio de capital (%)
// targetMean = precio objetivo medio de analistas · numAnalysts = nº de analistas
export const ASSET_NUM = ['price','current','pe','fpe','pb','peg','evebitda','ps','eps','epsd','epsny','epsg','roe','roa','gm','om','nm','de','cr','qr','dy','pr','beta','w52h','w52l','shares','target','stop','fxEntry','roic','fcfy','wacc','epsRev','targetMean','numAnalysts'];
// currency = divisa del activo · engine = motor de alfa (momentum/value/hidden)
// catalyst/catalystDate = catalizador y su fecha · recommendation = consenso analistas
export const ASSET_TXT = ['ticker','name','sector','market','mcap','risk','thesis','currency','engine','catalyst','catalystDate','recommendation','description'];
export const ASSET_JSON = ['strategies','time'];

// Parseo tolerante de JSON persistido (no rompe la fila si el dato es inválido)
const safeJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export function rowToAsset(r) {
  if (!r) return null;
  return {
    ...r,
    strategies: JSON.parse(r.strategies || '[]'),
    time: JSON.parse(r.time || '[]'),
    // CapEx: columnas independientes (no en ASSET_JSON → no las pisa el formulario de edición)
    capexHistory: safeJson(r.capexHistory, []),
    capexNarrative: safeJson(r.capexNarrative, null),
    earningsSurprises: safeJson(r.earningsSurprises, null),
  };
}
export function rowToNote(r) {
  if (!r) return null;
  return { ...r, tags: JSON.parse(r.tags || '[]') };
}

// ─── Comunidad: serializador de USUARIO PÚBLICO (anti-fuga) ──────────────
// Columnas que SÍ se pueden exponer. Jamás se devuelve email/passwordHash/
// recoveryHash al cliente. TODO endpoint de comunidad que muestre autor/perfil
// debe usar PUBLIC_USER_COLS + rowToPublicUser; nunca `SELECT *` de users.
export const PUBLIC_USER_COLS = 'id, displayName, handle, avatar, bio, created_at';
export function rowToPublicUser(r) {
  if (!r) return null;
  return {
    id: Number(r.id),
    displayName: r.displayName || null,
    handle: r.handle || null,
    avatar: r.avatar || null,
    bio: r.bio || null,
    joinedAt: r.created_at || null,
  };
}
export async function getPublicUserById(id) {
  return rowToPublicUser(await get(`SELECT ${PUBLIC_USER_COLS} FROM users WHERE id = ?`, [Number(id)]));
}
export async function getPublicUserByHandle(handle) {
  return rowToPublicUser(await get(`SELECT ${PUBLIC_USER_COLS} FROM users WHERE handle = ?`, [String(handle || '').trim().toLowerCase()]));
}

// ─── Memoria GLOBAL de narrativas CapEx (compartida entre usuarios) ──────
// Clave (ticker, ejercicio fiscal). Es dato de empresa pública, no del usuario:
// un informe se genera una sola vez para toda la app y se reutiliza sin coste
// hasta que haya un ejercicio más reciente.
export async function getCapexReport(ticker, fiscalYear) {
  const r = await get('SELECT data FROM capex_reports WHERE ticker = ? AND fiscalYear = ?', [String(ticker), String(fiscalYear)]);
  return r ? safeJson(r.data, null) : null;
}
export async function saveCapexReport(ticker, fiscalYear, data) {
  await run('INSERT OR REPLACE INTO capex_reports (ticker, fiscalYear, data) VALUES (?, ?, ?)', [String(ticker), String(fiscalYear), JSON.stringify(data)]);
}

// ─── Caché GLOBAL kv en BD (compartida entre usuarios) ──────────────────
// Tabla genérica (cacheKey, data, fetchedAt) usada por DOS capas:
//   · avCache.js  → Alpha Vantage, claves `${function}:${TICKER}` (cuota 25/día).
//   · cache.js    → Yahoo (quotes/estimates), claves `YQUOTE:`/`YEST:` (resiliencia).
// Guarda la respuesta + fetchedAt; una llamada sirve para toda la app hasta que
// caduca su TTL, y ante fallo de la fuente se reutiliza la última copia conocida.
export async function getAvCache(key) {
  const r = await get('SELECT data, fetchedAt FROM av_cache WHERE cacheKey = ?', [String(key)]);
  return r ? { data: safeJson(r.data, null), fetchedAt: r.fetchedAt } : null;
}
export async function saveAvCache(key, data, fetchedAt) {
  await run('INSERT OR REPLACE INTO av_cache (cacheKey, data, fetchedAt) VALUES (?, ?, ?)',
    [String(key), JSON.stringify(data), fetchedAt]);
}

// ─── Esquema + migraciones (idempotente) ─────────────────────
async function ensureColumn(table, col, decl) {
  const cols = await all(`PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === col)) {
    try {
      await (await getDb()).execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    } catch (e) {
      // Carrera entre cold-starts concurrentes: otra instancia ya la añadió.
      if (!/duplicate column/i.test(e.message || '')) throw e;
    }
  }
}

export async function initSchema() {
  await (await getDb()).executeMultiple(`
    CREATE TABLE IF NOT EXISTS assets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker    TEXT NOT NULL,
      name      TEXT NOT NULL,
      sector    TEXT,
      market    TEXT,
      price     REAL DEFAULT 0,
      current   REAL DEFAULT 0,
      pe REAL, fpe REAL, pb REAL, peg REAL, evebitda REAL, ps REAL,
      eps REAL, epsd REAL, epsny REAL, epsg REAL,
      roe REAL, roa REAL, gm REAL, om REAL, nm REAL,
      de REAL, cr REAL, qr REAL,
      dy REAL, pr REAL,
      beta REAL, w52h REAL, w52l REAL, mcap TEXT,
      strategies TEXT DEFAULT '[]',
      time       TEXT DEFAULT '[]',
      risk       TEXT DEFAULT 'medium',
      thesis     TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      topic      TEXT,
      source     TEXT,
      content    TEXT NOT NULL,
      tags       TEXT DEFAULT '[]',
      date       TEXT,
      assetId    INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS capex_reports (
      ticker     TEXT NOT NULL,
      fiscalYear TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (ticker, fiscalYear)
    );
    CREATE TABLE IF NOT EXISTS av_cache (
      cacheKey  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      fetchedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      userId     INTEGER NOT NULL,
      body       TEXT NOT NULL,
      tickers    TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_user    ON posts(userId, id DESC);
    CREATE TABLE IF NOT EXISTS post_likes (
      postId     INTEGER NOT NULL,
      userId     INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (postId, userId)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_user ON post_likes(userId);
    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      postId     INTEGER NOT NULL,
      userId     INTEGER NOT NULL,
      body       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(postId, id ASC);
    CREATE TABLE IF NOT EXISTS follows (
      followerId INTEGER NOT NULL,
      followedId INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (followerId, followedId)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followedId);
    CREATE TABLE IF NOT EXISTS notifications (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      userId     INTEGER NOT NULL,
      actorId    INTEGER NOT NULL,
      type       TEXT NOT NULL,
      postId     INTEGER,
      is_read    INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(userId, is_read, id DESC);
    CREATE TABLE IF NOT EXISTS post_tickers (
      postId INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      PRIMARY KEY (postId, ticker)
    );
    CREATE INDEX IF NOT EXISTS idx_post_tickers ON post_tickers(ticker, postId DESC);
  `);
  // 'portfolio' = en cartera · 'watchlist' = en seguimiento
  await ensureColumn('assets', 'type', "TEXT DEFAULT 'portfolio'");
  await ensureColumn('assets', 'priceUpdatedAt', 'TEXT');
  // Multi-usuario: cada activo/nota pertenece a un usuario
  await ensureColumn('assets', 'userId', 'INTEGER');
  await ensureColumn('notes', 'userId', 'INTEGER');
  // Recuperación de cuenta: hash del código de recuperación
  await ensureColumn('users', 'recoveryHash', 'TEXT');
  // Comunidad social: identidad pública (el email NUNCA se expone).
  // displayName = nombre mostrado · handle = alias único para @menciones/URL
  // (se guarda en minúsculas → unicidad efectiva case-insensitive) · avatar =
  // emoji corto · bio = descripción breve. created_at se reutiliza como joinedAt.
  await ensureColumn('users', 'displayName', 'TEXT');
  await ensureColumn('users', 'handle', 'TEXT');
  await ensureColumn('users', 'avatar', 'TEXT');
  await ensureColumn('users', 'bio', 'TEXT');
  // Unicidad del alias. En SQLite varios NULL son distintos entre sí, así que
  // las cuentas sin alias (incluida la demo) no chocan. Idempotente.
  await run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle)');
  // P0 buy-side: tamaño de posición, divisa y FX de entrada (separar retorno
  // activo vs divisa), proceso (catalizador/objetivo/stop) y motor de alfa
  await ensureColumn('assets', 'shares', 'REAL');
  await ensureColumn('assets', 'currency', "TEXT DEFAULT 'USD'");
  await ensureColumn('assets', 'fxEntry', 'REAL');
  await ensureColumn('assets', 'target', 'REAL');
  await ensureColumn('assets', 'stop', 'REAL');
  await ensureColumn('assets', 'engine', 'TEXT');
  await ensureColumn('assets', 'catalyst', 'TEXT');
  await ensureColumn('assets', 'catalystDate', 'TEXT');
  // P1.3: calidad del capital — ROIC, FCF yield y WACC
  await ensureColumn('assets', 'roic', 'REAL');
  await ensureColumn('assets', 'fcfy', 'REAL');
  await ensureColumn('assets', 'wacc', 'REAL');
  // P1.4: revisión de estimaciones de EPS (% en 30 días) — momentum fundamental
  await ensureColumn('assets', 'epsRev', 'REAL');
  // Consenso de analistas: precio objetivo medio, recomendación y nº de analistas
  await ensureColumn('assets', 'targetMean', 'REAL');
  await ensureColumn('assets', 'recommendation', 'TEXT');
  await ensureColumn('assets', 'numAnalysts', 'REAL');
  // CapEx (gastos de capital). Columnas INDEPENDIENTES (fuera de ASSET_NUM/JSON):
  // las escribe solo /quality y /capex-narrative, así el formulario de edición
  // de activos no las sobrescribe. capexHistory = JSON array; capexNarrative = JSON obj.
  await ensureColumn('assets', 'capex', 'REAL');
  await ensureColumn('assets', 'capexToRevenue', 'REAL');
  await ensureColumn('assets', 'capexToOCF', 'REAL');
  await ensureColumn('assets', 'capexToDA', 'REAL');
  await ensureColumn('assets', 'capexProfile', 'TEXT');
  await ensureColumn('assets', 'capexHistory', 'TEXT');
  await ensureColumn('assets', 'capexNarrative', 'TEXT');
  // Introducción breve de la empresa (perfil de negocio). Origen: campo
  // Description de Alpha Vantage OVERVIEW; editable por el usuario.
  await ensureColumn('assets', 'description', 'TEXT');
  // Quick-wins coste 0 (OVERVIEW / estados financieros). Columnas INDEPENDIENTES
  // (fuera de ASSET_NUM → el formulario de edición no las pisa): las escribe solo
  // el endpoint /quality. ma50/ma200 = medias móviles; shYield = shareholder yield
  // % (recompras+dividendos / capitalización); sharesChg = variación % del nº de
  // acciones a 5 años (negativo = recompra, positivo = dilución).
  await ensureColumn('assets', 'ma50', 'REAL');
  await ensureColumn('assets', 'ma200', 'REAL');
  await ensureColumn('assets', 'shYield', 'REAL');
  await ensureColumn('assets', 'sharesChg', 'REAL');
  // Próxima fecha de resultados (EARNINGS_CALENDAR). Columna independiente: la
  // escribe /quality; alimenta el auto-catalizador (catalyst/catalystDate).
  await ensureColumn('assets', 'nextEarnings', 'TEXT');
  // Sorpresas de resultados (EARNINGS): JSON con últimos trimestres beat/miss.
  // Independiente (la escribe /quality), se parsea en rowToAsset.
  await ensureColumn('assets', 'earningsSurprises', 'TEXT');
  // Antigüedad del dato fuente de AV de los fundamentales (badge de procedencia).
  await ensureColumn('assets', 'fundamentalsAt', 'TEXT');
}

// Cuenta demo compartida (id fijo = 1): aloja los datos semilla para que
// cualquiera pueda probar sin registrarse. Las cuentas reales empiezan vacías.
export const DEMO_UID = 1;
async function ensureDemoUser() {
  await run("INSERT OR IGNORE INTO users (id, email, passwordHash) VALUES (?, 'demo@valuevault.local', 'x')", [DEMO_UID]);
}

// ─── Datos semilla ───────────────────────────────────────────
const DEFAULT_ASSETS = [
  { ticker:'BRK.B', name:'Berkshire Hathaway', price:364.20, current:371.50, shares:12, currency:'USD', engine:'value', pe:22, fpe:20, pb:1.5, peg:1.2, evebitda:12, ps:2.1, eps:16.50, epsd:16.20, epsny:17.80, epsg:8, roe:18, roa:7, gm:null, om:15, nm:22, de:0.4, cr:1.8, qr:1.5, dy:0, pr:0, beta:0.9, w52h:395, w52l:320, mcap:'780B', strategies:['value','garp'], time:['long'], risk:'low', thesis:'Holding diversificado con ventaja competitiva duradera. Precio por debajo de valor intrínseco. Gestión excepcional de Buffett. Posición de caja sólida para oportunidades.', sector:'Financials', market:'NYSE' },
  { ticker:'MSFT', name:'Microsoft Corp.', price:415.00, current:432.80, shares:8, currency:'USD', engine:'momentum', pe:34, fpe:28, pb:12, peg:2.1, evebitda:22, ps:12, eps:11.80, epsd:11.45, epsny:13.20, epsg:14, roe:38, roa:18, gm:70, om:45, nm:36, de:0.3, cr:1.7, qr:1.6, dy:0.78, pr:25, beta:0.9, w52h:468, w52l:385, mcap:'3.2T', strategies:['growth','garp','momentum'], time:['medium','long'], risk:'low', thesis:'Liderazgo en cloud (Azure +28% YoY), integración de IA con Copilot, modelo recurrente por suscripciones. Margen operativo del 45%.', sector:'Technology', market:'NASDAQ' },
  { ticker:'O', name:'Realty Income Corp.', price:53.40, current:55.10, shares:60, currency:'USD', engine:'value', pe:42, fpe:38, pb:1.3, peg:3.5, evebitda:18, ps:8, eps:1.30, epsd:1.28, epsny:1.45, epsg:4, roe:4, roa:2, gm:null, om:28, nm:18, de:0.8, cr:null, qr:null, dy:5.5, pr:75, beta:0.6, w52h:62, w52l:47, mcap:'49B', strategies:['dividend','value'], time:['long'], risk:'low', thesis:'REIT "Monthly Dividend Company". Dividend aristocrat con 30 años de incrementos. Yield ~5.5%. Inquilinos investment grade.', sector:'Real Estate', market:'NYSE' },
  { ticker:'AMAT', name:'Applied Materials', price:178.00, current:196.30, shares:10, currency:'USD', engine:'hidden', pe:19, fpe:16, pb:6.8, peg:1.1, evebitda:14, ps:4.8, eps:9.20, epsd:9.05, epsny:11.50, epsg:18, roe:42, roa:19, gm:48, om:28, nm:25, de:0.5, cr:2.1, qr:1.9, dy:1.0, pr:18, beta:1.5, w52h:255, w52l:142, mcap:'165B', strategies:['growth','hidden'], time:['medium'], risk:'medium', thesis:'Proveedor clave de equipos para semiconductores. Beneficiario del ciclo de inversión en fabs. PEG atractivo vs peers.', sector:'Semiconductors', market:'NASDAQ' },
];

const DEFAULT_NOTES = [
  { title:'El Margen de Seguridad de Graham', topic:'value', source:'El Inversor Inteligente', content:'Comprar activos con descuento significativo respecto a su valor intrínseco. Graham recomendaba un margen mínimo del 33%.', tags:['Graham','margen','seguridad'], date:'2024-11-15', assetId:null },
  { title:'GARP: Lo mejor de dos mundos', topic:'strategy', source:'Peter Lynch', content:'Growth at a Reasonable Price combina empresas en crecimiento con valoraciones razonables. PEG menor a 1 indica oportunidad.', tags:['GARP','PEG','Lynch'], date:'2024-12-02', assetId:1 },
  { title:'Sesgo de confirmación en inversión', topic:'psychology', source:'Thinking Fast and Slow', content:'Tendencia a buscar información que confirme nuestra tesis. Buscar activamente argumentos contrarios (steelmanning).', tags:['sesgo','Kahneman'], date:'2025-01-08', assetId:null },
  { title:'Análisis de Ventajas Competitivas (Moat)', topic:'analysis', source:'Morningstar', content:'Los 5 tipos de moat: activos intangibles, costos de cambio, efecto de red, ventaja de costos y escala eficiente.', tags:['moat','ROIC'], date:'2025-01-20', assetId:null },
  { title:'Azure Cloud y Copilot — tesis MSFT', topic:'analysis', source:'Análisis propio', content:'Azure crece +28% YoY. Copilot añade $30/usuario/mes. Con 400M usuarios activos, el potencial de monetización es enorme.', tags:['MSFT','cloud','IA'], date:'2025-02-10', assetId:2 },
  { title:'Dividend Growth Investing', topic:'value', source:'Simply Safe Dividends', content:'Las Dividend Aristocrats (25+ años de incrementos) históricamente superan al S&P 500 con menor volatilidad.', tags:['dividendo','aristocrat'], date:'2025-02-18', assetId:3 },
];

// ─── Semilla de COMUNIDAD: bots con contenido inicial ────────────────────
// Cuentas "bot" (passwordHash 'x' → no se puede iniciar sesión como ellas) que
// dan vida a la comunidad desde el minuto cero: perfiles, publicaciones con
// $TICKER, comentarios, likes y una red de seguidores. Solo se siembra si no
// hay NINGUNA publicación todavía (idempotente).
const COMMUNITY_BOTS = [
  { handle:'vera_lp',   name:'Vera',    avatar:'🦉', bio:'Largo plazo y negocios aburridos. Si no lo entiendo, no entro.' },
  { handle:'gabemtz',   name:'Gabe M.', avatar:'🚀', bio:'Tecnología, algún compounder y curioso del momento. Aprendo en voz alta.' },
  { handle:'dani_rdz',  name:'Dani R.', avatar:'☕', bio:'Cartera tranquila, cobro y reinvierto. Más de mantener que de trastear.' },
  { handle:'marta_sanz',name:'Marta S.',avatar:'🌍', bio:'Miro tipos y macro, pero invierto en lo que conozco.' },
  { handle:'quim_f',    name:'Quim',    avatar:'📈', bio:'Sigo la tendencia, no la adivino. El riesgo primero.' },
  { handle:'clara_b',   name:'Clara',   avatar:'🐻', bio:'Escéptica de oficio. Me fío de los balances, no del ruido.' },
];
// Publicaciones (min = hace cuántos minutos). tickers se indexan para trending.
// Tono variado A PROPÓSITO: unos coloquiales/naturales, otros con faltas de
// ortografía, un par limpios → para que la comunidad parezca gente real.
const BOT_POSTS = [
  { by:'vera_lp',   min:320, tickers:['BRK.B'], body:'$BRK.B otra vez en mi punto de mira. no es nada sexy pero la caja que acumula da mucha tranquilidad' },
  { by:'gabemtz',   min:290, tickers:['NVDA','MSFT'], body:'buah lo de $NVDA y $MSFT con la IA da hasta vertigo, el capex que estan metiendo es bestial 🚀' },
  { by:'dani_rdz',  min:262, tickers:[], body:'finde de repasar la cartera con un cafe. poco que tocar la verdad, que es justo el plan ☕' },
  { by:'marta_sanz',min:236, tickers:[], body:'el dato de inflacion del jueves va a mover mas de lo que parece. yo no me pondria muy valiente antes' },
  { by:'quim_f',    min:210, tickers:['NVDA'], body:'$NVDA sigue en tendencia clara, pero ojo q cuando se gira lo hace rapido. stop puesto y a otra cosa' },
  { by:'clara_b',   min:186, tickers:['NVDA'], body:'no me malinterpreteis pero a estos precios $NVDA me da mas respeto que ganas. alguien lo ve igual?' },
  { by:'vera_lp',   min:162, tickers:['ASML'], body:'te entiendo @clara_b. yo ahi prefiero $ASML, que vende las palas en vez de buscar el oro' },
  { by:'dani_rdz',  min:138, tickers:['MSFT'], body:'por cierto $MSFT lleva años subiendo el dividendo y casi nadie habla de eso. me gusta lo silencioso' },
  { by:'gabemtz',   min:112, tickers:[], body:'alguien usa la herramienta de DCF de aqui? me cuadra raro el WACC en algunos valores 🤔' },
  { by:'marta_sanz',min:84,  tickers:['O'], body:'$O y los REIT respiran si los tipos aflojan, no es magia es matematica de descuento' },
  { by:'quim_f',    min:52,  tickers:[], body:'la regla que me repito: no es no perder, es perder poco cuando te equivocas. lo demas viene solo' },
  { by:'clara_b',   min:26,  tickers:[], body:'media cartera en sectores que todo el mundo odia. duele en el corto pero ahi suelen estar las gangas' },
];
// Likes: [índice de post, handle del bot que da like]
const BOT_LIKES = [
  [0,'dani_rdz'],[0,'marta_sanz'],
  [1,'quim_f'],[1,'vera_lp'],[1,'clara_b'],
  [2,'vera_lp'],[2,'marta_sanz'],
  [3,'quim_f'],[3,'dani_rdz'],
  [4,'gabemtz'],[4,'clara_b'],
  [5,'vera_lp'],[5,'quim_f'],[5,'dani_rdz'],
  [6,'gabemtz'],[6,'clara_b'],
  [7,'vera_lp'],[7,'marta_sanz'],
  [9,'dani_rdz'],[9,'gabemtz'],
  [11,'vera_lp'],[11,'gabemtz'],
];
// Comentarios entre bots: distintos en FUNCIÓN (broma, pregunta, respuesta útil,
// desacuerdo suave, otra filosofía) para que no suenen repetitivos.
const BOT_COMMENTS = [
  { post:1, by:'dani_rdz',  min:284, body:'a mi el vertigo me lo quita ir promediando poco a poco, sin mirar el grafico cada dia jaja' },
  { post:3, by:'vera_lp',   min:232, body:'yo ni lo miro la verdad, compro lo mismo pase lo que pase. cada uno con su estilo' },
  { post:5, by:'quim_f',    min:178, body:'yo de caro o barato no opino, miro la tendencia. pero respeto tu punto eh' },
  { post:6, by:'clara_b',   min:155, body:'buena metafora la de las palas. aun asi yo esperaria un susto del mercado antes de entrar' },
  { post:8, by:'marta_sanz',min:108, body:'el WACC se dispara con betas altas, revisa eso. a mi me pasaba con las tecnologicas' },
];
// Red de seguidores: [seguidor, seguido]
const BOT_FOLLOWS = [
  ['gabemtz','vera_lp'],['dani_rdz','vera_lp'],['quim_f','vera_lp'],
  ['vera_lp','gabemtz'],['clara_b','gabemtz'],
  ['dani_rdz','marta_sanz'],['quim_f','marta_sanz'],
  ['vera_lp','clara_b'],['gabemtz','quim_f'],['marta_sanz','dani_rdz'],
];

// Versión del contenido de bots. Subir este número regenera SOLO el contenido
// de los bots (mantiene intacto lo de usuarios reales).
const COMMUNITY_SEED_VERSION = 3;

async function seedCommunity() {
  const cur = Number((await get("SELECT value FROM config WHERE key = 'community_seed_v'"))?.value ?? 0);
  if (cur >= COMMUNITY_SEED_VERSION) return; // ya está la versión actual
  const hasPosts = Number((await get('SELECT COUNT(*) AS c FROM posts'))?.c ?? 0) > 0;
  const existingBots = await all("SELECT id, handle FROM users WHERE email LIKE '%@bots.valuevault.local'");
  // Si ya hay actividad real y nunca metimos bots → no intervenir.
  if (hasPosts && cur === 0 && existingBots.length === 0) return;

  // 1) Limpia TODO el contenido de bots PREVIOS (cualquier versión/handle), por
  //    dominio de email → robusto aunque hayan cambiado los handles. No toca
  //    nada de usuarios reales.
  const prevIds = existingBots.map(b => Number(b.id));
  if (prevIds.length) {
    const ph = prevIds.map(() => '?').join(',');
    const oldPosts = await all(`SELECT id FROM posts WHERE userId IN (${ph})`, prevIds);
    for (const op of oldPosts) {
      await run('DELETE FROM post_likes WHERE postId = ?', [op.id]);
      await run('DELETE FROM comments WHERE postId = ?', [op.id]);
      await run('DELETE FROM post_tickers WHERE postId = ?', [op.id]);
      await run('DELETE FROM notifications WHERE postId = ?', [op.id]);
    }
    await run(`DELETE FROM posts WHERE userId IN (${ph})`, prevIds);
    await run(`DELETE FROM post_likes WHERE userId IN (${ph})`, prevIds);
    await run(`DELETE FROM comments WHERE userId IN (${ph})`, prevIds);
    await run(`DELETE FROM follows WHERE followerId IN (${ph}) OR followedId IN (${ph})`, [...prevIds, ...prevIds]);
    await run(`DELETE FROM notifications WHERE actorId IN (${ph})`, prevIds);
    // Elimina cuentas bot que ya NO están en el roster actual (handles renombrados).
    const keep = COMMUNITY_BOTS.map(b => b.handle);
    const kph = keep.map(() => '?').join(',');
    await run(`DELETE FROM users WHERE id IN (${ph}) AND handle NOT IN (${kph})`, [...prevIds, ...keep]);
  }

  // 2) Asegura los usuarios bot del roster actual (por handle) y refresca perfil.
  const idByHandle = {};
  for (const b of COMMUNITY_BOTS) {
    const u = await get('SELECT id FROM users WHERE handle = ?', [b.handle]);
    if (u) {
      idByHandle[b.handle] = Number(u.id);
      await run('UPDATE users SET displayName = ?, avatar = ?, bio = ? WHERE id = ?', [b.name, b.avatar, b.bio, u.id]);
    } else {
      const info = await run('INSERT INTO users (email, passwordHash, displayName, handle, avatar, bio) VALUES (?, ?, ?, ?, ?, ?)',
        [`${b.handle}@bots.valuevault.local`, 'x', b.name, b.handle, b.avatar, b.bio]);
      idByHandle[b.handle] = Number(info.lastInsertRowid);
    }
  }

  // 3) (Re)inserta el contenido de bots.
  const postIds = [];
  for (const p of BOT_POSTS) {
    const info = await run("INSERT INTO posts (userId, body, tickers, created_at) VALUES (?, ?, ?, datetime('now', ?))",
      [idByHandle[p.by], p.body, JSON.stringify(p.tickers || []), `-${p.min} minutes`]);
    const pid = Number(info.lastInsertRowid);
    postIds.push(pid);
    for (const t of (p.tickers || [])) await run('INSERT OR IGNORE INTO post_tickers (postId, ticker) VALUES (?, ?)', [pid, t]);
  }
  for (const [i, h] of BOT_LIKES) await run('INSERT OR IGNORE INTO post_likes (postId, userId) VALUES (?, ?)', [postIds[i], idByHandle[h]]);
  for (const cm of BOT_COMMENTS) await run("INSERT INTO comments (postId, userId, body, created_at) VALUES (?, ?, ?, datetime('now', ?))", [postIds[cm.post], idByHandle[cm.by], cm.body, `-${cm.min} minutes`]);
  for (const [f, t] of BOT_FOLLOWS) await run('INSERT OR IGNORE INTO follows (followerId, followedId) VALUES (?, ?)', [idByHandle[f], idByHandle[t]]);

  await run("INSERT OR REPLACE INTO config (key, value) VALUES ('community_seed_v', ?)", [String(COMMUNITY_SEED_VERSION)]);
  console.log(`🤖 Comunidad sembrada/actualizada a v${COMMUNITY_SEED_VERSION}: ${COMMUNITY_BOTS.length} bots, ${BOT_POSTS.length} posts.`);
}

export async function seedIfEmpty() {
  const c = (await get('SELECT COUNT(*) AS c FROM assets'))?.c ?? 0;
  if (Number(c) > 0) return;

  const cols = [...ASSET_TXT, ...ASSET_NUM, ...ASSET_JSON];
  const placeholders = ['?', ...cols.map(() => '?')].join(', '); // id + columnas
  for (let i = 0; i < DEFAULT_ASSETS.length; i++) {
    const a = DEFAULT_ASSETS[i];
    const args = [i + 1];
    ASSET_TXT.forEach(col => args.push(a[col] ?? null));
    ASSET_NUM.forEach(col => args.push((a[col] === undefined || a[col] === null) ? null : a[col]));
    ASSET_JSON.forEach(col => args.push(JSON.stringify(a[col] || [])));
    await run(`INSERT INTO assets (id, ${cols.join(', ')}) VALUES (${placeholders})`, args);
  }

  for (let i = 0; i < DEFAULT_NOTES.length; i++) {
    const n = DEFAULT_NOTES[i];
    await run(
      `INSERT INTO notes (id, title, topic, source, content, tags, date, assetId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [i + 1, n.title, n.topic, n.source, n.content, JSON.stringify(n.tags || []), n.date, n.assetId]
    );
  }

  await run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['theme', 'dark']);
  console.log('🌱 Base de datos sembrada (4 activos, 6 notas).');
}

// Backfill idempotente de tamaño/divisa/FX de entrada SOLO para los activos
// demo (cuenta demo), para que la cartera de muestra valore en EUR. No toca
// filas que ya tengan tamaño definido ni activos de usuarios reales.
const DEMO_POS = { 'BRK.B': 12, 'MSFT': 8, 'O': 60, 'AMAT': 10 };
// roic / fcfy / wacc orientativos para la cartera demo (MSFT/AMAT/BRK crean
// valor: ROIC>WACC; O lo destruye: ROIC<WACC, típico de un REIT)
const DEMO_QUALITY = {
  'BRK.B': { roic: 9.0, fcfy: 4.5, wacc: 7.5, epsRev: 0.8, targetMean: 520, recommendation: 'buy', numAnalysts: 6 },
  'MSFT':  { roic: 28.0, fcfy: 2.8, wacc: 8.5, epsRev: 1.5, targetMean: 560, recommendation: 'strong_buy', numAnalysts: 55 },
  'O':     { roic: 4.0, fcfy: 6.0, wacc: 6.5, epsRev: -5.0, targetMean: 62, recommendation: 'buy', numAnalysts: 20 },
  'AMAT':  { roic: 30.0, fcfy: 4.0, wacc: 11.0, epsRev: 12.0, targetMean: 250, recommendation: 'strong_buy', numAnalysts: 36 },
};
async function backfillDemoPositions() {
  for (const [ticker, shares] of Object.entries(DEMO_POS)) {
    await run(
      "UPDATE assets SET shares = ?, currency = COALESCE(currency,'USD'), fxEntry = COALESCE(fxEntry, 0.92) WHERE ticker = ? AND userId = ? AND shares IS NULL",
      [shares, ticker, DEMO_UID]
    );
  }
  for (const [ticker, q] of Object.entries(DEMO_QUALITY)) {
    await run(
      'UPDATE assets SET roic = ?, fcfy = ?, wacc = ? WHERE ticker = ? AND userId = ? AND roic IS NULL',
      [q.roic, q.fcfy, q.wacc, ticker, DEMO_UID]
    );
    // epsRev y consenso con su propio guard (pueden rellenarse después de roic)
    await run(
      'UPDATE assets SET epsRev = ? WHERE ticker = ? AND userId = ? AND epsRev IS NULL',
      [q.epsRev, ticker, DEMO_UID]
    );
    await run(
      'UPDATE assets SET targetMean = ?, recommendation = ?, numAnalysts = ? WHERE ticker = ? AND userId = ? AND targetMean IS NULL',
      [q.targetMean, q.recommendation, q.numAnalysts, ticker, DEMO_UID]
    );
  }
}

// Backfill idempotente de post_tickers desde posts.tickers (JSON ya guardado).
// Para posts creados antes de existir la tabla de índice de tickers (Fase 5).
async function backfillPostTickers() {
  const c = Number((await get('SELECT COUNT(*) AS c FROM post_tickers'))?.c ?? 0);
  if (c > 0) return; // ya poblada
  const posts = await all("SELECT id, tickers FROM posts WHERE tickers IS NOT NULL AND tickers != '[]'");
  for (const p of posts) {
    for (const t of safeJson(p.tickers, [])) {
      await run('INSERT OR IGNORE INTO post_tickers (postId, ticker) VALUES (?, ?)', [p.id, String(t).toUpperCase()]);
    }
  }
}

// Inicialización única por instancia (esquema + semilla). Lo CRÍTICO es el
// esquema; la semilla/backfill son best-effort (no deben tumbar la API si dos
// cold-starts concurrentes chocan al escribir). Si la promesa falla, se limpia
// para reintentar en la siguiente petición (no se cachea un rechazo).
let _ready;
export function ready() {
  if (!_ready) {
    _ready = (async () => {
      await initSchema();        // crítico: las queries dependen del esquema
      await ensureDemoUser();
      try {
        await seedIfEmpty();
        await run('UPDATE assets SET userId = ? WHERE userId IS NULL', [DEMO_UID]);
        await run('UPDATE notes SET userId = ? WHERE userId IS NULL', [DEMO_UID]);
        await backfillDemoPositions();
        await backfillPostTickers();
        await seedCommunity();
      } catch (e) {
        console.warn('Semilla/backfill best-effort falló (continuo):', e.message);
      }
    })().catch(e => { _ready = null; throw e; });
  }
  return _ready;
}
