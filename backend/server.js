// ─────────────────────────────────────────────────────────────
// Arranque LOCAL de ValueVault (desarrollo).
// En producción NO se usa esto: la app corre como función serverless
// de Netlify (ver netlify/functions/api.js).
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;
const app = await createApp();
app.listen(PORT, () => console.log(`🟢 ValueVault API en http://localhost:${PORT}`));
