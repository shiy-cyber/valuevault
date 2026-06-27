// Runner LOCAL de la ingesta (para probar/programar en el PC sin Netlify).
// Uso: `node cron-ingest.js`  ·  o prográmalo con node-cron / Programador de tareas.
import 'dotenv/config';
import { ready } from './db.js';
import { ingestQuotes } from './ingest.js';

await ready();
const summary = await ingestQuotes();
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
