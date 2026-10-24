/*
 * Shared loading / error / empty states. Loading uses shimmer skeletons (never a spinner-only
 * void); errors are calm and actionable; empties explain what would fill the space.
 */
import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import "./surface-state.css";

/*
 * The loading state deliberately renders a <section>, not a <div>. Every surface's content root is
 * a <div>, so the element TYPE changes when the record arrives — React tears the skeleton down and
 * mounts the content fresh, which is what lets `.surface`'s entrance animation actually run. With
 * both as <div>s React reused the same DOM node, the class simply swapped, and the content popped.
 */
export function SurfaceLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <section className="surface surface-loading" role="status" aria-live="polite">
      <div className="skel-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div className="skel skel-kpi" key={i} />
        ))}
      </div>
      <div className="skel-grid">
        <div className="skel skel-panel wide" />
        <div className="skel skel-panel" />
        <div className="skel skel-panel" />
        <div className="skel skel-panel wide" />
      </div>
      <span className="surface-loading-label faint">{label}</span>
    </section>
  );
}

export function SurfaceError({
  message,
  title = "Couldn’t load this view",
  hint,
}: {
  message: string;
  /** What failed, named in the product's own words. */
  title?: string;
  /** Optional recovery instruction — a command to run, a page to check. Set in mono. */
  hint?: ReactNode;
}) {
  return (
    <div className="surface surface-msg">
      <div className="msg-card">
        <CircleAlert size={22} className="msg-icon danger" />
        <h2>{title}</h2>
        <p className="faint">{message}</p>
        {hint && <p className="msg-hint mono">{hint}</p>}
      </div>
    </div>
  );
}

export function SurfaceEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="surface surface-msg">
      <div className="msg-card">
        <h2>{title}</h2>
        {children && <p className="faint">{children}</p>}
      </div>
    </div>
  );
}
