# UI Kit — "Institutional Light"

A dense, document-register UI system: paper-white plates on a cool grey canvas, deep navy ink,
one institutional blue reserved for state, an editorial serif carrying hierarchy, and structure
drawn in hairlines rather than shadows.

It is a **starting repo**, not a dependency. Clone it, rename it, and make it yours.

```bash
npm install
npm run dev              # http://localhost:5180
npm run typecheck
npm run audit:contrast   # requires python3; no third-party packages
```

Two routes are built out — **Overview** (primitives, panels, emphasis tiers) and **Records**
(the data grid, fully wired). Both are scaffolding to delete.

---

## Read these first

| File | What it is |
|---|---|
| **`DESIGN-CONTRACT.md`** | The law. The register, the non-negotiables, the self-verification loop. Read it fully before building a surface. |
| **`docs/METHOD.md`** | The practice that keeps the register from decaying — token discipline, measured contrast, verifying by looking, the specimen-document idea. |
| **`src/ui/grid/README.md`** | The data grid's public contract. Read before wiring a second grid. |

---

## What's here

```
src/
├── theme/
│   ├── tokens.css          the whole visual system — surfaces, ink, accent, ramps,
│   │                       type, space, radii, shadows, motion, layout
│   ├── base.css            reset, focus rings, scrollbars, [data-hint] tooltips,
│   │                       .display / .eyebrow / .mono / .faint, app layout skeleton
│   └── fonts.css           three self-hosted variable faces, no network at runtime
├── app/
│   ├── nav.ts              THE information architecture — edit this first
│   ├── brand.ts            product name + subtitle
│   └── store.ts            shell state: route (hash-synced), rail collapse, palette
├── ui/
│   ├── primitives.tsx      Panel · Chip · Button · Metric · emphasisOf()
│   ├── SurfaceState.tsx    SurfaceLoading (skeletons) · SurfaceError · SurfaceEmpty
│   ├── ErrorBoundary.tsx   per-surface containment
│   ├── NavRail.tsx         collapsible primary rail
│   ├── TopBar.tsx          serif headline + standfirst + a running "basis" line
│   ├── CommandPalette.tsx  grouped, ranked, hit-marked; pluggable corpus
│   ├── LogoMark.tsx        placeholder mark — replace
│   └── grid/               the data grid (see its README)
├── surfaces/               SCAFFOLD — delete
└── scripts/contrast_audit.py
```

### The data grid

`src/ui/grid/` is the largest asset here and self-contained (React + lucide only). It owns
pinning, sorting, floating filters, grouping with subtotals, a pinned grand total, three
density tiers, saved views, deep links, column panel, keyboard traversal with type-ahead,
range selection, clipboard, a status bar with a calibration line, and CSV export with a
provenance block.

Your surface supplies only what the rows *mean*: column definitions, how each cell is
extracted, and the calibration line. See `src/surfaces/Records.tsx` for a worked example.

> Its host must be a constrained flex column — `className="surface surface-fill"`. The grid is
> `flex: 1; min-height: 0`, so in a plain block it grows to its full row count and pushes its
> own status bar below the fold.

---

## Making it yours — in order

1. **`src/app/brand.ts`** — product name and subtitle.
2. **`src/ui/LogoMark.tsx`** — replace the placeholder mark. Keep the construction notes:
   flat, geometric, one saturated element, literal colours so a favicon export matches.
3. **`src/app/nav.ts`** — your routes. Everything else reads this one file: the rail, the top
   bar's headline, the palette and the hash router all update together.
4. **`--accent` in `tokens.css`** — the single highest-leverage colour change. Keep the
   lightness near `0.505` so the audited on-accent and wash contrasts hold; move the hue.
   Then run `npm run audit:contrast`.
5. **`--font-serif`** — the single highest-leverage *identity* change. The serif/sans division
   is what makes this read editorial; swapping the serif shifts the whole character while
   keeping the discipline.
6. **Delete the ramps you don't encode.** `--cat-*`, `--seq-*`, `--wash-*`, `--div-*`, `--sev-*`
   are optional and clearly marked. An unused ramp is an invitation to decorate with it.
7. **Set your emphasis bands** in `src/ui/primitives.tsx` and write them into
   `DESIGN-CONTRACT.md` §1.3. The defaults (0.75 / 0.4) are a default, not a law.
8. **Delete `src/surfaces/`** and build your own.

---

## Notes and rough edges

- **Value emphasis is optional but opinionated.** `<Metric>` renders a figure at one of three
  tiers based on a 0–1 confidence. If your product has no notion of how well-evidenced a number
  is, pass no `confidence` and the figure renders plain — but consider whether that is true, or
  just unmeasured.
- **Light mode only.** The token file declares `color-scheme: light` and every value is
  calibrated against a paper canvas. A dark variant is real work, not a token flip: the
  emphasis multipliers, the shadow calibration and every ramp's on-fill ink would need
  re-auditing.
- **Dangling section references.** Comments in `src/ui/grid/` cross-reference section numbers
  (§2.2, §3.3.1, …) from the standard the grid was built to. Every rule they point at is
  restated in `src/ui/grid/README.md`; the numbers themselves resolve to nothing and are safe
  to ignore or strip.
- **The contrast audit skips two ramp bins.** `--seq-0-ink` and `--seq-1-ink` are `var(--ink)`
  rather than OKLCH literals, so the regex-based parser doesn't see them. Both are full navy on
  near-white fills and pass comfortably; worth knowing before you trust the output completely.
- **Fonts** are Inter, Source Serif 4 and JetBrains Mono — all open-licensed (OFL) and
  self-hosted via `@fontsource-variable`, so there is no runtime network call and nothing to
  attribute in the UI.

---

## Verified

- `npx tsc --noEmit` — clean, under `strict` + `noUncheckedIndexedAccess`
- `npx vite build` — clean
- `python scripts/contrast_audit.py` — no failures; every text token clears 3.0, every on-fill
  ink clears 4.5
- Rendered and screenshotted at 1512×950 @2x across both scaffold routes and the command
  palette; no console errors, no page errors
