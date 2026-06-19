import { Component, type ErrorInfo, type ReactNode } from "react";
import { pushToast } from "../extension-host/ui-service";
import "./ErrorBoundary.css";

interface Props {
  children: ReactNode;
  /** Label used in console output to identify where the error occurred. */
  name?: string;
  /** Override the default fallback UI entirely. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const label = this.props.name ? `:${this.props.name}` : "";
    console.error(`[ErrorBoundary${label}]`, error, info.componentStack);
    pushToast("error", error.message, {
      title: `Render error${this.props.name ? ` in ${this.props.name}` : ""}`,
      dedupKey: `error-boundary:${error.message}`,
    });
  }

  retry = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <DefaultFallback
        error={this.state.error}
        name={this.props.name}
        onRetry={this.retry}
      />
    );
  }
}

function DefaultFallback({
  error,
  name,
  onRetry,
}: {
  error: Error;
  name?: string;
  onRetry: () => void;
}) {
  const isDev = import.meta.env.DEV;
  return (
    <div className="error-boundary-fallback">
      <div className="error-boundary-fallback__icon">⚠</div>
      <p className="error-boundary-fallback__message">
        {isDev ? error.message : "Something went wrong"}
        {name && (
          <span className="error-boundary-fallback__name"> ({name})</span>
        )}
      </p>
      {isDev && error.stack && (
        <details className="error-boundary-fallback__details">
          <summary>Stack trace</summary>
          <pre className="error-boundary-fallback__stack">{error.stack}</pre>
        </details>
      )}
      <button className="error-boundary-fallback__retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
