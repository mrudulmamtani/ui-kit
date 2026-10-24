/*
 * ErrorBoundary — the only mechanism React gives us for containing a render-time throw.
 * Boundaries have no hook equivalent (getDerivedStateFromError / componentDidCatch are
 * class-only), so this is the app's one class component.
 *
 * The fallback is a deliberate sibling of `SurfaceError` (./SurfaceState.tsx): the same centred
 * plate, the same hairline register, the same danger glyph. It does not *compose* SurfaceError
 * because that component asserts one fixed cause — "Couldn't load the enterprise", start the data
 * server — which would be a false statement about a render fault, and this product's whole claim
 * is that it does not overstate what it knows. For the same reason the thrown message is shown
 * verbatim in a recessive mono well rather than swallowed behind a friendly sentence.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "./primitives";
import "./surface-state.css";
import "./error-boundary.css";

export interface ErrorBoundaryProps {
  /** What is being guarded, in the reader's language — named directly in the fallback copy. */
  readonly surface: string;
  /**
   * Changing this clears a caught error. Pass the active route id so navigating away from a
   * broken surface leaves the boundary clean rather than pinning the fault to the frame.
   */
  readonly resetKey?: string | number;
  /** Overrides the containment sentence where "another surface is still reachable" is untrue. */
  readonly detail?: ReactNode;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  readonly componentStack: string | null;
  /** A retry that did not clear the fault. Changes the copy; never rendered as a figure. */
  readonly retried: boolean;
}

const CLEARED: ErrorBoundaryState = { error: null, componentStack: null, retried: false };

/** React hands `getDerivedStateFromError` whatever was thrown — not necessarily an Error. */
function asError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  return new Error(describe(thrown));
}

function describe(thrown: unknown): string {
  if (typeof thrown === "string") return thrown;
  try {
    return String(thrown);
  } catch {
    return "A non-Error value was thrown during render and could not be read.";
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = CLEARED;

  static getDerivedStateFromError(thrown: unknown): Pick<ErrorBoundaryState, "error" | "componentStack"> {
    return { error: asError(thrown), componentStack: null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack ?? null;
    this.setState({ componentStack: stack });
    // '[ui]' prefix: console-reading tooling greps for it. Rename to your product's tag.
    console.error(`[ui] Render fault contained in ${this.props.surface}.`, error, stack ?? "");
  }

  override componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState(CLEARED);
      return;
    }
    // This method only runs after a commit that did NOT throw, so reaching here with no error
    // means the retry genuinely worked — forget it, so a later, unrelated fault is not
    // mislabelled as one a retry failed to clear.
    if (this.state.error === null && this.state.retried) {
      this.setState({ retried: false });
    }
  }

  private readonly retry = (): void => {
    // Keep `retried` so a fault that survives the remount says so instead of looping silently.
    this.setState({ error: null, componentStack: null, retried: true });
  };

  override render(): ReactNode {
    const { error, componentStack, retried } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="eb-root surface-msg" role="alert" aria-live="assertive">
        <div className="msg-card eb-card">
          <CircleAlert size={22} className="msg-icon danger" aria-hidden />
          <h2>{this.props.surface} stopped rendering</h2>
          <p className="faint">
            {this.props.detail ?? (
              <>
                The fault was contained to this surface. The navigation rail and top bar are
                unaffected — open another surface, or retry.
              </>
            )}
          </p>
          <p className="eb-caution">
            Nothing here was drawn, so nothing here is current. Treat any figure read before the
            fault as unverified until this surface renders again.
          </p>
          <pre className="eb-trace mono">{`${error.name}: ${error.message}`}</pre>
          {retried && (
            <p className="eb-note faint">
              A retry did not clear this fault, so it is unlikely to be transient. Open another
              surface, or reload the application once the cause is addressed.
            </p>
          )}
          <div className="eb-actions">
            <Button
              variant="primary"
              size="sm"
              icon={<RotateCcw size={15} strokeWidth={1.8} />}
              onClick={this.retry}
            >
              Retry
            </Button>
          </div>
          {componentStack !== null && componentStack.trim() !== "" && (
            <details className="eb-stack">
              <summary>Component stack</summary>
              <pre className="mono">{componentStack.trim()}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
