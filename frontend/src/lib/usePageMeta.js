import { useEffect } from 'react';

// Actualiza <title> y <meta name="robots"> según la ruta activa. `indexable`
// separa lo público (herramientas de mercado, comunidad) de lo privado
// (cartera del usuario) — Google no debe indexar datos de una cuenta.
export function usePageMeta(title, indexable) {
  useEffect(() => {
    document.title = title ? `${title} — ValueVault` : 'ValueVault';
    let tag = document.querySelector('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', indexable ? 'index, follow' : 'noindex, follow');
  }, [title, indexable]);
}
