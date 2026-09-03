import React from 'react';
import i18next from '../i18n/index.js';

// Contiene un crash de render al subárbol afectado en vez de tumbar toda la
// app — un ticker con datos parciales de una API externa no debe dejar en
// blanco la sesión de un usuario. Clase por requisito de React (no hay hook
// equivalente a componentDidCatch).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          ⚠️ {i18next.t('errorBoundary.message')}
        </div>
      );
    }
    return this.props.children;
  }
}
