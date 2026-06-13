import React, { useState } from 'react';

const GUIDE = [
  {
    id: 'dashboard', icon: '◈', title: 'Dashboard y Riesgo de Cartera', tag: 'Cartera',
    what: 'Tu cartera valorada en euros: valor total, rendimiento ponderado por tamaño y un bloque de riesgo cuantitativo (volatilidad anualizada, máximo drawdown y matriz de correlación entre posiciones).',
    use: [
      'Añade cada activo con su Nº de acciones y divisa para que el valor y el P&L en € sean reales.',
      'Pulsa "↻ Actualizar precios" para refrescar las cotizaciones de toda la cartera.',
      'El bloque "Riesgo de Cartera" se calcula solo al abrir (histórico de 1 año, Yahoo).',
    ],
    read: [
      'El "Rendimiento ponderado (€)" pesa cada posición por su tamaño: ya no es una media simple que engaña.',
      'Volatilidad = cuánto oscila; Máx. drawdown = peor caída; Correlación media baja = buena diversificación.',
      '"Riesgo bajo (percibido)" es tu etiqueta manual; el riesgo MEDIDO está en el bloque de abajo.',
    ],
  },
  {
    id: 'assets', icon: '◆', title: 'Ficha de Activo (Score · Calidad · Consenso)', tag: 'Cartera',
    what: 'Al desplegar un activo: Score compuesto (Valor/Calidad/Momentum 0-100), Calidad del Capital (ROIC vs WACC + FCF yield), Revisiones de EPS, Consenso de analistas y los campos de proceso (motor de alfa, objetivo, stop, catalizador).',
    use: [
      'Pulsa "📊 Fundamentales" para traer ROIC/FCF/WACC + revisiones de EPS + consenso (requiere sesión; gasta cuota de Alpha Vantage solo cuando lo pides).',
      'Edita el activo para fijar tamaño, divisa, motor de alfa, precio objetivo, stop y catalizador.',
      '"🔄 Actualizar datos de mercado" refresca precio y fundamentales básicos.',
    ],
    read: [
      'El Score convierte ~24 ratios en 3 decisiones. Momentum lleva * si aún no hay revisiones de analistas.',
      'Badge ✓ crea valor = ROIC > WACC (negocio de calidad); ✗ destruye valor = ROIC < WACC.',
      'Rev. EPS verde = los analistas suben previsiones (momentum fundamental). Consenso: precio objetivo y % potencial.',
    ],
  },
  {
    id: 'charts', icon: '◎', title: 'Gráficos · Concentración', tag: 'Cartera',
    what: 'La composición REAL de tu cartera ponderada por valor en euros: por activo, sector, estrategia, riesgo y horizonte, todo en %.',
    use: [
      'Requiere que tus activos tengan tamaño (Nº de acciones) para ponderar por valor.',
      'Cada porción muestra su % del total; el tooltip añade el importe en €.',
    ],
    read: [
      'La "Concentración por Activo" revela si dependes demasiado de una posición (aviso si supera el 25%).',
      'Es concentración de verdad: un activo grande pesa más que uno pequeño, no cuenta por unidades.',
    ],
  },
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
    what: 'Detección de Fair Value Gaps y Order Blocks, ahora con validación por volumen, score de fuerza (0-100), breaker blocks, confluencia multi-timeframe (diario + semanal) y distancia al precio.',
    use: [
      'Escribe un ticker y elige rango. Las bandas verde/roja marcan el soporte/resistencia activo más cercano.',
      'En la tabla de Order Blocks ordena por "Fecha" o "Cercanía"; las zonas a <2% del precio se resaltan en dorado.',
      'Lee la columna Fuerza (⚡ = volumen alto), la etiqueta ⇄ breaker y ✦ semanal (confluencia con el gráfico semanal).',
    ],
    read: [
      'Las zonas son áreas de INTERÉS, no señales. Prioriza las de mayor Fuerza, con ⚡ y ✦ semanal.',
      'Un breaker es un Order Block roto que invierte su papel (soporte ↔ resistencia).',
      'Úsalas como contexto junto al Volume Profile, la gamma y la valoración, nunca de forma aislada.',
    ],
  },
  {
    id: 'gamma', icon: 'γ', title: 'Gamma / GEX (Opciones)', tag: 'Opciones',
    what: 'Exposición a gamma de los dealers a partir de la cadena de opciones (open interest + volatilidad implícita): GEX neto, gamma flip, call/put wall y dos gráficas (perfil por strike y curva de gamma).',
    use: [
      'Escribe un subyacente líquido de EE. UU. (SPY, QQQ, NVDA…) y elige el vencimiento.',
      'En el perfil por strike, las líneas ┄ marcan spot y flip; el borde dorado, los walls.',
      'La curva de gamma cruza cero justo en el gamma flip.',
    ],
    read: [
      'GEX > 0 (verde) = dealers en gamma larga → amortiguan el movimiento (menos volatilidad).',
      'GEX < 0 (rojo) = gamma corta → amplifican el movimiento (más inestable).',
      'Call wall = resistencia/imán por arriba; Put wall = soporte por abajo. Por debajo del flip, régimen inestable.',
      'Es una ESTIMACIÓN (el posicionamiento real de dealers no es público) y cubre un vencimiento.',
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
  ['Score compuesto', 'Resumen 0-100 en tres pilares: Valor, Calidad y Momentum. Convierte muchos ratios en 3 decisiones.'],
  ['FCF Yield', 'Flujo de caja libre respecto a la capitalización. El cash es más difícil de maquillar que el beneficio.'],
  ['Revisión de EPS', 'Cambio reciente de las previsiones de beneficio de los analistas. Al alza = momentum fundamental positivo.'],
  ['Volatilidad / Drawdown', 'Cuánto oscila un activo (anualizada) y su peor caída desde un máximo.'],
  ['Correlación', 'Mide si tus posiciones se mueven juntas (cerca de 1) o se compensan (negativa). Baja = mejor diversificación.'],
  ['GEX (Gamma Exposure)', 'Exposición a gamma de los dealers, en $ por cada 1% de movimiento. Positiva estabiliza el precio; negativa lo amplifica.'],
  ['Gamma flip', 'Precio donde la GEX total cruza cero. Por encima suele dominar la estabilidad; por debajo, la inestabilidad.'],
  ['Call / Put wall', 'Strike con mayor gamma de calls (resistencia/imán) o de puts (soporte).'],
  ['Breaker block', 'Order Block roto: el precio lo atravesó y ahora actúa con el papel inverso (soporte ↔ resistencia).'],
];

const tagColor = (t) => t === 'Experimental' ? '#e67e22' : t === 'Herramienta' ? '#9b59b6' : t === 'Cartera' ? '#3a8eff' : t === 'Opciones' ? '#c9a84c' : '#2ecc71';

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
