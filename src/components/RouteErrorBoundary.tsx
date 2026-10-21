import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render errors from the routed page tree.
 *
 * Before this existed, ANY crash inside a page unmounted the whole React tree
 * — a white screen with no message, and the impersonation banner disappearing
 * with it (the owner, 25 Aug: /admin/ceo/sales and /admin/ceo/fulfilment). The
 * banner and broadcast bar are siblings of <Routes>, so wrapping only the
 * routes keeps them alive while a broken page shows something readable.
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the browser console and the hosted builder's runtime-error capture.
    console.error("[RouteErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold">This page hit a problem</h1>
          <p className="text-sm text-muted-foreground">
            Nothing has been lost. Try again, or move to another tab — the rest of
            Vexon OS is still working.
          </p>
          <p className="text-xs text-muted-foreground/80 font-mono break-words">
            {error.message}
          </p>
          <div className="flex gap-2 justify-center pt-1">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60 transition"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 transition"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
