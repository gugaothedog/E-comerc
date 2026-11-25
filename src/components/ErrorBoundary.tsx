import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Ocorreu um erro inesperado na aplicação.',
    };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && parsed.error) {
          friendly = `Erro de operação (${parsed.operationType || 'dados'}): ${parsed.error}`;
        }
      } catch {
        // Keep raw message
      }
      return (
        <div className="min-h-screen bg-white text-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-zinc-200 rounded-xl p-8 space-y-4">
            <h2 className="text-xl font-bold font-display">Algo precisou ser interrompido</h2>
            <p className="text-sm text-zinc-600 leading-relaxed break-words">{friendly}</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm font-semibold bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Recarregar página
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.history.pushState({}, '', '/');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-800 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                Voltar à loja
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
