# Design Contract — Institutional Light

**Read this fully before building any surface.** It is the shared law that keeps independently
built screens looking like one product. When ten surfaces are built by ten people (or ten agent
runs) and none of them read the same document, you do not get a product — you get ten products
in a trench coat. This file is the document.

It is written to be binding. Where a sentence here conflicts with a convenience, the sentence
wins, or you change the sentence deliberately and write down why.

---

## 0. The bar

The product must survive a **blind side-by-side** against the best software in its class, and
against the production values of a professional document. Nothing may look templated, default,
Bootstrap-ish, or "AI-generated."

Name your own references and put them here. Pick ones you would actually lose to:

> *Reference set for this product: ………………………………*

## 0.1 The register — INSTITUTIONAL LIGHT (read this twice)

This is **light mode, corporate**. The product a serious firm would put its name on and sell to
a board. Concretely:

- **Paper, not screen.** White plates on a cool grey canvas. Structure comes from **hairlines
  and alignment**, never from heavy fills, glows, or drop shadows. If a shadow is visible *as a
  shadow*, it is too strong.
- **Two typographic voices, strictly divided.**
  - `--font-display` (Source Serif 4) — **editorial**: page headlines, section headlines, hero
    figures, long-form prose. This is what makes a screen read as a *page of a document*.
  - `--font-sans` (Inter) — **instrument**: all UI chrome, labels, controls, dense table cells.
  - `--font-mono` (JetBrains Mono) — ids, codes, timestamps, raw values.
  - Never set body copy in the serif at UI sizes. Never set a headline in the sans.
- **Rectilinear.** Radii are 2–6px. Pills are reserved for status dots and genuine toggles. A
  pill reads consumer; a rectangle reads as a field on a form.
- **Restraint is the aesthetic.** One accent for state. Everything else is navy ink, greys and
  hairlines — plus the encoding ramps, which are *data*, not decoration.
- **Emphasis is typographic first.** State something with weight, size and rules before
  reaching for colour or a fill.
- **Sober voice.** Labels and copy read like a professional wrote them: precise, declarative,
  no exclamation, no marketing verbs, no cute empty-state jokes.

**Forbidden on sight:** dark panels used as decoration, neon/candy colour, purple-to-pink
gradients, glassmorphism, glows, rainbow categorical palettes, emoji in the UI, pill-shaped
buttons, oversized rounded cards, drop shadows faking hierarchy, decorative illustration.

---

## 1. Non-negotiables (fail review if violated)

1. **Tokens only.** No raw hex/oklch/px colours in components. Consume `src/theme/tokens.css`.
   New tokens are allowed but must be added to `tokens.css` with a comment explaining what the
   token is *for* — never inlined at the call site. The one sanctioned exception is
   `LogoMark.tsx`, whose colours are literal so a favicon export matches the in-app mark.

2. **Colour is reserved.** Neutral canvas. Hue only for STATE (`--accent` = selection /
   emphasis / attention), for SEMANTIC STATUS (`--ok` / `--warn` / `--danger` / `--info`), and
   for ENCODED DATA (the ramps). Never decorative gradients-for-mood, never a rainbow. Hue is a
   scarce resource and each channel owns exactly one meaning.

3. **No bare numbers.** Every *derived* figure renders with a value-emphasis tier — `<Metric>`,
   or the `.emph-solid|faded|hatched` classes. A counted figure may render plain; a computed,
   estimated or stale one may not.

   **3b. Decide your emphasis bands once, write them here, and leave them alone.**

   > *Bands for this product: solid ≥ ……, faded ≥ ……, else hatched. Source field: ……………*

   Two changes are forbidden without an explicit, written decision:
   - **Re-cutting the bands to the observed distribution.** It restores visual variety by making
     the treatment mean something different on every account, tenant or import. The reader can
     no longer carry a learned meaning from one screen to the next.
   - **Substituting a field that is pinned high upstream.** It makes every value read solid
     forever and quietly turns the whole mechanism off — the failure is invisible, which is why
     it survives for months.

   If nearly everything renders hatched, that may be the honest answer. Give the reader
   **calibration** — state the population's own median or percentile beside a prominent figure —
   so a hatched value reads as "poorly evidenced *here*" rather than as a rendering fault.

4. **Derive; don't fabricate.** Source what a screen shows from the real thing. Absence is
   stated (`—` in ghost ink), never filled in with `0`, `"N/A"` or `""` — those are claims, and
   they are false ones. Scaffold data is permitted only while a real source does not yet exist,
   must be generated rather than hand-authored, and must be deleted when the source arrives.

