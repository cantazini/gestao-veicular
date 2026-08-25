import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

type BoundaryProps = { children: ReactNode; resetKey: string; onReset: () => void };
type BoundaryState = { hasError: boolean };

class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Erro inesperado de renderização.", { name: error.name, componentStack: info.componentStack });
  }

  componentDidUpdate(previous: BoundaryProps): void {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) this.setState({ hasError: false });
  }

  private reset = () => { this.setState({ hasError: false }); this.props.onReset(); };

  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="fatal-error" role="alert"><AlertTriangle/><h1>Não foi possível exibir esta página</h1><p>Ocorreu um erro inesperado de interface. Seus dados não foram alterados.</p><button className="button primary" onClick={this.reset}>Voltar ao painel</button></main>;
  }
}

export function GlobalErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  return <ErrorBoundary resetKey={location.pathname} onReset={() => navigate("/")}>{children}</ErrorBoundary>;
}
