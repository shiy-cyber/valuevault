// ─────────────────────────────────────────────────────────────
// Asistente interno de ValueVault — BASADO EN REGLAS (sin IA externa,
// sin API, sin coste). Responde sobre: (1) definiciones/glosario,
// (2) cómo funciona la app, y (3) datos de TU cartera (calculados en
// el navegador a partir de los activos ya cargados).
// answer(question, ctx) → { text, chips?, action? }
//   ctx = { assets, notes, fxRates, go }
//   action = { label, section } → botón para navegar
//   chips  = [{ label, q }]     → sugerencias clicables
// ─────────────────────────────────────────────────────────────
import { changePct, positionMetrics, portfolioStats, compositeScore, fmt, fmtBase, fmtUsdCompact } from './format.js';

// Quita acentos, la letra griega alfa (α → alfa, usada en "Motor α") y
// separadores de las etiquetas de la ficha (P/E, Deuda/Equity, EPS Gr.5Y,
// ROIC − WACC…) para que preguntar con el texto tal cual aparece en pantalla
// funcione igual que preguntar con una frase natural.
// El guion/menos se convierte en ESPACIO (no se borra): "Z-Score" debía
// normalizar a "z score" (la clave del glosario), pero al borrarlo daba
// "zscore" y ni el glosario ni "el de mayor Z-Score" reconocían nada.
// El resto de separadores (/ & .) sí se borra sin más, como antes.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/α/g, 'alfa').replace(/[-−]/g, ' ').replace(/[/&.]/g, '').replace(/\s+/g, ' ').trim();
const has = (q, ...words) => words.some(w => q.includes(w));
const portfolioOf = (assets) => (assets || []).filter(a => a.type !== 'watchlist');
const watchlistOf = (assets) => (assets || []).filter(a => a.type === 'watchlist');

