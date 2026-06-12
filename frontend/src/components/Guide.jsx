import React, { useState } from 'react';

const GUIDE = [
  {
    id: 'indices', icon: '🌎', title: 'Índices Bursátiles', tag: 'En vivo',
    what: 'Los principales índices mundiales en tiempo real (Yahoo Finance): S&P 500, Nasdaq 100/Composite, Dow Jones, Russell 2000, VIX, Euro Stoxx 50, IBEX 35, DAX, CAC 40, FTSE 100, Nikkei 225 y Hang Seng.',
    use: [
      'Elige el periodo: 1M, 3M, 6M, YTD, 1A y los largos 3A, 5A, 10A y 20A.',
      'Pulsa ↻ Actualizar para forzar datos frescos (salta la caché de 10 min).',
      'En la gráfica comparada usa "✓ Todos / ✗ Ninguno" para seleccionar índices de golpe.',
    ],
    read: [
      'Las tarjetas, agrupadas por región, muestran la variación diaria y el rendimiento del periodo.',
      'El gráfico de líneas compara el rendimiento % acumulado de los índices que tengas activos.',
    ],
  },
  {
    id: 'sentiment', icon: '🧭', title: 'Sentimiento de Mercado', tag: 'En vivo',
    what: 'Termómetro del miedo y la codicia: el Fear & Greed Index de CNN (medidor 0-100 con sus 7 componentes), el VIX y el Fear & Greed de cripto.',
    use: [
      'Mira el medidor central: la aguja indica la zona (Miedo extremo → Codicia extrema).',
      'Revisa los 7 componentes para ver QUÉ mueve el sentimiento (volatilidad, amplitud, put/call…).',
      'Pulsa ↻ Actualizar para datos frescos.',
    ],
    read: [
      'Es un indicador CONTRARIAN: el miedo extremo suele coincidir con suelos de mercado y la codicia extrema con techos.',
      'VIX alto = nerviosismo; bajo = calma. Por encima de 30 indica tensión.',
    ],
  },
  {
    id: 'trends', icon: '📡', title: 'Tendencias por Sector', tag: 'En vivo',
    what: 'Rendimiento relativo de los 10 sectores del S&P (vía ETFs SPDR): mapa de calor, gráfica acumulada y tabla.',
    use: [
      'Periodos cortos y largos (hasta 10 años), igual que en Índices.',
      'Botones "✓ Todos / ✗ Ninguno" para la gráfica de líneas.',
    ],
    read: [
      'El mapa de calor revela la rotación sectorial: qué sectores lideran y cuáles rezagan.',
      'Sectores defensivos (Utilities, Salud) fuertes = mercado cauto; cíclicos (Tech, Consumo) fuertes = apetito por riesgo.',
    ],
  },
  {
    id: 'macro', icon: '🌐', title: 'Macro Research', tag: 'En vivo',
    what: 'El motor de la asignación institucional: curva de tipos del Tesoro USA, spreads 10Y-2Y y 10Y-3M con señal de inversión, inflación subyacente (IPC) y tipo efectivo de la Fed. Debajo, 37 fuentes curadas.',
    use: [
      'Observa la forma de la curva (3M → 30A) y los spreads.',
      'Las tarjetas de inflación se comparan con el objetivo del 2% de la Fed.',
      'Pulsa ↻ Actualizar para refrescar.',
    ],
    read: [
      'Curva INVERTIDA (10Y-2Y < 0) = históricamente anticipa recesión a 12-18 meses.',
      'Inflación por encima del 2% → la Fed mantiene tipos altos → presión sobre la renta variable (sobre todo growth).',
    ],
  },
  {
    id: 'valuation', icon: '🧮', title: 'Valoración DCF + ROIC', tag: 'Herramienta',
    what: 'Calculadora de valor intrínseco por Descuento de Flujos de Caja (DCF), con ayuda de WACC por CAPM y el chequeo de calidad ROIC vs WACC.',
    use: [
      'Escribe un ticker y pulsa "Traer datos" para autocompletar FCF, acciones, deuda, precio, beta y ROIC.',
      'Ajusta los supuestos: crecimiento, años, crecimiento terminal y WACC.',
      'Usa el panel CAPM (rf + β·ERP) y aplícalo como WACC con un clic. El tipo libre de riesgo ya viene del 10Y real.',
    ],
    read: [
      'Compara el valor intrínseco/acción con el precio: el "potencial" y el "margen de seguridad" indican si está infra/sobrevalorada.',
      'ROIC > WACC (spread positivo) = la empresa CREA valor. ROIC < WACC = posible trampa de valor.',
      'El DCF es muy sensible a los supuestos: trátalo como un rango y exige siempre margen de seguridad.',
    ],
  },
  {
    id: 'volprofile', icon: '📊', title: 'Volume Profile & VWAP', tag: 'Herramienta',
    what: 'Dónde se ha negociado de verdad el volumen: POC (precio de mayor actividad), Value Area (70% del volumen) y VWAP anclado.',
    use: [
      'Escribe un ticker, elige rango (3M-2A) y el ancla del VWAP (Inicio, YTD, Máximo o Mínimo).',
      'La gráfica de precio muestra VWAP y los niveles POC/VAH/VAL; el perfil horizontal marca el precio actual.',
    ],
    read: [
      'POC = imán y soporte/resistencia. Value Area = zona de "valor justo"; fuera de ella, precio en descubrimiento.',
      'Precio por encima del VWAP anclado = compradores en control desde ese punto. La lectura 🟢/🔴/🟡 lo resume.',
    ],
  },
  {
    id: 'smc', icon: '⚡', title: 'Smart Money (FVG / Order Blocks)', tag: 'Experimental',
    what: 'Detección de Fair Value Gaps (huecos de ineficiencia de 3 velas) y Order Blocks (última vela opuesta antes de un impulso). Conceptos heurísticos y discutidos.',
    use: [
      'Escribe un ticker y elige rango. Las bandas verde/roja marcan el soporte/resistencia activo más cercano.',
      'Las tablas listan cada zona con su estado: activa, mitigada o llena.',
    ],
    read: [
      'Las zonas son áreas de INTERÉS, no señales. El precio tiende a volver a los FVG sin rellenar.',
      'Úsalas como contexto junto al Volume Profile y la valoración, nunca de forma aislada.',
    ],
  },
];

