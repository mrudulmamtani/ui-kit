/*
 * Core primitives. Deliberately small — four components and one helper. All visuals come
 * from tokens.css; nothing here hard-codes a colour, a size or a radius.
 *
 * Extend rather than fork: a fifth variant on `Button` is cheaper than a second button.
 */
import type { ReactNode } from "react";
import "./primitives.css";

/* -------------------------------------------------------------------- Panel
 * The unit of composition on this register: a white plate on the cool canvas, structured
 * by a hairline and an optional head. The eyebrow carries the caps; the title carries the
 * serif. A panel with neither head nor actions renders as a bare plate. */
export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** `false` when the body is a grid or a table that owns its own gutters. */
  padded?: boolean;
}) {
  return (
    <section className={`panel${className ? " " + className : ""}`}>
      {(title || actions || eyebrow) && (
        <header className="panel-head">
          <div className="panel-head-titles">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="panel-title">{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={padded ? "panel-body" : "panel-body flush"}>{children}</div>
    </section>
  );
}

/* --------------------------------------------------------------------- Chip
 * Six tones, each with one meaning. `neutral` is the default and should stay the common
 * case — a screen where every chip is coloured has no emphasis left to spend. */
export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export function Chip({
  tone = "neutral",
  children,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  /** Leading status dot. Use when the chip reports a STATE, not when it is a label. */
  dot?: boolean;
}) {
  return (
    <span className={`chip tone-${tone}`}>
      {dot && <span className="chip-dot" aria-hidden />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- Button */
export function Button({
  children,
  variant = "default",
  tone,
  onClick,
  icon,
  size = "md",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "default" | "ghost";
  tone?: Tone;
  onClick?: () => void;
  icon?: ReactNode;
  size?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`btn btn-${variant} btn-${size}${tone ? " tone-" + tone : ""}`}
      onClick={onClick}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- value emphasis
 * Three tiers of how well-evidenced a figure is, carried in opacity and texture rather
 * than hue. The point is that a reader never meets a bare number whose basis is unstated.
 *
 * The thresholds below are a DEFAULT, not a law — pick bands that mean something in your
 * own data and state them in your design contract. Two failure modes to avoid:
 *   - bands cut to the observed distribution per dataset, so the same treatment means a
 *     different thing on every tenant/account/import;
 *   - a field that is pinned at 1.0 upstream, which makes every value read solid forever
 *     and quietly turns the whole mechanism off.
 * If nearly everything renders hatched, that may be the honest answer. Give the reader
 * calibration (state the population's own median beside a prominent figure) rather than
 * re-cutting the bands until the screen looks varied. */
export function emphasisOf(confidence: number): "solid" | "faded" | "hatched" {
  return confidence >= 0.75 ? "solid" : confidence >= 0.4 ? "faded" : "hatched";
}

export function Metric({
  value,
  confidence,
  unit,
  size = "md",
}: {
  value: string | number;
  /** 0–1. Omit only for a figure that is counted, not derived. */
  confidence?: number;
  unit?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const tier = confidence === undefined ? null : emphasisOf(confidence);
  return (
    <span
      className={`metric metric-${size}${tier ? ` emph-${tier}` : ""}`}
      data-hint={
        confidence === undefined
          ? undefined
          : `Confidence ${(confidence * 100).toFixed(0)}% · ${tier}`
      }
    >
      <span className="metric-value">{value}</span>
      {unit && <span className="metric-unit">{unit}</span>}
    </span>
  );
}