// ─── Glosario de conceptos ───────────────────────────────────
const GLOSSARY = {
  roic: ['ROIC', 'ROIC (Retorno sobre el Capital Invertido) = NOPAT ÷ capital invertido. Mide la rentabilidad que la empresa saca al dinero que pone a trabajar. Si el ROIC supera al WACC, la empresa CREA valor; si no, lo destruye. Por encima del 15% se considera excelente.'],
  wacc: ['WACC', 'WACC (Coste Medio Ponderado del Capital) = coste de financiarse mezclando deuda y fondos propios. Es la rentabilidad mínima que hay que superar para crear valor. En ValueVault se calcula con CAPM (coste de equity vía beta) + coste de deuda, ponderado por capitalización de mercado.'],
  dcf: ['DCF', 'DCF (Descuento de Flujos de Caja) = valora una empresa descontando sus flujos de caja libres futuros a valor presente con el WACC, más un valor terminal. Lo tienes en la sección "Valoración DCF".'],
  capex: ['CapEx', 'CapEx (Gastos de Capital) = lo que invierte la empresa en activos fijos (fábricas, data centers, equipos, tiendas…). En el panel de cada activo verás el importe, su intensidad (CapEx/Ingresos), si es de crecimiento o mantenimiento (CapEx/Amortización) y una explicación de en qué invierte.'],
  fcf: ['FCF', 'FCF (Flujo de Caja Libre) = caja operativa − CapEx. Es el dinero que sobra tras mantener e invertir en el negocio; el que se puede repartir, recomprar acciones o amortizar deuda.'],
  'fcf yield': ['FCF Yield', 'FCF Yield = FCF ÷ capitalización. Una "rentabilidad de caja". Por encima del 5% suele ser atractivo.'],
  per: ['P/E (PER)', 'P/E o PER (Precio/Beneficio) = precio entre beneficio por acción; cuántos años de beneficios pagas por la acción. Más bajo = más barato, en igualdad de condiciones.'],
  pb: ['P/B', 'P/B (Precio/Valor Contable) = precio entre valor en libros por acción. Útil sobre todo en bancos y empresas con muchos activos tangibles.'],
  peg: ['PEG', 'PEG = P/E ÷ crecimiento esperado del BPA. Ajusta el P/E por crecimiento: por debajo de 1 suele indicar oportunidad (GARP).'],
  evebitda: ['EV/EBITDA', 'EV/EBITDA = valor de empresa ÷ EBITDA. Múltiplo de valoración que ignora estructura de capital e impuestos; bueno para comparar entre empresas.'],
  ps: ['P/S', 'P/S (Precio/Ventas) = capitalización ÷ ingresos. Útil cuando aún no hay beneficios (growth).'],
  eps: ['EPS / BPA', 'EPS (BPA, Beneficio Por Acción) = beneficio neto ÷ nº de acciones. Su crecimiento y las revisiones de analistas son clave para el momentum.'],
  roe: ['ROE', 'ROE (Retorno sobre Fondos Propios) = beneficio neto ÷ patrimonio. Por encima del 15% es bueno. Ojo: puede inflarse con deuda.'],
  roa: ['ROA', 'ROA (Retorno sobre Activos) = beneficio neto ÷ activos totales. Mide eficiencia sin el efecto del apalancamiento.'],
  beta: ['Beta', 'Beta = sensibilidad del activo respecto al mercado. β>1 más volátil que el mercado; β<1 más defensivo. Se usa en el CAPM para el coste de equity.'],
  margen: ['Márgenes', 'Margen bruto (ventas − coste de ventas), operativo (tras gastos del negocio) y neto (beneficio final ÷ ingresos). Márgenes altos y estables = poder de fijación de precios.'],
  dividendo: ['Dividendo', 'Dividend Yield = dividendo anual ÷ precio. Payout = % del beneficio repartido. Un payout muy alto puede ser insostenible.'],
  moat: ['Moat', 'Moat = ventaja competitiva duradera (marcas, costes de cambio, efecto red, ventaja de costes, escala). Suele traducirse en ROIC alto y sostenido.'],
  'margen de seguridad': ['Margen de seguridad', 'Margen de seguridad (Graham) = comprar con descuento respecto al valor intrínseco para protegerte de errores. Graham recomendaba al menos un 33%.'],
  garp: ['GARP', 'GARP (Growth At a Reasonable Price) = crecimiento a precio razonable. Combina growth con valoración sensata; PEG < 1 es la señal típica.'],
  'volume profile': ['Volume Profile / VWAP', 'Volume Profile = volumen negociado por nivel de precio (POC, VAH, VAL = zonas de mayor interés). VWAP = precio medio ponderado por volumen. Sección "Vol. Profile / VWAP".'],
  'smart money': ['Smart Money', 'Smart Money Concepts: FVG (Fair Value Gaps, huecos de ineficiencia) y Order Blocks (zonas de órdenes institucionales). Es experimental, en la sección "Smart Money".'],
  gamma: ['Gamma / GEX', 'GEX (Gamma Exposure) = exposición a gamma de los market makers por strike. Marca "muros" de contención del precio. Sección "Gamma / GEX", con modo agregado de varios vencimientos.'],
  'trend following': ['Trend Following / CTA', 'Trend Following / CTA = estrategia de seguimiento de tendencia: señal por cruce de medias (MA50/200), canal Donchian, ATR para el stop y vol targeting para el tamaño. Sección "Trend Following / CTA".'],
  'fear and greed': ['Fear & Greed', 'Índice de miedo y codicia (CNN) + VIX + cripto. Miedo extremo puede ser señal contrarian de compra; codicia extrema, de cautela. Sección "Sentimiento".'],
  cape: ['CAPE / Shiller PE', 'CAPE (Shiller PE / PE10) = precio del S&P 500 ÷ beneficios medios de 10 años ajustados por inflación. Mide si el MERCADO ENTERO está caro o barato vs su historia (media ~17). Un CAPE alto se asocia a menores retornos a 10 años, pero es mal indicador de timing. Lo tienes EN VIVO en la sección "Sentimiento".'],
  shiller: ['CAPE / Shiller PE', 'El CAPE de Shiller (PE10) valora el S&P 500 con 10 años de beneficios ajustados por inflación. Media histórica ~17; alto = mercado caro. En vivo en la sección "Sentimiento".'],
  score: ['Score compuesto', 'Score compuesto (0-100) en 3 pilares: Valor (¿está barata? P/E, P/B, PEG, EV/EBITDA…), Calidad (¿es un buen negocio? ROE, ROIC, márgenes, deuda, Altman Z, Piotroski F, Beneish M) y Momentum (¿va a mejor? revisiones de EPS, sorpresas de resultados, tendencia de precio). Convierte ~30 ratios en 3 decisiones. El de Momentum es un proxy (rango 52 semanas + crecimiento del EPS) si aún no has traído revisiones de analistas.'],

  // ─── Salud financiera / riesgo de solvencia (Fase 2 institucional) ───
  'altman z': ['Altman Z-Score', 'Altman Z-Score = modelo de 1968 que combina 5 ratios de balance para estimar el riesgo de quiebra a ~24 meses vista. Zonas: Z > 2.99 segura · 1.81-2.99 zona gris · Z < 1.81 distrés financiero. Ojo: en empresas "asset-light" de alta capitalización (SaaS, tech) puede salir absurdamente alto — es un sesgo conocido de la fórmula, pensada para manufactureras. Sección "Salud Financiera" de cada activo (pulsa «📊 Fundamentales»).'],
  'z score': ['Altman Z-Score', 'Altman Z-Score = modelo de 1968 que combina 5 ratios de balance para estimar el riesgo de quiebra a ~24 meses vista. Zonas: Z > 2.99 segura · 1.81-2.99 zona gris · Z < 1.81 distrés financiero. Ojo: en empresas "asset-light" de alta capitalización (SaaS, tech) puede salir absurdamente alto — es un sesgo conocido de la fórmula, pensada para manufactureras. Sección "Salud Financiera" de cada activo (pulsa «📊 Fundamentales»).'],
  piotroski: ['Piotroski F-Score', 'Piotroski F-Score = 0 a 9 puntos sumando 9 tests binarios de rentabilidad, apalancamiento y eficiencia, comparando el año actual con el anterior. 7-9 = balance sólido · 4-6 = medio · 0-3 = débil. Filtro clásico contra "value traps" (empresas baratas pero deteriorándose por dentro). Todo o nada: si falta algún dato de los 2 años, queda en blanco en vez de dar un score parcial engañoso.'],
  'piotroski f': ['Piotroski F-Score', 'Piotroski F-Score = 0 a 9 puntos sumando 9 tests binarios de rentabilidad, apalancamiento y eficiencia, comparando el año actual con el anterior. 7-9 = balance sólido · 4-6 = medio · 0-3 = débil. Filtro clásico contra "value traps" (empresas baratas pero deteriorándose por dentro). Todo o nada: si falta algún dato de los 2 años, queda en blanco en vez de dar un score parcial engañoso.'],
  'f score': ['Piotroski F-Score', 'Piotroski F-Score = 0 a 9 puntos sumando 9 tests binarios de rentabilidad, apalancamiento y eficiencia, comparando el año actual con el anterior. 7-9 = balance sólido · 4-6 = medio · 0-3 = débil. Filtro clásico contra "value traps" (empresas baratas pero deteriorándose por dentro). Todo o nada: si falta algún dato de los 2 años, queda en blanco en vez de dar un score parcial engañoso.'],
  beneish: ['Beneish M-Score', 'Beneish M-Score = modelo de 1999 (8 variables) para detectar posible manipulación contable ANTES de fiarte de sus cuentas. M > -1.78 sugiere riesgo elevado; cuanto más negativo, mejor. Igual que el Piotroski, es todo o nada: si faltan datos de los 2 años que necesita, el score se queda vacío en vez de arriesgarse a un falso "todo bien".'],
  'beneish m': ['Beneish M-Score', 'Beneish M-Score = modelo de 1999 (8 variables) para detectar posible manipulación contable ANTES de fiarte de sus cuentas. M > -1.78 sugiere riesgo elevado; cuanto más negativo, mejor. Igual que el Piotroski, es todo o nada: si faltan datos de los 2 años que necesita, el score se queda vacío en vez de arriesgarse a un falso "todo bien".'],
  'm score': ['Beneish M-Score', 'Beneish M-Score = modelo de 1999 (8 variables) para detectar posible manipulación contable ANTES de fiarte de sus cuentas. M > -1.78 sugiere riesgo elevado; cuanto más negativo, mejor. Igual que el Piotroski, es todo o nada: si faltan datos de los 2 años que necesita, el score se queda vacío en vez de arriesgarse a un falso "todo bien".'],

  // ─── Ajustes institucionales de FCF/CapEx ────────────────────
  sbc: ['SBC (Stock-Based Compensation)', 'SBC = compensación que la empresa paga a empleados en ACCIONES en vez de en efectivo. No sale del flujo de caja operativo, pero SÍ diluye al accionista — por eso el FCF ajustado la resta: FCF ajustado = FCF − SBC. Fácil de infravalorar en empresas SaaS/tech que pagan mucho así.'],
  'fcf ajustado': ['FCF Ajustado por SBC', 'FCF ajustado = FCF − compensación en acciones (SBC), tratada como un gasto real en efectivo. Da una foto más conservadora que el FCF bruto en empresas que pagan mucho a su plantilla en acciones. Disponible como toggle en la calculadora «Valoración DCF».'],
  'capex mantenimiento': ['CapEx Mantenimiento vs Crecimiento', 'Heurística (Greenwald): CapEx de mantenimiento ≈ mínimo entre CapEx y Amortización (lo justo para reponer lo que se deprecia); CapEx de crecimiento = el resto (expansión real). Sirve para estimar el FCF "de verdad" para el accionista, descontando solo el CapEx de crecimiento si quieres ser conservador.'],
  'capex crecimiento': ['CapEx Mantenimiento vs Crecimiento', 'Heurística (Greenwald): CapEx de mantenimiento ≈ mínimo entre CapEx y Amortización (lo justo para reponer lo que se deprecia); CapEx de crecimiento = el resto (expansión real). Sirve para estimar el FCF "de verdad" para el accionista, descontando solo el CapEx de crecimiento si quieres ser conservador.'],
  'recompra neta': ['Recompra Neta de Dilución', 'Recompra neta = (recompras de acciones − emisión de nuevas acciones) ÷ capitalización. A diferencia del Shareholder Yield (que solo suma recompras+dividendos), esta RESTA lo que la empresa emite — una recompra "de cara a la galería" financiada con nueva emisión de acciones da ~0%.'],
  'net buyback yield': ['Recompra Neta de Dilución', 'Recompra neta = (recompras de acciones − emisión de nuevas acciones) ÷ capitalización. A diferencia del Shareholder Yield (que solo suma recompras+dividendos), esta RESTA lo que la empresa emite — una recompra "de cara a la galería" financiada con nueva emisión de acciones da ~0%.'],

  // ─── DCF automático, matriz de sensibilidad y TTM ────────────
  'matriz de sensibilidad': ['Matriz de Sensibilidad (DCF)', 'Tabla que recalcula el valor intrínseco variando el WACC y el crecimiento terminal alrededor de tus supuestos actuales — para ver de un vistazo cuánto cambia la valoración si esos dos números (los más discutibles del modelo) fueran algo distintos. Debajo de la tabla de proyección, en «Valoración DCF».'],
  ttm: ['TTM (Trailing Twelve Months)', 'TTM = últimos 12 meses (los 4 trimestres más recientes ya reportados), en vez de esperar al cierre del año fiscal. En el gráfico "Evolución de Valoración" aparece como un punto extra, más actual que el último ejercicio anual cerrado.'],
  'dcf automatico': ['DCF Automático', 'Versión de la calculadora DCF con supuestos por defecto (5 años de proyección, 2.5% de crecimiento terminal, WACC ya calculado) sin que tengas que tocar nada — así se puede puntuar TODA tu cartera de golpe en el filtro institucional del Screener. No sustituye a ajustar el modelo a mano para un candidato serio.'],
  'filtro institucional': ['Filtro Institucional (Screener)', 'En el Screener, arriba del todo: lista los activos de tu cartera/watchlist que cumplen A LA VEZ margen de seguridad (DCF automático) ≥25%, Piotroski F-Score >6 y Altman Z-Score >2.99 — confirmando ausencia de distrés financiero a corto plazo. Objetivo: reducir falsos positivos en growth y evitar "value traps".'],

  // ─── Tendencia del mercado de semiconductores ────────────────
  'ppi semiconductores': ['PPI de Semiconductores', 'Índice de precios de productor de la industria de semiconductores (BLS, EE.UU.), ajustado por calidad — NO es el precio spot: baja estructuralmente por la Ley de Moore incluso en plena escasez de chips. Sirve para ver la tendencia de precio de fondo a largo plazo (~10 años), complementando al spot diario. Sección "Tendencias".'],
  wsts: ['Facturación Mundial de Semiconductores (WSTS)', 'Facturación mensual real de toda la industria de semiconductores a nivel mundial, con histórico desde 1986 — el proxy de demanda más directo y con más recorrido disponible gratis. Sección "Tendencias" → Tendencia del Mercado de Semiconductores.'],
  'facturacion mundial': ['Facturación Mundial de Semiconductores (WSTS)', 'Facturación mensual real de toda la industria de semiconductores a nivel mundial, con histórico desde 1986 — el proxy de demanda más directo y con más recorrido disponible gratis. Sección "Tendencias" → Tendencia del Mercado de Semiconductores.'],

  // ─── Presión compradora/vendedora por sector ─────────────────
  'money flow': ['Chaikin Money Flow (presión compradora/vendedora)', 'Indicador técnico (no un fund flow real) que combina precio y volumen de los últimos 20 días para estimar si un sector ETF está en acumulación (>0) o distribución (<0). Los fund flows reales (entradas/salidas netas de dinero del ETF) son datos de pago y no están disponibles aquí. Sección "Tendencias" → gráfica de barras "Presión Compradora/Vendedora por Sector".'],
  'chaikin': ['Chaikin Money Flow (presión compradora/vendedora)', 'Indicador técnico (no un fund flow real) que combina precio y volumen de los últimos 20 días para estimar si un sector ETF está en acumulación (>0) o distribución (<0). Los fund flows reales (entradas/salidas netas de dinero del ETF) son datos de pago y no están disponibles aquí. Sección "Tendencias" → gráfica de barras "Presión Compradora/Vendedora por Sector".'],
  'fund flow': ['Chaikin Money Flow (presión compradora/vendedora)', 'Aquí NO mostramos fund flows reales (son datos de pago). Lo más cercano gratis es el Chaikin Money Flow: un indicador técnico de precio+volumen que aproxima si un sector ETF está en acumulación o distribución. Sección "Tendencias" → gráfica de barras "Presión Compradora/Vendedora por Sector".'],

  // ─── Ficha de un activo (panel expandido en Mis Activos) ─────
  'fwd pe': ['Fwd P/E (Forward)', 'Fwd P/E o P/E adelantado = precio ÷ beneficio por acción ESPERADO para el próximo ejercicio (no el ya reportado). Si es más bajo que el P/E normal, el mercado espera que el beneficio crezca; si es más alto, espera que caiga.'],
  'forward pe': ['Fwd P/E (Forward)', 'Fwd P/E o P/E adelantado = precio ÷ beneficio por acción ESPERADO para el próximo ejercicio (no el ya reportado). Si es más bajo que el P/E normal, el mercado espera que el beneficio crezca; si es más alto, espera que caiga.'],
  'motor alfa': ['Motor de Alfa', 'Etiqueta de qué tipo de ventaja buscas en ese activo: A·Momentum (se mueve por tendencia/noticias), B·Valor (barata frente a lo que vale) o C·Gema oculta (poco seguida, potencial no descubierto). La eliges tú al dar de alta el activo.'],
  catalizador: ['Catalizador', 'Catalizador = evento concreto que puede destapar el valor de la tesis (resultados, lanzamiento de producto, aprobación regulatoria…). Si no lo defines tú, la app auto-rellena la próxima fecha de resultados.'],
  'precio objetivo': ['Precio Objetivo (Consenso)', 'Precio Objetivo = media de las estimaciones de precio a 12 meses de los analistas que cubren la acción. El "Potencial" es cuánto le falta al precio actual para llegar ahí.'],
  'potencial de subida': ['Potencial (Upside)', 'Potencial = (precio objetivo del consenso ÷ precio actual − 1). Positivo = los analistas creen que puede subir; negativo = creen que está por encima de lo razonable.'],
  'consenso de analistas': ['Consenso de Analistas', 'Recomendación media de los analistas que cubren la acción (Compra fuerte, Compra, Mantener, Venta, Venta fuerte) + cuántos analistas la siguen. Más analistas = consenso más fiable, pero no infalible.'],
  'eps diluido': ['EPS Diluido', 'EPS Diluido = beneficio por acción contando TODAS las acciones que podrían llegar a existir (opciones, convertibles…), no solo las actuales. Suele ser algo menor que el EPS normal; es la cifra más conservadora.'],
  'eps del proximo ano': ['EPS Next Year', 'EPS estimado para el PRÓXIMO ejercicio fiscal, según el consenso de analistas. Compararlo con el EPS actual te dice el crecimiento de beneficio que se espera.'],
  'crecimiento del eps': ['Crecimiento del EPS (5 años)', 'Tasa de crecimiento anual esperada del beneficio por acción a 5 años. Es el denominador del PEG (P/E ÷ crecimiento) y una de las bases del pilar Momentum del score.'],
  'revision de eps': ['Revisión de EPS (30 días)', 'Cuánto han subido o bajado los analistas su estimación de beneficio en los últimos 30 días. Positivo = están mejorando su opinión sobre la empresa (momentum fundamental); negativo = la están empeorando.'],
  'sorpresa de resultados': ['Sorpresa de Resultados', 'Sorpresa = (beneficio REPORTADO − beneficio ESTIMADO) ÷ estimado, en %. "Batió" el trimestre si es positiva. Batir sistemáticamente varios trimestres seguidos es señal de que los analistas están siendo conservadores con esa empresa.'],
  'bate estimaciones': ['Sorpresa de Resultados', 'Sorpresa = (beneficio REPORTADO − beneficio ESTIMADO) ÷ estimado, en %. "Batió" el trimestre si es positiva. Batir sistemáticamente varios trimestres seguidos es señal de que los analistas están siendo conservadores con esa empresa.'],
  'crea valor destruye valor': ['ROIC − WACC (spread)', 'Si el ROIC supera al WACC, cada euro que la empresa reinvierte en el negocio vale MÁS de un euro (crea valor). Si el WACC supera al ROIC, reinvertir destruye valor — mejor que ese dinero vuelva vía dividendo/recompra que seguir invirtiéndolo dentro.'],
  'capex sobre ingresos': ['CapEx / Ingresos', 'Qué porcentaje de las ventas se reinvierte en activos fijos. ≥15% = intensiva en capital (fábricas, telecos…); 6-15% = moderada; <6% = ligera en activos (software, servicios).'],
  'capex sobre caja operativa': ['CapEx / Caja Operativa', 'Qué parte de la caja que genera el negocio (antes de invertir) se destina a CapEx. Un ratio muy alto deja poco margen para dividendos, recompras o pagar deuda.'],
  'capex sobre amortizacion': ['CapEx / Amortización (D&A)', 'Compara lo que se invierte hoy con lo que se está desgastando de los activos actuales. ≥1.2x = fase de expansión (invierte más de lo que desgasta); 0.8-1.2x = mantenimiento; <0.8x = desinversión o "cosecha" del negocio.'],
  'perfil de capex': ['Perfil de CapEx', 'Etiqueta que resume la intensidad de capital (Intensiva en capital / Capital moderado / Ligera en activos) y la fase (expansión / mantenimiento / desinversión) a partir de CapEx/Ingresos y CapEx/Amortización.'],
  'media movil': ['Medias Móviles (MA50/MA200)', 'MA50/MA200 = precio medio de los últimos 50 y 200 días — suavizan el ruido diario para ver la tendencia de fondo. Precio por encima de la MA200 suele leerse como tendencia alcista de largo plazo; por debajo, bajista.'],
  ma200: ['Medias Móviles (MA50/MA200)', 'MA50/MA200 = precio medio de los últimos 50 y 200 días — suavizan el ruido diario para ver la tendencia de fondo. Precio por encima de la MA200 suele leerse como tendencia alcista de largo plazo; por debajo, bajista.'],
  'shareholder yield': ['Shareholder Yield', 'Shareholder Yield = (recompras de acciones + dividendos pagados) ÷ capitalización. Mide TODO lo que la empresa devuelve al accionista, no solo el dividendo — muchas empresas devuelven más vía recompras que vía dividendo.'],
  dilucion: ['Dilución / Recompra de Acciones', 'Variación del número de acciones en circulación en 5 años. Negativo = la empresa ha recomprado acciones (tu porcentaje de la empresa sube sin hacer nada, bueno); positivo = ha emitido más acciones (te diluye, tu porcentaje baja).'],
  'racha de dividendos': ['Racha de Dividendos', 'Años CONSECUTIVOS que el dividendo anual ha subido respecto al anterior — proxy de "dividend aristocrat". Rachas largas (5+ años) suelen indicar un negocio estable con caja de sobra.'],
  'deuda equity': ['Deuda / Equity', 'Deuda total ÷ patrimonio neto. Cuánta deuda usa la empresa en relación a su capital propio. Por encima de 1-2x conviene mirar con más cuidado la capacidad de pagarla, sobre todo en sectores cíclicos.'],
  'current ratio': ['Current Ratio (Liquidez)', 'Activo corriente ÷ pasivo corriente. Por encima de 1 la empresa puede pagar sus deudas a corto plazo con lo que tiene a mano; por debajo de 1, podría tener apuros de liquidez.'],
  'quick ratio': ['Quick Ratio (Prueba Ácida)', 'Como el Current Ratio pero sin contar el inventario (más difícil de convertir en caja rápido). Mide la liquidez "de verdad" más exigente.'],
  'payout ratio': ['Payout Ratio', 'Qué porcentaje del beneficio se reparte como dividendo. Muy alto (>80-90%) deja poco margen de seguridad: si el beneficio cae un año malo, el dividendo puede peligrar.'],
  'market cap': ['Capitalización de Mercado', 'Precio de la acción × número de acciones = lo que el mercado valora la empresa entera hoy. Determina si es small/mid/large cap, algo relevante para el riesgo (las pequeñas suelen ser más volátiles).'],
  '52 week': ['Máximo / Mínimo de 52 Semanas', 'El precio más alto y más bajo que ha tocado la acción en el último año. Sirve de referencia rápida de dónde cotiza ahora dentro de su rango reciente.'],
  '52w high': ['Máximo / Mínimo de 52 Semanas', 'El precio más alto y más bajo que ha tocado la acción en el último año. Sirve de referencia rápida de dónde cotiza ahora dentro de su rango reciente.'],
  '52w low': ['Máximo / Mínimo de 52 Semanas', 'El precio más alto y más bajo que ha tocado la acción en el último año. Sirve de referencia rápida de dónde cotiza ahora dentro de su rango reciente.'],
  insider: ['Transacciones de Insiders', 'Compras y ventas de acciones de la propia empresa por parte de sus directivos/consejeros (información pública obligatoria en EE. UU.). Compras de insiders con su propio dinero suelen leerse como señal de confianza; ventas son más ambiguas (pueden ser solo diversificación personal).'],
  'sentimiento de noticias': ['Sentimiento de Noticias', 'Puntuación de -1 (muy bajista) a +1 (muy alcista) sobre las noticias recientes de esa acción en concreto, ponderada por lo relevante que es cada artículo para ese ticker — no es el sentimiento general del mercado (eso está en la sección "Sentimiento").'],
  pnl: ['P&L (Pérdidas y Ganancias)', 'P&L = valor actual de la posición − lo que invertiste, en tu divisa base (€). Se separa del "Ret. divisa": tu ganancia puede venir del propio activo, del movimiento de la divisa, o de ambos.'],
  pl: ['P&L (Pérdidas y Ganancias)', 'P&L = valor actual de la posición − lo que invertiste, en tu divisa base (€). Se separa del "Ret. divisa": tu ganancia puede venir del propio activo, del movimiento de la divisa, o de ambos.'],

  // ─── Alias de las etiquetas EXACTAS de la ficha (texto tal cual en pantalla) ──
  pe: ['P/E (PER)', 'P/E o PER (Precio/Beneficio) = precio entre beneficio por acción; cuántos años de beneficios pagas por la acción. Más bajo = más barato, en igualdad de condiciones.'],
  psales: ['P/S', 'P/S (Precio/Ventas) = capitalización ÷ ingresos. Útil cuando aún no hay beneficios (growth).'],
  deudaequity: ['Deuda / Equity', 'Deuda total ÷ patrimonio neto. Cuánta deuda usa la empresa en relación a su capital propio. Por encima de 1-2x conviene mirar con más cuidado la capacidad de pagarla, sobre todo en sectores cíclicos.'],
  'roic wacc': ['ROIC − WACC (spread)', 'Si el ROIC supera al WACC, cada euro que la empresa reinvierte en el negocio vale MÁS de un euro (crea valor). Si el WACC supera al ROIC, reinvertir destruye valor — mejor que ese dinero vuelva vía dividendo/recompra que seguir invirtiéndolo dentro.'],
  'eps diluted': ['EPS Diluido', 'EPS Diluido = beneficio por acción contando TODAS las acciones que podrían llegar a existir (opciones, convertibles…), no solo las actuales. Suele ser algo menor que el EPS normal; es la cifra más conservadora.'],
  'eps next y': ['EPS Next Year', 'EPS estimado para el PRÓXIMO ejercicio fiscal, según el consenso de analistas. Compararlo con el EPS actual te dice el crecimiento de beneficio que se espera.'],
  'eps gr5y': ['Crecimiento del EPS (5 años)', 'Tasa de crecimiento anual esperada del beneficio por acción a 5 años. Es el denominador del PEG (P/E ÷ crecimiento) y una de las bases del pilar Momentum del score.'],
  'rev eps': ['Revisión de EPS (30 días)', 'Cuánto han subido o bajado los analistas su estimación de beneficio en los últimos 30 días. Positivo = están mejorando su opinión sobre la empresa (momentum fundamental); negativo = la están empeorando.'],
  potencial: ['Potencial (Upside)', 'Potencial = (precio objetivo del consenso ÷ precio actual − 1). Positivo = los analistas creen que puede subir; negativo = creen que está por encima de lo razonable.'],
  recomendacion: ['Consenso de Analistas', 'Recomendación media de los analistas que cubren la acción (Compra fuerte, Compra, Mantener, Venta, Venta fuerte) + cuántos analistas la siguen. Más analistas = consenso más fiable, pero no infalible.'],
  analistas: ['Consenso de Analistas', 'Recomendación media de los analistas que cubren la acción (Compra fuerte, Compra, Mantener, Venta, Venta fuerte) + cuántos analistas la siguen. Más analistas = consenso más fiable, pero no infalible.'],
  'capex ingresos': ['CapEx / Ingresos', 'Qué porcentaje de las ventas se reinvierte en activos fijos. ≥15% = intensiva en capital (fábricas, telecos…); 6-15% = moderada; <6% = ligera en activos (software, servicios).'],
  'capex caja oper': ['CapEx / Caja Operativa', 'Qué parte de la caja que genera el negocio (antes de invertir) se destina a CapEx. Un ratio muy alto deja poco margen para dividendos, recompras o pagar deuda.'],
  'capex amortizacion': ['CapEx / Amortización (D&A)', 'Compara lo que se invierte hoy con lo que se está desgastando de los activos actuales. ≥1.2x = fase de expansión (invierte más de lo que desgasta); 0.8-1.2x = mantenimiento; <0.8x = desinversión o "cosecha" del negocio.'],
  ma50: ['Medias Móviles (MA50/MA200)', 'MA50/MA200 = precio medio de los últimos 50 y 200 días — suavizan el ruido diario para ver la tendencia de fondo. Precio por encima de la MA200 suele leerse como tendencia alcista de largo plazo; por debajo, bajista.'],
  'div yield': ['Dividendo', 'Dividend Yield = dividendo anual ÷ precio. Payout = % del beneficio repartido. Un payout muy alto puede ser insostenible.'],
  'mkt cap': ['Capitalización de Mercado', 'Precio de la acción × número de acciones = lo que el mercado valora la empresa entera hoy. Determina si es small/mid/large cap, algo relevante para el riesgo (las pequeñas suelen ser más volátiles).'],
  momentum: ['Score compuesto', 'Score compuesto (0-100) en 3 pilares: Valor (¿está barata? P/E, P/B, PEG, EV/EBITDA…), Calidad (¿es un buen negocio? ROE, ROIC, márgenes, deuda) y Momentum (¿va a mejor? revisiones de EPS, sorpresas de resultados, tendencia de precio). Convierte ~24 ratios en 3 decisiones. El de Momentum es un proxy (rango 52 semanas + crecimiento del EPS) si aún no has traído revisiones de analistas.'],
  'ret divisa': ['Ret. Divisa', 'Retorno por tipo de cambio: cuánto ha ganado o perdido tu posición SOLO por el movimiento de la divisa del activo frente a tu divisa base (€), separado del rendimiento propio del activo. Los dos se suman para dar el P&L total en euros.'],
  stop: ['Stop (Stop Loss)', 'Precio al que sales de la posición para limitar la pérdida si la tesis falla. Lo defines tú al dar de alta o editar el activo; no se calcula automáticamente.'],
  'gross mg': ['Márgenes', 'Margen bruto (ventas − coste de ventas), operativo (tras gastos del negocio) y neto (beneficio final ÷ ingresos). Márgenes altos y estables = poder de fijación de precios.'],
};
function glossaryHit(q) {
  // Coincidencia por término (el más largo primero para no cortar).
  // Los términos muy cortos (≤3, ej. "pe", "per", "eps") solo cuentan si
  // aparecen como palabra suelta, para no disparar dentro de otra palabra
  // (ej. "per" dentro de "operativo"); los términos más largos usan
  // coincidencia por subcadena, como siempre.
  const keys = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const hits = (n) => !!n && (n.length <= 3
    ? new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`).test(q)
    : q.includes(n));
  for (const k of keys) {
    if (hits(norm(k)) || hits(norm(GLOSSARY[k][0]))) {
      const [title, body] = GLOSSARY[k];
      return { text: `📘 ${title}\n\n${body}` };
    }
  }
  return null;
}

// ─── Ayuda de la app (cómo funciona) ─────────────────────────
const HELP = [
  { kw: ['anadir activo', 'agregar activo', 'nuevo activo', 'como meto', 'como añado', 'crear activo'], text: 'Pulsa «+ Nuevo Activo» (arriba a la derecha) o el botón de añadir. Rellena ticker, nombre, precio de entrada, tamaño y, opcionalmente, tesis/objetivo/stop. También puedes usar el autocompletado por ticker (Alpha Vantage).', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['watchlist', 'seguimiento'], text: 'La Watchlist es para activos que sigues pero NO tienes en cartera (marcados con ★). Es independiente de tu cartera real.', action: { label: 'Ir a Watchlist', section: 'watchlist' } },
  { kw: ['comparador', 'comparar'], text: 'El Comparador enfrenta 2-3 activos métrica a métrica; resalta en verde el mejor y en rojo el peor de cada fila.', action: { label: 'Ir al Comparador', section: 'compare' } },
  { kw: ['screener', 'filtrar acciones', 'buscar acciones'], text: 'El Stock Screener arma filtros (sector, capitalización, P/E, P/B, dividendo, ROE…) y te abre Finviz/StockAnalysis con esos filtros ya aplicados. Arriba del todo tienes además el «Filtro Institucional»: lista los activos de TU cartera/watchlist que cumplen a la vez margen de seguridad del DCF automático ≥25%, Piotroski F-Score >6 y Altman Z-Score >2.99.', action: { label: 'Ir al Screener', section: 'screener' } },
  { kw: ['fundamentales', 'roic', 'calcular calidad'], text: 'Abre un activo (clic en la fila) y pulsa «📊 Fundamentales» para traer ROIC, FCF Yield, WACC, CapEx (con desglose mantenimiento/crecimiento), SBC y FCF ajustado, recompra neta de dilución, Altman Z, Piotroski F, Beneish M, DCF automático y consenso de analistas (Alpha Vantage, 25 req/día).', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['valoracion', 'dcf', 'valor intrinseco', 'cuanto vale'], text: 'La sección «Valoración DCF» estima el valor intrínseco con descuento de flujos + ROIC/WACC, con matriz de sensibilidad WACC×crecimiento terminal y toggle de FCF ajustado por SBC. Autocompleta datos por ticker y aplica el WACC por estructura de capital.', action: { label: 'Ir a Valoración DCF', section: 'valuation' } },
  { kw: ['salud financiera', 'riesgo de quiebra', 'manipulacion contable'], text: 'La sección «Salud Financiera» de cada activo (dentro de la ficha, tras pulsar «📊 Fundamentales») trae 3 scores: Altman Z-Score (riesgo de quiebra), Piotroski F-Score (calidad del balance) y Beneish M-Score (riesgo de manipulación contable). Los tres son "todo o nada": si falta un dato, quedan en blanco en vez de dar un resultado a medias engañoso.', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['historico', 'grafico de precio', 'evolucion'], text: 'Abre un activo (clic en la fila) y verás el gráfico histórico de precio con rangos 1M/6M/1A/5A.', action: { label: 'Ir a Mis Activos', section: 'assets' } },
  { kw: ['exportar', 'export', 'backup', 'copia'], text: 'En la barra lateral (abajo) tienes «💾 Export» para descargar tu cartera y notas en JSON.' },
  { kw: ['cuenta', 'registrar', 'iniciar sesion', 'login', 'crear cuenta'], text: 'Pulsa «🔑 Iniciar sesión / Registrarse». Con cuenta, tu cartera y notas son privadas. Sin sesión ves la cartera DEMO (solo lectura).' },
  { kw: ['recuperacion', 'recuperar cuenta', 'olvide', 'contrasena'], text: 'La recuperación es por CÓDIGO (la app no envía correos). Guarda tu código «XXXX-XXXX-XXXX-XXXX»; para resetear necesitas email + código + nueva contraseña.' },
  { kw: ['notas', 'aprendizaje'], text: 'La sección «Aprendizaje» guarda notas de inversión, que puedes vincular a un activo concreto.', action: { label: 'Ir a Aprendizaje', section: 'learning' } },
  { kw: ['macro', 'tipos', 'inflacion', 'fed'], text: 'La sección «Macro Research» trae 37 indicadores en vivo (curva de tipos, inflación, empleo, Fed…) más fuentes de referencia. En el Dashboard también tienes un resumen rápido: curva 10Y-2Y, Core CPI, tipo Fed y paro.', action: { label: 'Ir a Macro', section: 'macro' } },
  { kw: ['semiconductores', 'chips', 'dram', 'nand', 'memoria ram', 'precio de la memoria'], text: 'En «Tendencias» (arriba del todo) tienes la Tendencia del Mercado de Semiconductores: demanda real desde 1986 (facturación mundial, WSTS), precio de fondo a ~10 años (PPI, BLS) y el spot diario de memoria DRAM/NAND/HBM (memoryindex.io) con histórico propio que se acumula día a día.', action: { label: 'Ir a Tendencias', section: 'trends' } },
  { kw: ['mapa de mercado', 'treemap', 'finviz'], text: 'El «Mapa de Mercado» es un treemap tipo Finviz con grandes valores coloreados por variación diaria. Doble clic en un valor abre su ficha en Finviz.', action: { label: 'Ir al Mapa', section: 'marketmap' } },
  { kw: ['manual', 'ayuda', 'como funciona', 'guia', 'instrucciones'], text: 'Tienes el «Manual de uso» en la sección «Aprendizaje y Manual» (pestaña Manual de uso). Y a mí puedes preguntarme definiciones, cómo usar cada sección y datos de tu cartera.', action: { label: 'Ir al Manual', section: 'learning' } },
];
function helpHit(q) {
  for (const h of HELP) if (has(q, ...h.kw.map(norm))) return { text: '🧭 ' + h.text, action: h.action };
  return null;
}

// ─── Métricas para superlativos ("mayor/menor/mejor/peor X") ──
const METRICS = [
  { field: 'pe', label: 'P/E', aliases: ['pe', 'p/e', 'per'], better: 'low', suf: 'x', valuation: true },
  { field: 'fpe', label: 'Forward P/E', aliases: ['forward pe', 'fwd pe', 'pe adelantado'], better: 'low', suf: 'x', valuation: true },
  { field: 'pb', label: 'P/B', aliases: ['pb', 'p/b'], better: 'low', suf: 'x', valuation: true },
  { field: 'ps', label: 'P/S', aliases: ['ps', 'p/s'], better: 'low', suf: 'x', valuation: true },
  { field: 'peg', label: 'PEG', aliases: ['peg'], better: 'low', valuation: true },
  { field: 'evebitda', label: 'EV/EBITDA', aliases: ['ev/ebitda', 'ev ebitda'], better: 'low', suf: 'x', valuation: true },
  { field: 'roe', label: 'ROE', aliases: ['roe'], better: 'high', suf: '%' },
  { field: 'roa', label: 'ROA', aliases: ['roa'], better: 'high', suf: '%' },
  { field: 'roic', label: 'ROIC', aliases: ['roic'], better: 'high', suf: '%' },
  { field: 'fcfy', label: 'FCF Yield', aliases: ['fcf yield', 'fcfy'], better: 'high', suf: '%' },
  { field: 'dy', label: 'Dividend Yield', aliases: ['dividendo', 'dividend', 'yield', 'rentabilidad por dividendo'], better: 'high', suf: '%' },
  { field: 'beta', label: 'Beta', aliases: ['beta'], better: 'low' },
  { field: 'gm', label: 'Margen Bruto', aliases: ['margen bruto', 'gross margin'], better: 'high', suf: '%' },
  { field: 'om', label: 'Margen Operativo', aliases: ['margen operativo', 'operating margin'], better: 'high', suf: '%' },
  { field: 'nm', label: 'Margen Neto', aliases: ['margen neto', 'net margin'], better: 'high', suf: '%' },
  { field: 'capex', label: 'CapEx', aliases: ['capex', 'gastos de capital'], better: 'high', usd: true },
  { field: 'altmanZ', label: 'Altman Z-Score', aliases: ['altman z', 'altman', 'z score'], better: 'high' },
  { field: 'piotroskiF', label: 'Piotroski F-Score', aliases: ['piotroski', 'piotroski f', 'f score'], better: 'high', suf: '/9' },
  { field: 'beneishM', label: 'Beneish M-Score', aliases: ['beneish', 'beneish m', 'm score'], better: 'low' },
  { field: 'dcfMarginOfSafety', label: 'Margen de Seguridad (DCF automático)', aliases: ['margen de seguridad', 'margen seguridad'], better: 'high', suf: '%' },
  { field: 'netBuybackYield', label: 'Recompra Neta de Dilución', aliases: ['recompra neta', 'net buyback yield'], better: 'high', suf: '%' },
];
function findMetric(q) {
  // alias más largo primero
  const all = METRICS.flatMap(m => m.aliases.map(a => ({ a: norm(a), m }))).sort((x, y) => y.a.length - x.a.length);
  for (const { a, m } of all) if (new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(q)) return m;
  return null;
}
function dirOf(q, metric) {
  if (has(q, 'mas caro', 'mas cara', 'mas caras', 'mas caros')) return 'max';
  if (has(q, 'mas barato', 'mas barata', 'mas baratas', 'mas baratos')) return 'min';
  if (has(q, 'mayor', 'mas alto', 'mas alta', 'maximo', 'mas grande', 'top', 'el que mas', 'la que mas')) return 'max';
  if (has(q, 'menor', 'mas bajo', 'mas baja', 'minimo', 'mas pequeno', 'el que menos', 'la que menos')) return 'min';
  if (has(q, 'mejor')) return metric.better === 'low' ? 'min' : 'max';
  if (has(q, 'peor')) return metric.better === 'low' ? 'max' : 'min';
  return null;
}
function extremum(list, field, dir) {
  const valid = list.filter(a => a[field] != null && a[field] !== '' && !isNaN(a[field]));
  if (!valid.length) return null;
  return valid.reduce((best, a) => ((dir === 'max' ? +a[field] > +best[field] : +a[field] < +best[field]) ? a : best));
}

// Resumen de un activo concreto
function assetCard(a) {
  const chg = changePct(a);
  const sc = compositeScore(a);
  const lines = [
    `📈 ${a.ticker} — ${a.name || ''}${a.sector ? ' · ' + a.sector : ''}`,
    `Precio: $${fmt(a.current)} (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vs entrada)`,
    `P/E ${fmt(a.pe)} · ROE ${fmt(a.roe)}% · ROIC ${a.roic != null ? a.roic + '%' : '—'} · Div ${a.dy != null ? a.dy + '%' : '—'}`,
    `Score compuesto: ${sc.total ?? '—'}/100 (Valor ${sc.value ?? '—'} · Calidad ${sc.quality ?? '—'} · Momentum ${sc.momentum ?? '—'})`,
  ];
  if (a.altmanZ != null || a.piotroskiF != null || a.beneishM != null) {
    lines.push(`Salud financiera: Altman Z ${a.altmanZ ?? '—'} · Piotroski F ${a.piotroskiF != null ? a.piotroskiF + '/9' : '—'} · Beneish M ${a.beneishM ?? '—'}`);
  }
  if (a.dcfMarginOfSafety != null) lines.push(`Margen de seguridad (DCF automático): ${a.dcfMarginOfSafety >= 0 ? '+' : ''}${a.dcfMarginOfSafety}%`);
  if (a.thesis) lines.push(`Tesis: ${a.thesis.slice(0, 180)}${a.thesis.length > 180 ? '…' : ''}`);
  return lines.join('\n');
}
function findAssetByText(q, assets) {
  const up = q.toUpperCase();
  // por ticker exacto en los tokens
  for (const a of assets) {
    const t = (a.ticker || '').toUpperCase();
    if (t && new RegExp(`(^|[^A-Z0-9.])${t.replace('.', '\\.')}([^A-Z0-9.]|$)`).test(up)) return a;
  }
  // por nombre (palabra significativa)
  for (const a of assets) {
    const n = norm(a.name || '');
    if (n && n.split(' ').some(w => w.length > 3 && q.includes(w))) return a;
  }
  return null;
}

// ─── Router principal ────────────────────────────────────────
export function answer(question, ctx = {}) {
  const q = norm(question);
  const assets = ctx.assets || [];
  const port = portfolioOf(assets);
  const fx = ctx.fxRates || { EUR: 1 };
  if (!q) return { text: 'Pregúntame algo 🙂' };

  // Capacidades / ayuda general
  if (has(q, 'que puedes hacer', 'que sabes', 'ayuda', 'que eres', 'para que sirves', 'opciones')) {
    return {
      text: '🤖 Soy el asistente de ValueVault. Puedo ayudarte con:\n\n• Definiciones: «¿qué es el ROIC?», «explícame el DCF», «qué es el Piotroski F-Score».\n• Cómo usar la app: «cómo añado un activo», «para qué sirve el screener», «qué es el filtro institucional».\n• Tu cartera: «mi mejor activo», «cuáles están en pérdidas», «valor de mi cartera», «el de mayor Altman Z», «háblame de AAPL».\n\nSoy local (sin coste, sin enviar nada fuera).',
      chips: [
        { label: '¿Qué es el Piotroski F-Score?', q: '¿qué es el Piotroski F-Score?' },
        { label: 'Mi mejor activo', q: 'mi mejor activo' },
        { label: 'Valor de mi cartera', q: 'valor de mi cartera' },
        { label: '¿Cómo añado un activo?', q: '¿cómo añado un activo?' },
      ],
    };
  }

  // Preguntas de tipo definición/ayuda → glosario/ayuda ANTES que los datos
  // (evita que "qué es la watchlist" devuelva el contenido en vez de explicarla)
  if (has(q, 'que es', 'que son', 'que significa', 'que quiere decir', 'para que sirve', 'para que vale', 'explica', 'explicame', 'define', 'definicion de', 'que diferencia')) {
    const g0 = glossaryHit(q); if (g0) return g0;
    const h0 = helpHit(q); if (h0) return h0;
  }

  // ── Datos de la cartera ──
  const portIntent = has(q, 'mi ', 'mis ', 'cartera', 'tengo', 'tenemos', 'mi cartera', 'portfolio');

  // Valor total de la cartera
  if (has(q, 'valor', 'cuanto vale mi', 'cuanto tengo', 'total de mi') && (portIntent || has(q, 'cartera'))) {
    const st = portfolioStats(port, fx);
    if (st.valueBase == null) return { text: '💼 No puedo calcular el valor: necesito tamaño de posición (nº de acciones) y precio en tus activos. Edita un activo y añade el tamaño.' };
    const pnl = st.pnlBase, ret = st.returnPct;
    return { text: `💼 Valor de tu cartera: ${fmtBase(st.valueBase)}\nP&L: ${fmtBase(pnl)} (${ret != null ? (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%' : '—'})\nPosiciones valoradas: ${st.sized}${st.unsized ? ` (${st.unsized} sin tamaño)` : ''}` };
  }

  // Rendimiento / P&L
  if (has(q, 'rendimiento', 'p&l', 'pnl', 'como va mi', 'como voy', 'ganando', 'perdiendo') && portIntent) {
    const st = portfolioStats(port, fx);
    if (st.returnPct == null) return { text: '📊 Aún no puedo medir el rendimiento (faltan tamaños/precio). Añade el tamaño de posición a tus activos.' };
    return { text: `📊 Rendimiento de la cartera: ${st.returnPct >= 0 ? '+' : ''}${st.returnPct.toFixed(1)}% · P&L ${fmtBase(st.pnlBase)} sobre ${fmtBase(st.costBase)} invertidos.` };
  }

  // En pérdidas / en ganancias
  if (has(q, 'perdidas', 'en rojo', 'perdiendo', 'bajando')) {
    const losers = port.filter(a => changePct(a) < 0).sort((x, y) => changePct(x) - changePct(y));
    if (!losers.length) return { text: '✅ Ninguno de tus activos está en pérdidas ahora mismo.' };
    return { text: '🔻 Activos en pérdidas:\n' + losers.map(a => `• ${a.ticker}: ${changePct(a).toFixed(2)}%`).join('\n') };
  }
  if (has(q, 'ganancias', 'en verde', 'ganando', 'subiendo', 'plusvalia')) {
    const win = port.filter(a => changePct(a) > 0).sort((x, y) => changePct(y) - changePct(x));
    if (!win.length) return { text: 'Ninguno de tus activos está en positivo ahora mismo.' };
    return { text: '🟢 Activos en ganancias:\n' + win.map(a => `• ${a.ticker}: +${changePct(a).toFixed(2)}%`).join('\n') };
  }

  // Listado / conteo
  if (has(q, 'que activos', 'cuales activos', 'lista', 'que tengo', 'mis activos') && !findMetric(q)) {
    if (!port.length) return { text: 'Tu cartera está vacía. Añade un activo con «+ Nuevo Activo».', action: { label: 'Ir a Mis Activos', section: 'assets' } };
    return { text: `💼 Tienes ${port.length} activos:\n` + port.map(a => `• ${a.ticker} — ${a.name || ''}`).join('\n') };
  }
  if (has(q, 'cuantos activos', 'numero de activos')) {
    return { text: `Tienes ${port.length} activos en cartera y ${watchlistOf(assets).length} en seguimiento (watchlist).` };
  }
  if (has(q, 'watchlist', 'seguimiento') && has(q, 'que', 'cuales', 'lista', 'tengo')) {
    const wl = watchlistOf(assets);
    if (!wl.length) return { text: 'Tu watchlist está vacía.' };
    return { text: '★ En seguimiento:\n' + wl.map(a => `• ${a.ticker} — ${a.name || ''}`).join('\n') };
  }
  if (has(q, 'cuantas notas', 'numero de notas')) {
    return { text: `Tienes ${(ctx.notes || []).length} notas de aprendizaje.` };
  }

  // Mejor / peor por puntuación — OJO: "score" es subcadena de "Z-Score"/
  // "F-Score"/"M-Score" (Altman/Piotroski/Beneish, ya normalizados con
  // espacio), así que sin el `!findMetric(q)` esta rama genérica secuestraba
  // "el de mayor Z-Score" antes de llegar a su métrica específica de abajo.
  if (has(q, 'mejor', 'peor', 'mayor', 'menor') && has(q, 'score', 'puntuacion', 'puntaje') && !findMetric(q)) {
    const dir = has(q, 'peor', 'menor', 'mas bajo') ? 'min' : 'max';
    const scored = port.map(a => ({ a, s: compositeScore(a).total })).filter(x => x.s != null);
    if (!scored.length) return { text: 'No tengo scores calculados. Pulsa «📊 Fundamentales» en tus activos.' };
    const pick = scored.reduce((b, x) => ((dir === 'max' ? x.s > b.s : x.s < b.s) ? x : b));
    return { text: `🏅 El de ${dir === 'max' ? 'mejor' : 'peor'} score es ${pick.a.ticker} con ${pick.s}/100.` };
  }

  // Superlativo por métrica (mayor ROE, más barato por P/E, mejor dividendo…)
  const metric = findMetric(q);
  if (metric && has(q, 'mayor', 'menor', 'mejor', 'peor', 'mas alto', 'mas bajo', 'mas caro', 'mas barato', 'top', 'el que mas', 'el que menos', 'maximo', 'minimo')) {
    const dir = dirOf(q, metric) || (metric.better === 'low' ? 'min' : 'max');
    const pick = extremum(port, metric.field, dir);
    if (!pick) return { text: `No tengo el dato de ${metric.label} en tus activos. Pulsa «📊 Fundamentales» o «🔄 Actualizar datos».` };
    const val = metric.usd ? fmtUsdCompact(pick[metric.field]) : fmt(pick[metric.field]) + (metric.suf || '');
    return { text: `📌 ${pick.ticker} es el de ${dir === 'max' ? 'mayor' : 'menor'} ${metric.label}: ${val}.` };
  }

  // Mejor / peor activo (por variación) sin métrica
  if (has(q, 'mejor activo', 'peor activo', 'el que mas sube', 'el que mas baja', 'mas sube', 'mas baja', 'mas rentable')) {
    if (!port.length) return { text: 'Tu cartera está vacía.' };
    const dir = has(q, 'peor', 'mas baja', 'mas cae', 'que mas baja') ? 'min' : 'max';
    const pick = port.slice().sort((x, y) => changePct(y) - changePct(x))[dir === 'max' ? 0 : port.length - 1];
    return { text: `${dir === 'max' ? '🚀' : '🔻'} Tu ${dir === 'max' ? 'mejor' : 'peor'} activo (por variación) es ${pick.ticker}: ${changePct(pick) >= 0 ? '+' : ''}${changePct(pick).toFixed(2)}%.` };
  }

  // Ficha de un activo concreto ("háblame de AAPL", "info MSFT")
  const named = findAssetByText(question, assets);
  if (named && (has(q, 'info', 'habla', 'dime', 'que tal', 'como va', 'resumen', 'detalle', 'sobre') || norm(question).split(' ').length <= 3)) {
    return { text: assetCard(named) };
  }

  // ── Glosario y ayuda ──
  const g = glossaryHit(q);
  if (g) return g;
  const h = helpHit(q);
  if (h) return h;

  // Fallback
  return {
    text: 'No estoy seguro de eso 🤔. Soy un asistente de reglas (sin IA externa). Puedo con: definiciones (ROIC, WACC, DCF, CapEx, Altman Z, Piotroski F, Beneish M…), cómo usar la app, y datos de tu cartera (mejor/peor activo, en pérdidas, valor total, mayor ROE, ficha de un ticker…).',
    chips: [
      { label: '¿Qué es el WACC?', q: '¿qué es el WACC?' },
      { label: 'Activos en pérdidas', q: 'qué activos tengo en pérdidas' },
      { label: 'Mayor ROE', q: 'el de mayor ROE' },
      { label: '¿Cómo uso el screener?', q: '¿cómo uso el screener?' },
    ],
  };
}

export const WELCOME = {
  text: '👋 Hola, soy el asistente de ValueVault (local, sin coste). Pregúntame definiciones, cómo usar la app o datos de tu cartera.',
  chips: [
    { label: '¿Qué es el ROIC?', q: '¿qué es el ROIC?' },
    { label: 'Mi mejor activo', q: 'mi mejor activo' },
    { label: 'Valor de mi cartera', q: 'valor de mi cartera' },
    { label: '¿Qué puedes hacer?', q: '¿qué puedes hacer?' },
  ],
};
