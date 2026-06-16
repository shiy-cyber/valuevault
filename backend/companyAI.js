// ─────────────────────────────────────────────────────────────
// Introducción breve de empresa en ESPAÑOL — "¿a qué se dedica?".
// Alpha Vantage da un perfil (Description) solo en inglés; aquí se
// genera una intro corta en español con Claude a partir de los datos
// que ya tenemos del activo (nombre, ticker, sector, mercado). Sin
// web_search: para una intro descriptiva el conocimiento del modelo
// basta y abarata el coste. Bajo demanda; el endpoint cachea el
// resultado en la columna `description` (no se vuelve a cobrar).
//
// Modelo por defecto: claude-haiku-4-5 (~$0,002/título, one-time).
// Configurable con COMPANY_AI_MODEL. Requiere ANTHROPIC_API_KEY.
// ─────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.COMPANY_AI_MODEL || 'claude-haiku-4-5';
// Modelos que soportan adaptive thinking + `effort` (Opus 4.6+/Sonnet 4.6/Fable).
// Haiku 4.5 NO los soporta (devuelve 400) → se omiten.
const ADVANCED = /opus-4-[678]|sonnet-4-6|fable-5|mythos-5/;

let _client;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error('Falta ANTHROPIC_API_KEY: la intro IA no está configurada.'), { status: 503 });
  }
  // timeout < 26s (límite serverless Netlify); 1 reintento ante errores de red.
  if (!_client) _client = new Anthropic({ timeout: 22000, maxRetries: 1 });
  return _client;
}

// Separación de contexto (BLOQUE 1 CLAUDE.md): cualquier dato externo es DATO,
// nunca instrucción. Aquí no hay web_search, pero se mantiene la disciplina.
const SYSTEM = `Eres un analista financiero que redacta fichas de empresas cotizadas en ESPAÑOL de España.

Tu tarea: una INTRODUCCIÓN BREVE de la empresa indicada — a qué se dedica, su negocio principal, sus productos o servicios clave y en qué mercado/sector opera.

REGLAS:
- Escribe en español de España, en tercera persona / impersonal.
- Empieza DIRECTAMENTE por el contenido. PROHIBIDO cualquier saludo, introducción o meta-comentario ("Claro", "Aquí tienes", "Voy a redactar", líneas con "---").
- TEXTO PLANO, sin Markdown: nada de asteriscos (**), almohadillas (#) ni viñetas.
- Un único párrafo, conciso. Máximo ~110 palabras.
- Descriptivo y neutral: NO des recomendación de inversión, ni precio objetivo, ni opinión sobre si comprar.
- Si no conoces la empresa con seguridad, dilo brevemente y describe solo lo que sí sabes con certeza, sin inventar datos.`;

function userPrompt(a) {
  return `Empresa: ${a.name || a.ticker} (${a.ticker})${a.sector ? ' · Sector: ' + a.sector : ''}${a.market ? ' · Mercado: ' + a.market : ''}.
Redacta su introducción breve en español.`;
}

// Limpieza: quita Markdown y cualquier preámbulo residual.
function cleanText(s) {
  return String(s || '')
    .replace(/\*\*|__/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Genera la intro en español. Devuelve { description, generatedAt }.
export async function generateCompanyIntro(asset) {
  const c = client();
  const base = {
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt(asset) }],
  };
  if (ADVANCED.test(MODEL)) {
    base.thinking = { type: 'adaptive' };
    base.output_config = { effort: 'low' };
  }

  const msg = await c.messages.create(base);
  const text = cleanText((msg.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  if (!text) throw Object.assign(new Error('La IA no devolvió la introducción.'), { status: 502 });
  return { description: text, generatedAt: new Date().toISOString() };
}
