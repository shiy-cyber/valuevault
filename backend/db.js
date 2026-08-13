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
// Ejecuta varias sentencias en UN solo viaje de red (transacción atómica).
// Clave contra Turso remoto: convierte ~100 round-trips de siembra en 1-2.
export const batch = async (statements) => {
  if (!statements.length) return [];
  return (await getDb()).batch(statements);
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

// ─── Snapshots globales (macro, sentimiento…) rellenados por el cron ─────
export async function getSnapshot(key) {
  const r = await get('SELECT data, fetchedAt FROM snapshots WHERE key = ?', [String(key)]);
  return r ? { data: safeJson(r.data, null), fetchedAt: r.fetchedAt } : null;
}
export async function saveSnapshot(key, data) {
  await run('INSERT OR REPLACE INTO snapshots (key, data, fetchedAt) VALUES (?, ?, ?)',
    [String(key), JSON.stringify(data), new Date().toISOString()]);
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
    CREATE TABLE IF NOT EXISTS quotes (
      ticker    TEXT PRIMARY KEY,
      price     REAL,
      currency  TEXT,
      changePct REAL,
      payload   TEXT,
      fetchedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      key       TEXT PRIMARY KEY,
      data      TEXT,
      fetchedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS fundamentals_cache (
      ticker    TEXT PRIMARY KEY,
      data      TEXT,
      fetchedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS theses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      userId     INTEGER NOT NULL,
      title      TEXT NOT NULL,
      ticker     TEXT,
      summary    TEXT,
      blobKey    TEXT NOT NULL,
      fileName   TEXT NOT NULL,
      fileSize   INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_theses_created ON theses(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_theses_user    ON theses(userId, id DESC);
    CREATE INDEX IF NOT EXISTS idx_theses_ticker  ON theses(ticker, id DESC);
    CREATE TABLE IF NOT EXISTS blobs (
      key  TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
  `);
  // 'portfolio' = en cartera · 'watchlist' = en seguimiento
  await ensureColumn('assets', 'type', "TEXT DEFAULT 'portfolio'");
  await ensureColumn('assets', 'priceUpdatedAt', 'TEXT');
  // Multi-usuario: cada activo/nota pertenece a un usuario
  await ensureColumn('assets', 'userId', 'INTEGER');
  await ensureColumn('notes', 'userId', 'INTEGER');
  // Recuperación de cuenta: hash del código de recuperación
  await ensureColumn('users', 'recoveryHash', 'TEXT');
  // Recuperación por enlace de un solo uso enviado por email (Resend).
  // Se guarda solo el hash del token y su caducidad (1h); nunca el token en claro.
  await ensureColumn('users', 'resetTokenHash', 'TEXT');
  await ensureColumn('users', 'resetTokenExpiresAt', 'TEXT');
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
// Orden: de más ANTIGUO (semanas) a más reciente (minutos). El feed va por id
// DESC, así que el último del array sale arriba. Registros variados por persona:
// macro (Marta), oportunidad/valor (Vera), técnico (Quim), eufórico (Gabe),
// escéptico (Clara), cotidiano (Dani). Mayúsculas y faltas SOLO en algunos.
const BOT_POSTS = [
  { by:'marta_sanz', ago:'-23 days',    tickers:[], body:'Hace semanas avisé de que la curva se estaba aplanando. El mercado por fin lo descuenta; paciencia con la duración.' },
  { by:'vera_lp',    ago:'-15 days',    tickers:['BRK.B'], body:'La corrección de hace unas semanas me dejó ampliar $BRK.B con margen. Cuando aparece el miedo, aparecen las oportunidades.' },
  { by:'quim_f',     ago:'-12 days',    tickers:[], body:'Llevaba tiempo buscando una herramienta que junte Volume Profile, Gamma (GEX) y Trend Following en el mismo sitio y sin pagar una fortuna. Aquí está todo. Raro de encontrar.' },
  { by:'quim_f',     ago:'-9 days',     tickers:[], body:'Backtest rápido: cruce MA50/MA200 con filtro de volatilidad (ATR) mejora el Sharpe y recorta el drawdown máximo. Menos operaciones, mejores entradas.' },
  { by:'dani_rdz',   ago:'-6 days',     tickers:[], body:'domingo de cafe y revisar los dividendos cobrados este mes. poco glamour pero el interes compuesto no falla ☕' },
  { by:'gabemtz',    ago:'-4 days',     tickers:['NVDA'], body:'buahhh $NVDA otra vez en maximos!! esto no para, la IA se lo come todo 🚀🚀 el q no este dentro se lo pierde' },
  { by:'gabemtz',    ago:'-3 days',     tickers:[], body:'ostras la narrativa de CapEx con IA q han metido aqui es una pasada, te explica EN QUE invierte la empresa en dos lineas 🤯 no lo he visto en ninguna otra app' },
  { by:'clara_b',    ago:'-2 days',     tickers:['NVDA'], body:'¿Nadie más nota el FOMO con $NVDA? No digo que sea mala empresa; digo que el precio ya descuenta tres años perfectos.' },
  { by:'vera_lp',    ago:'-40 hours',   tickers:[], body:'Lo que me engancha de esta plataforma: el DCF te calcula el WACC por estructura de capital, no un 9% fijo como casi todas. Eso te cambia la valoración por completo.' },
  { by:'marta_sanz', ago:'-28 hours',   tickers:[], body:'El dato de inflación de mañana puede mover bonos y bolsa. Si sorprende al alza, los duraderos y el growth lo notarán primero.' },
  { by:'dani_rdz',   ago:'-20 hours',   tickers:[], body:'lo mejor de aqui? que es gratis y encima ahora hay comunidad para comentar ideas. se agradece juntarse con gente que comparte de verdad' },
  { by:'vera_lp',    ago:'-8 hours',    tickers:['ASML'], body:'Coincido con @clara_b en la cautela. Yo me quedo con $ASML: vende las palas a toda la industria. Menos emoción, más foso.' },
  { by:'quim_f',     ago:'-5 hours',    tickers:[], body:'Recordatorio de gestión: dimensiona por volatilidad objetivo, no por corazonadas. Un 15% de vol anualizada te mantiene en juego durante los sustos.' },
  { by:'clara_b',    ago:'-3 hours',    tickers:[], body:'Reconozco algo de esta app: te marca de dónde sale cada dato y cuándo se actualizó. Esa transparencia no abunda. Por escéptica que sea, eso me gana.' },
  { by:'dani_rdz',   ago:'-2 hours',    tickers:['MSFT'], body:'por cierto $MSFT lleva años subiendo el dividendo y casi nadie lo cuenta. me gustan las cosas aburridas que componen solas' },
  { by:'gabemtz',    ago:'-40 minutes', tickers:['ASML'], body:'alguien mas en $ASML? me da q el siguiente leg es pa arriba 👀 (no es consejo eh jaja)' },
  { by:'clara_b',    ago:'-12 minutes', tickers:[], body:'Apunte del día: medio mercado odia a las energéticas con balance sólido. Ahí miro yo cuando todos miran al otro lado.' },
];
// Likes: [índice de post, handle del bot que da like]. Más en los recientes
// (dentro de 48h) para que el Trending tenga ranking claro.
const BOT_LIKES = [
  [0,'vera_lp'],
  [1,'dani_rdz'],
  [2,'vera_lp'],[2,'gabemtz'],[2,'dani_rdz'],
  [3,'gabemtz'],
  [5,'dani_rdz'],[5,'quim_f'],
  [6,'vera_lp'],[6,'dani_rdz'],[6,'clara_b'],
  [7,'vera_lp'],[7,'quim_f'],
  [8,'quim_f'],[8,'marta_sanz'],[8,'gabemtz'],
  [9,'vera_lp'],[9,'quim_f'],[9,'dani_rdz'],
  [10,'vera_lp'],[10,'gabemtz'],[10,'clara_b'],
  [11,'gabemtz'],[11,'clara_b'],[11,'dani_rdz'],[11,'quim_f'],
  [12,'marta_sanz'],[12,'vera_lp'],
  [13,'vera_lp'],[13,'quim_f'],[13,'gabemtz'],
  [14,'vera_lp'],[14,'gabemtz'],
  [15,'dani_rdz'],
  [16,'vera_lp'],[16,'gabemtz'],
];
// Comentarios variados (contrapunto, detalle, feature distinta, ángulo de valor,
// ángulo técnico, escéptico que concede, duda realista, anécdota, matiz, casual,
// calidad silenciosa). ago < edad de su post; autor del comentario ≠ del post.
const BOT_COMMENTS = [
  { post:2,  by:'gabemtz',   ago:'-11 days', body:'justo!! yo flipé cuando vi q tiene hasta gamma y volume profile gratis 🙌' },
  { post:2,  by:'marta_sanz',ago:'-10 days', body:'A mí lo que me ganó fue tener el research macro y el sentimiento en el mismo sitio. Ahorra muchísimo tiempo.' },
  { post:5,  by:'clara_b',   ago:'-3 days',  body:'Ojo con el "esto no para", eh. Justo cuando nadie ve riesgo es cuando aparece.' },
  { post:6,  by:'vera_lp',   ago:'-2 days',  body:'Esa narrativa de CapEx es oro para el análisis fundamental. Saber en qué reinvierte una empresa lo es casi todo.' },
  { post:7,  by:'quim_f',    ago:'-46 hours',body:'Yo no discuto valoración, opero la tendencia con stop. Mientras la estructura aguante, sigo dentro.' },
  { post:8,  by:'clara_b',   ago:'-34 hours',body:'Reconozco que ese detalle del WACC está muy bien pensado. La mayoría te clava un número fijo y a correr.' },
  { post:10, by:'clara_b',   ago:'-16 hours',body:'Mientras no lo llenen de funciones de pago, bien. De momento sorprende lo completo que es.' },
  { post:11, by:'gabemtz',   ago:'-7 hours', body:'totalmente, $ASML es un monopolio de los buenos 🙌 me pille unas la semana pasada' },
  { post:12, by:'marta_sanz',ago:'-4 hours', body:'Buen recordatorio. La gente subestima cuánto pesa el sizing frente al timing.' },
  { post:13, by:'dani_rdz',  ago:'-2 hours', body:'eso mismo, q te diga de donde sale el dato y cuando se actualizo da mucha confianza la verdad' },
  { post:14, by:'vera_lp',   ago:'-1 hours', body:'Las aburridas suelen ser las que más componen. $MSFT es calidad silenciosa de manual.' },
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
const COMMUNITY_SEED_VERSION = 7;

// IMPORTANTE: toda la siembra va en LOTES (batch) → 2 viajes de red en vez de
// ~100. Crítico contra Turso remoto: la versión secuencial superaba el límite
// de 30s del serverless en el primer arranque y tumbaba TODA la API (502).
async function seedCommunity() {
  const cur = Number((await get("SELECT value FROM config WHERE key = 'community_seed_v'"))?.value ?? 0);
  if (cur >= COMMUNITY_SEED_VERSION) return; // ya está la versión actual
  const hasPosts = Number((await get('SELECT COUNT(*) AS c FROM posts'))?.c ?? 0) > 0;
  const existingBots = await all("SELECT id, handle FROM users WHERE email LIKE '%@bots.valuevault.local'");
  // Si ya hay actividad real y nunca metimos bots → no intervenir.
  if (hasPosts && cur === 0 && existingBots.length === 0) return;

  // RECLAMO ATÓMICO: en el primer arranque tras un deploy, Netlify levanta
  // VARIAS instancias a la vez y todas entran aquí. Solo una debe sembrar (si
  // no, los INSERT de comentarios se duplican). El primero que sube la versión
  // gana; el resto se retira. Las escrituras de Turso están serializadas, así
  // que solo una de las UPDATE/INSERT concurrentes tiene efecto.
  const claimed = await run(
    "UPDATE config SET value = ? WHERE key = 'community_seed_v' AND CAST(value AS INTEGER) < ?",
    [String(COMMUNITY_SEED_VERSION), COMMUNITY_SEED_VERSION]
  );
  let won = claimed.changes > 0;
  if (!won) {
    // La fila puede no existir aún (BD nueva): la crea solo una instancia.
    const created = await run("INSERT OR IGNORE INTO config (key, value) VALUES ('community_seed_v', ?)", [String(COMMUNITY_SEED_VERSION)]);
    won = created.changes > 0;
  }
  if (!won) return; // otra instancia ya reclamó/sembró esta versión

  const roster = COMMUNITY_BOTS.map(b => b.handle);
  const rph = roster.map(() => '?').join(',');

  // (a) Alta de los bots del roster que aún no existan (1 batch).
  const have = new Set(existingBots.map(b => b.handle));
  const missing = COMMUNITY_BOTS.filter(b => !have.has(b.handle));
  if (missing.length) {
    await batch(missing.map(b => ({
      sql: 'INSERT INTO users (email, passwordHash, displayName, handle, avatar, bio) VALUES (?, ?, ?, ?, ?, ?)',
      args: [`${b.handle}@bots.valuevault.local`, 'x', b.name, b.handle, b.avatar, b.bio],
    })));
  }
  const rosterRows = await all(`SELECT id, handle FROM users WHERE handle IN (${rph})`, roster);
  const idByHandle = Object.fromEntries(rosterRows.map(r => [r.handle, Number(r.id)]));

  // (b) BATCH 1: limpia TODO lo de bots previos (por dominio de email, robusto a
  //     cambios de handle), refresca perfiles, borra bots fuera de roster e
  //     inserta los posts EN ORDEN. No toca nada de usuarios reales.
  const prevIds = existingBots.map(b => Number(b.id));
  const stmts1 = [];
  if (prevIds.length) {
    const ph = prevIds.map(() => '?').join(',');
    const inPosts = `SELECT id FROM posts WHERE userId IN (${ph})`;
    stmts1.push({ sql: `DELETE FROM post_likes WHERE postId IN (${inPosts})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM comments WHERE postId IN (${inPosts})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM post_tickers WHERE postId IN (${inPosts})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM notifications WHERE postId IN (${inPosts})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM posts WHERE userId IN (${ph})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM post_likes WHERE userId IN (${ph})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM comments WHERE userId IN (${ph})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM follows WHERE followerId IN (${ph}) OR followedId IN (${ph})`, args: [...prevIds, ...prevIds] });
    stmts1.push({ sql: `DELETE FROM notifications WHERE actorId IN (${ph})`, args: prevIds });
    stmts1.push({ sql: `DELETE FROM users WHERE id IN (${ph}) AND handle NOT IN (${rph})`, args: [...prevIds, ...roster] });
  }
  for (const b of COMMUNITY_BOTS) stmts1.push({ sql: 'UPDATE users SET displayName = ?, avatar = ?, bio = ? WHERE handle = ?', args: [b.name, b.avatar, b.bio, b.handle] });
  for (const p of BOT_POSTS) stmts1.push({ sql: "INSERT INTO posts (userId, body, tickers, created_at) VALUES (?, ?, ?, datetime('now', ?))", args: [idByHandle[p.by], p.body, JSON.stringify(p.tickers || []), p.ago] });
  await batch(stmts1);

  // ids de los posts recién insertados, en orden (alineados con BOT_POSTS).
  const rosterIds = Object.values(idByHandle);
  const iph = rosterIds.map(() => '?').join(',');
  const newPosts = await all(`SELECT id FROM posts WHERE userId IN (${iph}) ORDER BY id ASC`, rosterIds);
  const postIds = newPosts.map(r => Number(r.id));

  // (c) BATCH 2: tickers + likes + comentarios + follows + invalida caché de
  //     trending + marca la versión sembrada.
  const stmts2 = [];
  BOT_POSTS.forEach((p, i) => { for (const t of (p.tickers || [])) stmts2.push({ sql: 'INSERT OR IGNORE INTO post_tickers (postId, ticker) VALUES (?, ?)', args: [postIds[i], t] }); });
  for (const [i, h] of BOT_LIKES) stmts2.push({ sql: 'INSERT OR IGNORE INTO post_likes (postId, userId) VALUES (?, ?)', args: [postIds[i], idByHandle[h]] });
  for (const cm of BOT_COMMENTS) stmts2.push({ sql: "INSERT INTO comments (postId, userId, body, created_at) VALUES (?, ?, ?, datetime('now', ?))", args: [postIds[cm.post], idByHandle[cm.by], cm.body, cm.ago] });
  for (const [f, t] of BOT_FOLLOWS) stmts2.push({ sql: 'INSERT OR IGNORE INTO follows (followerId, followedId) VALUES (?, ?)', args: [idByHandle[f], idByHandle[t]] });
  stmts2.push({ sql: "DELETE FROM av_cache WHERE cacheKey IN ('TRENDING:posts', 'TRENDING:tickers')", args: [] });
  stmts2.push({ sql: "INSERT OR REPLACE INTO config (key, value) VALUES ('community_seed_v', ?)", args: [String(COMMUNITY_SEED_VERSION)] });
  await batch(stmts2);

  console.log(`🤖 Comunidad sembrada/actualizada a v${COMMUNITY_SEED_VERSION} (batch): ${COMMUNITY_BOTS.length} bots, ${BOT_POSTS.length} posts.`);
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