const GLOSSARY = [
  ['POC (Point of Control)', 'Nivel de precio con mayor volumen negociado. Actúa como imán y soporte/resistencia.'],
  ['Value Area (VAH / VAL)', 'Rango donde se negoció el 70% del volumen. Fuera de él, el precio está en "descubrimiento".'],
  ['VWAP anclado', 'Precio medio ponderado por volumen desde un punto de referencia. Por encima = compradores en control.'],
  ['FVG (Fair Value Gap)', 'Hueco de ineficiencia de 3 velas que el precio tiende a rellenar.'],
  ['Order Block', 'Última vela opuesta antes de un movimiento impulsivo; zona donde quedaron órdenes institucionales.'],
  ['DCF', 'Descuento de flujos de caja futuros para estimar el valor intrínseco de una empresa.'],
  ['WACC', 'Coste medio ponderado del capital; la tasa a la que se descuentan los flujos futuros.'],
  ['ROIC', 'Retorno sobre el capital invertido. ROIC > WACC significa que la empresa crea valor.'],
  ['Curva invertida', 'Cuando el bono a 2 años renta más que el de 10 (spread 10Y-2Y < 0); históricamente anticipa recesión.'],
  ['Core PCE / CPI', 'Inflación subyacente (sin energía ni alimentos). El objetivo de la Fed es ~2%.'],
  ['Fear & Greed', 'Índice 0-100 de sentimiento. Contrarian: miedo extremo ≈ suelos; codicia extrema ≈ techos.'],
  ['Margen de seguridad', 'Diferencia entre valor intrínseco y precio. Cuanto mayor, más colchón ante errores de estimación.'],
];

const tagColor = (t) => t === 'Experimental' ? '#e67e22' : t === 'Herramienta' ? '#9b59b6' : '#2ecc71';

export default function Guide({ go }) {
  const [open, setOpen] = useState(() => new Set(['valuation']));
  const toggle = (id) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' };
  const list = { margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.8 };
  const subcap = { fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--gold)', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '12px' };

  return (
    <div className="section active">
      <div style={{ ...card, borderLeft: '4px solid var(--gold)', padding: '20px 24px', marginBottom: '18px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '16px', marginBottom: '6px' }}>Manual de Uso</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.7 }}>Guía rápida de las herramientas de análisis. Toca cada bloque para desplegarlo: qué es, cómo usarlo y cómo interpretarlo. Al final, un glosario de términos.</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {GUIDE.map(g => {
          const isOpen = open.has(g.id);
          return (
            <div key={g.id} style={card}>
              <div onClick={() => toggle(g.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 18px', cursor: 'pointer' }}>
                <span style={{ fontSize: '22px' }}>{g.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{g.title}</div>
                </div>
                <span style={{ fontFamily: "'DM Mono',monospace", fontSize: '9px', padding: '2px 8px', borderRadius: '10px', background: tagColor(g.tag) + '22', color: tagColor(g.tag) }}>{g.tag}</span>
                <span style={{ color: 'var(--muted)', fontSize: '14px', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▸</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.7, marginTop: '12px' }}>{g.what}</div>
                  <div style={subcap}>Cómo usarlo</div>
                  <ul style={list}>{g.use.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  <div style={subcap}>Cómo leerlo</div>
                  <ul style={list}>{g.read.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  {go && <button className="btn btn-outline" style={{ marginTop: '14px', fontSize: '11px' }} onClick={() => go(g.id)}>Abrir {g.title} ↗</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Glosario */}
      <div style={{ ...card, padding: '18px', marginTop: '18px' }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '14px' }}>Glosario de términos</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,280px),1fr))', gap: '12px' }}>
          {GLOSSARY.map(([term, def]) => (
            <div key={term} style={{ background: 'var(--surface2)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: '12px', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px' }}>{term}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>{def}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7 }}>
        📖 Todas las herramientas son de análisis y fines educativos; no constituyen asesoramiento de inversión. Los datos en vivo provienen de Yahoo Finance, CNN, alternative.me, BLS y la Reserva Federal de Nueva York.
      </div>
    </div>
  );
}
