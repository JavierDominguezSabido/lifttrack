import { Component, Suspense, type ReactNode } from 'react'

/** Keep navigation usable while a route loads, including after a failed chunk request. */
export class DeferredRoute extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <div className="space-y-3 p-6">
        <p role="alert">No se pudo abrir esta pantalla. Comprueba la conexión y recarga para volver a intentarlo.</p>
        <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>Recargar pantalla</button>
      </div>
    }
    return <Suspense fallback={<p role="status" className="p-6 text-sm text-secondary">Cargando pantalla…</p>}>
      {this.props.children}
    </Suspense>
  }
}
