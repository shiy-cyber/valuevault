import React from 'react';

export default function AboutUs() {
  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' };

  return (
    <div className="section active">
      <div style={{ ...card, borderLeft: '4px solid var(--gold)', padding: '24px 28px', maxWidth: '720px' }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '20px', marginBottom: '14px' }}>Quiénes somos</div>

        <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 14px' }}>
            ValueVault nace de una necesidad muy concreta: dejar de gestionar una cartera de inversión entre
            una decena de pestañas, hojas de cálculo y apps sueltas. Es un proyecto pequeño e independiente
            que recopila datos financieros y macroeconómicos dispersos por medio mundo y los convierte en
            gráficas, mapas de calor y medidores claros — para leer de un vistazo lo que de otra forma serían
            tablas interminables.
          </p>
          <p style={{ margin: '0 0 14px' }}>
            La fiabilidad y la veracidad de cada dato nos importan más que la cantidad: solo usamos fuentes
            primarias e institucionales, contrastadas y actualizadas, nunca cifras inventadas ni opiniones
            sin respaldo. Preferimos mostrar menos y que sea cierto, a mostrar más y que sea dudoso.
          </p>
          <p style={{ margin: '0 0 14px' }}>
            Seguimos ampliándolo poco a poco, con calma, priorizando que los datos sean fiables y las
            herramientas honestas antes que llamativas.
          </p>
          <p style={{ margin: 0 }}>
            ¿Preguntas, fallos o alguna idea? Escríbenos a{' '}
            <a href="mailto:hola@valuevault.es" style={{ color: 'var(--gold)' }}>hola@valuevault.es</a>.
            {' '}Consulta también nuestra{' '}
            <a href="/privacidad.html" style={{ color: 'var(--gold)' }}>Política de Privacidad</a>.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--surface2)', borderRadius: '8px', borderLeft: '3px solid var(--gold)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7, maxWidth: '720px' }}>
        ℹ️ ValueVault es una herramienta de análisis y organización con fines educativos; no constituye asesoramiento de inversión.
      </div>
    </div>
  );
}
