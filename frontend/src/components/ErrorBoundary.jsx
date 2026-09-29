import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Component crashed:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          fontFamily: 'monospace',
          background: '#1e1e1e',
          color: '#ff6b6b',
          minHeight: '100vh',
          overflow: 'auto'
        }}>
          <h2 style={{ color: '#ff6b6b' }}>⚠ Dashboard crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ffd166' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#aaa', fontSize: 12 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