5. **One persistent frame.** Surfaces render inside the shell; never a full-page takeover,
   never `window.location` navigation except the hash router. Inspectors dock beside content.

6. **Motion names its cause.** Use the `--ease-*` / `--dur-*` tokens, each of which is commented
   with the interaction it exists for. `prefers-reduced-motion` already collapses them. No
   animation for decoration. An emphasis pulse plays exactly twice and is never looped.

7. **Naming.** Never Console, Hub, Center, Cockpit, Portal, Manager, or Wizard — in code or in
   the UI. They are the vocabulary of fake importance. Name the thing the reader came for.

8. **Keyboard-first & accessible.** Focus-visible rings, `aria-*`, arrow-key navigation on lists
   and grids, `[data-hint]` for instant tooltips on every dense affordance. Targets ≥ 28px.
   Contrast ≥ WCAG AA on text — **measured, not eyeballed** (see §5).

---

## 2. Visual language

- **Surfaces ladder:** `--surface-void` (canvas) → `-0` (white plate) → `-1`/`-2` (rail, hover)
  → `-3` (overlay) → `--surface-inset` (wells). Structure with `--line*` hairlines, not shadows.
  `--surface-ink` is the inverted navy plate — use it deliberately for mastheads and key
  figures, never as ambient decoration.
- **Type:** display serif for headlines, `--font-sans` for UI, `--font-mono` for data and ids.
  Sizes `--text-*`. Weights 400/500/560/660. Tabular numerals in all data
  (`font-variant-numeric: tabular-nums`).
- **Spacing:** 4px base, `--space-*`. **Radii:** `--radius-*` (small). **Elevation:**
  `--shadow-*` (faint).
- **Density:** dense but calm. One primary metric per view. Lists paginate or virtualize; never
  an infinite unranked stream. Apply the **10× test** — the screen must still work at ten times
  the row count. Most layouts that look fine at 20 rows are unusable at 200, and you will ship
  with 20.
- **Alignment is the craft.** Optical alignment of numbers, consistent baselines across adjacent
  panels, gutters that agree. Misalignment is the fastest way to lose the premium read, and it
  is invisible in code review — you only catch it by looking at a screenshot.

---

## 3. Reuse these — don't reinvent

- `src/ui/primitives.tsx` → `Panel`, `Chip` (six tones), `Button`, `Metric`, `emphasisOf()`
- `src/ui/SurfaceState.tsx` → `SurfaceLoading` (skeletons, never a spinner-only void),
  `SurfaceError`, `SurfaceEmpty`
- `src/ui/grid/DataGrid.tsx` → **every** table. No surface hand-rolls a `<table>`; see
  `src/ui/grid/README.md`
- `src/ui/CommandPalette.tsx` → keyboard entry to everything addressable
- `[data-hint="…"]` → instant tooltip (defined in `base.css`). Native `title` is too slow for an
  instrument panel
- `.display` → the editorial serif treatment. `.eyebrow` → the caps label. `.mono`, `.faint`
- **Icons: `lucide-react` only.** Sizes 15–18 in UI, `strokeWidth` 1.8 (2.1 when active). On
  this light skin icons are structural, not colourful — default them to `--ink-faint` /
  `--ink-muted`

---

## 4. Surface ownership

Each surface owns exactly one folder: `src/surfaces/<route>/`. Edit only your folder, plus
`tokens.css` if a genuinely new token is needed. The router is already wired — do not touch
another surface's files. Shared primitive changes must be backward-compatible.

---

## 5. Self-verification — before declaring anything done

0. **`python scripts/contrast_audit.py` reports no failures.** It parses `tokens.css`, converts
   OKLCH to sRGB and measures real WCAG ratios for every text token against every backdrop,
   plus each ramp's on-fill ink. If you add a token, this must still pass. **Do not eyeball
   contrast on a light canvas** — a navy that looks quiet on white can fail the moment the same
   caption sits in a hovered or selected row, and the difference is invisible to the eye.
1. **`npx tsc --noEmit` passes.**
2. **Screenshot the running app** at your standard viewport (1512×950 @2x is a good default)
   and **actually open the image and look at it.** A build that compiles proves nothing about
   whether the page is right.
3. **Be your own harshest critic.** Is it genuinely better than the references in §0? Check for
   clipping, overflow, misalignment, dead space, contrast failures, default-looking components,
   and leftover artifacts from an earlier skin.
4. **Measure, don't assume.** When geometry is the question — does this fit, is it aligned, is
   the status bar above the fold — read it off the live DOM with `getBoundingClientRect`. A
   headless DOM does no layout, so unit tests cannot answer geometry questions at all.
5. **Re-screenshot after every fix.** Never declare done from code alone.
