/*
 * Placeholder brand mark — REPLACE THIS with your own.
 *
 * It is here so the rail's masthead has correct geometry from the first render rather than a
 * gap you design around later. The construction is worth keeping even if the shape is not:
 *
 *   - Flat and geometric. No gradient, no bevel, no inner glow. It must hold at 16px in a
 *     favicon and at 96px on a title plate, and anything painterly fails the small end.
 *   - One saturated element at most. The plate is navy, the rules are a quiet grey, and
 *     exactly one stroke carries the accent — state is signal, so the mark spends hue once.
 *   - Colours are LITERAL, not tokens, so a favicon or OG-image export matches the in-app
 *     mark exactly. This is the one sanctioned place to hard-code a colour.
 *   - `plate={false}` renders it monochrome in `currentColor`, for use inside an already
 *     inverted band or beside text that owns the colour.
 */
const NAVY = "#0d2033";
const RULE = "#42566b";
const ACCENT = "#1f4fe0";

export function LogoMark({ size = 22, plate = true }: { size?: number; plate?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      {plate && <rect width="64" height="64" rx="3" fill={NAVY} />}
      {/* three rules of rising length — a reading taken, not a logo doing a trick */}
      <g
        stroke={plate ? RULE : "currentColor"}
        strokeWidth="4"
        strokeLinecap="square"
        opacity={plate ? 1 : 0.45}
      >
        <path d="M16 44 H34" />
        <path d="M16 32 H42" />
      </g>
      {/* the one loaded stroke */}
      <path
        d="M16 20 H48"
        stroke={plate ? ACCENT : "currentColor"}
        strokeWidth="4"
        strokeLinecap="square"
      />
    </svg>
  );
}
