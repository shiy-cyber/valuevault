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
export const ASSET_TXT = ['ticker','name','sector','market','mcap','risk','thesis','currency','engine','catalyst','catalystDate','recommendation'];
export const ASSET_JSON = ['strategies','time'];

export function rowToAsset(r) {
  if (!r) return null;
  return { ...r, strategies: JSON.parse(r.strategies || '[]'), time: JSON.parse(r.time || '[]') };
}
export function rowToNote(r) {
  if (!r) return null;
  return { ...r, tags: JSON.parse(r.tags || '[]') };
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
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
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
      } catch (e) {
        console.warn('Semilla/backfill best-effort falló (continuo):', e.message);
      }
    })().catch(e => { _ready = null; throw e; });
  }
  return _ready;
}
