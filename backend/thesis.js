// ─────────────────────────────────────────────────────────────
// Validación de PDFs subidos como tesis de inversión.
// Un PDF es contenido PASIVO por diseño (no ejecuta código en nuestro
// servidor), pero SÍ puede llevar JavaScript embebido que algunos lectores
// ejecutan al abrirlo — por eso, además de comprobar que es un PDF de
// verdad (firma de bytes, no la extensión ni el Content-Type del navegador,
// que cualquiera puede falsificar), rechazamos cualquier fichero con marcas
// de JavaScript/acciones automáticas. Nunca servimos el fichero "tal cual"
// sin pasar por aquí.
// ─────────────────────────────────────────────────────────────

export const MAX_THESIS_BYTES = 4 * 1024 * 1024; // 4 MB (límite de payload de Netlify Functions)

// Cabecera oficial de PDF: "%PDF-" en los primeros bytes (a veces precedida
// de unos pocos bytes de basura, pero nunca más allá del inicio del fichero).
function hasPdfSignature(buffer) {
  const head = buffer.subarray(0, 1024).toString('latin1');
  return head.includes('%PDF-');
}

// Búsqueda simple de marcadores de JavaScript/acciones automáticas en el PDF.
// No es un parser completo (un atacante decidido podría ofuscar/comprimir
// el stream para evadirlo), pero cubre el caso común y barato de bloquear.
// IMPORTANTE: las claves cortas (/AA, /JS) deben ir seguidas de un delimitador
// PDF real (espacio, '<', '(' o fin) — si no, /AA coincide con el prefijo de
// subconjunto de fuente que genera CUALQUIER PDF normal, p.ej. "/AAAAAA+Arial"
// (falso positivo real, detectado probando esta misma función).
const DANGEROUS_PATTERNS = [
  /\/JavaScript\b/, /\/JS[\s<(]/, /\/OpenAction[\s<]/, /\/AA[\s<]/,
  /\/Launch[\s<]/, /\/EmbeddedFile\b/, /\/RichMedia\b/,
];
function findDangerousMarker(buffer) {
  const text = buffer.toString('latin1');
  const m = DANGEROUS_PATTERNS.find(re => re.test(text));
  return m ? m.source : null;
}

// Lanza un error (con .status para el handler h() de app.js) si el buffer
// no es un PDF válido y seguro. Si pasa, no devuelve nada (no hace falta).
export function validatePdfBuffer(buffer, originalName) {
  if (!buffer || !buffer.length) {
    throw Object.assign(new Error('Fichero vacío'), { status: 400 });
  }
  if (buffer.length > MAX_THESIS_BYTES) {
    throw Object.assign(new Error(`El PDF supera el máximo de ${MAX_THESIS_BYTES / (1024 * 1024)} MB`), { status: 400 });
  }
  if (!hasPdfSignature(buffer)) {
    throw Object.assign(new Error('El fichero no es un PDF válido'), { status: 400 });
  }
  const marker = findDangerousMarker(buffer);
  if (marker) {
    throw Object.assign(
      new Error('El PDF contiene JavaScript o acciones automáticas embebidas y no se puede subir. Exporta/imprime el PDF de nuevo (por ejemplo, "Imprimir a PDF") para generar una versión limpia.'),
      { status: 400 }
    );
  }
  if (originalName && !/\.pdf$/i.test(originalName)) {
    throw Object.assign(new Error('El fichero debe tener extensión .pdf'), { status: 400 });
  }
}

// Nombre de fichero seguro para Content-Disposition (sin rutas, sin comillas,
// solo lo esencial — evita inyección de cabeceras HTTP y problemas de encoding).
export function safeFileName(name) {
  const base = String(name || 'tesis.pdf').replace(/[/\\]/g, '_').replace(/[^\w.\- ]/g, '');
  return (base.slice(0, 120) || 'tesis.pdf');
}
