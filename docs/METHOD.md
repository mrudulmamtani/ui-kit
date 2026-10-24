# Method — how this register gets built and kept

`DESIGN-CONTRACT.md` is the *law*. This is the *practice*: the working habits that produced the
look and, more importantly, that keep it from decaying once more than one person (or more than
one agent run) is touching the code.

A design system is not a token file. A token file is what survives after the practice has been
running for a while. If you copy the tokens and skip the practice, you get three months of
drift and then a screen that looks like everything else.

---

## 1. Decide once, in writing, at the token layer

Every visual decision lives in `src/theme/tokens.css` and nowhere else. The test is mechanical:
**grep the components for a hex code or a raw pixel colour.** If you find one, the system has a
hole, and that hole is where the next inconsistency enters.

The tokens file is heavily commented on purpose. Each comment answers *why this value and not a
neighbouring one* — what failed at the value you would have guessed. That is the part that
cannot be re-derived later:

> `--ink-faint` is 4.5001:1 on `--surface-1` — it clears AA on a bare plate by four
> ten-thousandths and FAILS the moment the same caption sits in an interactive row.

Six months on, nobody remembers that. Without the comment somebody "cleans up" the duplicate
token and silently breaks contrast in every table row in the product. **Write the reason beside
the value, in the file, at the moment you make the decision.** Not in a wiki.

## 2. Measure contrast; never eyeball it

`python scripts/contrast_audit.py` parses the token file, converts OKLCH → sRGB and computes
real WCAG ratios for every text token against every backdrop, plus each ramp's on-fill ink.

Run it after **any** palette change. Light canvases are specifically deceptive: a navy that
looks quiet on white can fail on a hovered row, and a value-emphasis multiplier calibrated for
navy does not transfer to amber. Neither failure is visible to the eye, and both are visible to
the script.

Add every new text token to `TEXT` and every new ramp to the on-fill loop, or the audit will
pass by not looking.

## 3. Verify by looking, and by measuring the DOM

Three distinct things, in order, none of which substitutes for another:

1. **`npx tsc --noEmit`** — proves it compiles. Proves nothing about the page.
2. **Screenshot and open the image.** Clipping, overflow, misalignment, dead space and
   default-looking components are invisible in a diff and obvious in a picture. If you are
   working through an agent, the rule is: it must *look at the screenshot*, not assert that it
   rendered.
3. **Measure geometry off the live DOM** with `getBoundingClientRect` when the question is
   dimensional — does this fit, is the status bar above the fold, do these baselines agree.

Point 3 matters more than it sounds. **A headless DOM does no layout**, so a jsdom-based unit
test cannot answer a geometry question at all — every box is 0×0 and every assertion about
position passes or fails for the wrong reason. Use a real browser (Playwright) for anything
dimensional.

This kit was itself verified that way: the grid's status bar was found 1,048px below the fold
by measuring, not by reading the CSS — the host surface was a plain block rather than a
constrained flex column, which no amount of code review would have surfaced.

## 4. Alignment is the craft

Optical alignment of numbers, consistent baselines across adjacent panels, gutters that agree.
This is the single fastest way to lose the premium read, and it never appears in review because
reviews read code. Tabular numerals (`font-variant-numeric: tabular-nums`) in all data, always —
proportional digits make a column of numbers shimmer.

## 5. Build the specimen document

The highest-leverage artifact after the token file is a **living style guide** route that reads
its values *out of the live stylesheet at runtime* rather than restating them.

The distinction is the whole point. A style guide that hard-codes `#0d2033` beside a swatch is
a second source of truth, and it starts lying the day someone edits the token. One that reads
`getComputedStyle(document.documentElement).getPropertyValue('--ink')`, measures control heights
with `getBoundingClientRect`, and *computes* its contrast claims cannot drift — if it is wrong,
the product is wrong too.

Make it assert nothing it can measure:

- token values read from `:root`, following `var()` indirection
- spacing and radius scales drawn by probing the real computed length
- control heights measured off the real primitives
- contrast ratios computed in the same arithmetic as the audit script
- a closing panel reconciling tokens *declared* against tokens *documented*, listing deviations

This kit does not ship that route — it is the one piece worth building yourself, because
building it is how you find out which parts of your system are not real yet.

## 6. One engine per job

Ten hand-rolled tables means ten sort behaviours, ten keyboard grammars, ten export formats and
ten accessibility bugs. The rule is absolute: **no surface hand-rolls a `<table>`.** The same
logic applies to any widget that acquires real behaviour — the moment a second caller appears,
it belongs in `src/ui/`, generic over its data, driven by configuration.

Corollary: build it *outside* any one surface's folder from the start. A component built inside
one surface grows that surface's assumptions into its core, and the second caller forks it
rather than fight them.

## 7. Write decisions down where they will be re-litigated

When a choice looks wrong at first glance but is correct, say so **at the point someone will
try to change it** — in the code, not in a changelog. The pattern:

> This looks wrong and is not. ⟨what it is⟩. Two tempting changes are forbidden without an
> explicit decision: ⟨change A, and the failure it causes⟩, ⟨change B, and the failure it
> causes⟩. What you MAY do instead is ⟨the legitimate escape hatch⟩.

Naming the *tempting wrong fix* is what makes it work. A comment saying "don't change this" gets
ignored; one that predicts exactly what you were about to do, and names what breaks, does not.

## 8. Sober voice, everywhere

Labels and copy read like a professional wrote them: precise, declarative, no exclamation marks,
no marketing verbs, no jokes in empty states. An empty state names the filter that produced the
emptiness and offers to clear it. This is a voice decision, and like the visual ones it holds
only if it is written down and enforced in review.
