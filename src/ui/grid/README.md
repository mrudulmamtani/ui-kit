# `src/ui/grid` — `<DataGrid>`, the product's one data grid

**No surface may hand-roll a `<table>`.** Every table in the product — list, queue, ledger,
drilldown, exhibit — is this component configured by column definitions. Ten hand-rolled tables
means ten sort behaviours, ten keyboard grammars and ten CSV exports; this is the one.

The engine owns pinning, sorting, filtering, grouping, subtotals, keyboard traversal, type-ahead,
range selection, clipboard, saved views, deep links, density, the column panel, the status bar and
the CSV export with its provenance block. It knows **nothing** about any domain: everything
domain-shaped arrives through `ColumnDef.value` / `ColumnDef.render`, and every word it speaks about
your rows comes from the `label` / `noun` props.

`DESIGN-CONTRACT.md` is binding above this file. Where it disagrees with a sentence here, it wins
and this file is wrong.

Note: comments in the grid source cross-reference section numbers (§2.2, §3.3.1, …) from the
standard this engine was built to. The rules they point at are restated in this README; the
numbers themselves no longer resolve to anything and are safe to ignore or strip.

## Files

| file | what it is |
|---|---|
| `DataGrid.tsx` | the component. `DataGrid`, `DataGridProps<R>`, `RowBar`, `treatmentOf` |
| `types.ts` | `ColumnDef<R>`, `CellValue`, `GridViewState`, tickmarks, filters — no runtime behaviour except the tickmark tables |
| `columnTypes.ts` | the column-type registry (§3.1) plus the filter grammar and `filterPhrase` |
| `keymap.ts` | `KEYMAP` — the single source of the keyboard grammar; the `?` overlay renders from it |
| `viewState.ts` | parse/encode view state, hash addressing, `localStorage` for saved views and density, CSV/TSV, clipboard |
| `data-grid.css` | the stylesheet. Imported by `DataGrid.tsx`; you never import it |

Import from the files directly — there is deliberately no barrel:

```ts
import { DataGrid, type RowBar } from "../../ui/grid/DataGrid";
import { columnType } from "../../ui/grid/columnTypes";
import type { CellValue, ColumnDef } from "../../ui/grid/types";
```

**Do not edit this folder to make your surface work.** If your surface needs behaviour the engine
does not have, it goes in through a prop that any other surface could also use, or it does not go in.
A change here is a change to four surfaces at once, and it must stay backward compatible
(DESIGN-CONTRACT §4).

## Wiring a grid — the whole of it

```tsx
<DataGrid<Row>
  gridId="evidence"          // localStorage namespace for saved views + density
  route="evidence"           // hash route the deep link and view state are written against
  label="Evidence"           // sentence case: accessible name + heading of the ? overlay
  noun="evidence index"      // lowercase, mid-sentence: "32% of the evidence index"
  rows={rows}                // the full population, before filtering
  columns={columns}          // useMemo'd ColumnDef<Row>[]
  rowId={(r) => r.doc.id}
  rowLabel={(r) => `${r.doc.title} — ${r.doc.system}`}
  seekColId="ref"            // column the type-ahead buffer seeks on
  defaultSort={[{ colId: "asserted", dir: "desc" }]}
  activeRowId={activeId}
  onActiveRow={(r) => setActiveId(r?.doc.id ?? null)}
  calibration={<>Median confidence {…} · {…} in 10 values hatched in this population</>}
  provenance={provenance}    // [label, value][] → rows 1–8 of every export
  asOf={asOf}                // ISO timestamp of the payload
  exportName="evidence"
  emptyTitle="No document matches this filter."
  emptyBody={(clear) => <p>…<button onClick={clear}>Clear every filter</button></p>}
/>
```

### Props

**Required.** `gridId`, `route`, `label`, `noun`, `rows`, `columns`, `rowId`, `rowLabel`,
`seekColId`, `activeRowId`, `onActiveRow`, `calibration`, `provenance`, `asOf`, `exportName`,
`emptyTitle`, `emptyBody`.

| prop | contract |
|---|---|
| `gridId` | Namespace for `ui.grid.<gridId>.views` and `…​.density`. Unique per grid, stable forever — changing it orphans the reader's saved views. |
| `route` | The shell's hash route. View state serialises into `#/<route>/<encoded>` with `replaceState`, so a screen state is a link without filling the back button. |
| `label` | Sentence case name of the surface. Accessible name of the grid (`"<label> grid"`) and the heading of the surface zone in the `?` overlay. |
| `noun` | The population as a lowercase mid-sentence noun. The engine writes prose with it (`"…% of the <noun>"`, `"narrow the <noun>"`). Never a proper noun, never capitalised. |
| `rows` | The full population **before** filtering. The engine filters, sorts and groups; the status bar's `X / Y` needs the unfiltered `Y`. |
| `rowId` | Stable identity. Drives React keys, selection and the active row. |
| `rowLabel` | One-line human name, used in announcements and hints. |
| `rowBar?` | `(row) => { tone: "warn"\|"danger"\|"ok"; hint } \| null` — the 3px full-height severity bar at the row's left edge (§2.2 encoding 1). Return `null` for "no status", never a tone meaning "fine". |
| `seekColId` | The leading identifier column. Type-ahead seeks on its `CellValue.text`. |
| `defaultSort?` | The order the population is READ in. Omit it and the grid opens in insertion order, which tells the reader nothing. |
| `activeRowId` / `onActiveRow` | The surface owns the inspector; the grid reports the click. `onActiveRow(null)` = deselected. |
| `onOpenRow?` | `o` / `Enter` / the row-action chevron. |
| `onInspectRow?` | `i` — a secondary row action beside `onOpenRow`. Omit and the binding does nothing. |
| `calibration` | The status bar's calibration line, **computed from the live payload** (median confidence, share hatched, coverage). Never a constant, never omitted — it is what turns a faint-looking screen from an apparent rendering fault into a statement the product is making. |
| `provenance` | `[label, value][]` written to rows 1–8 of the CSV. The engine appends filter expression, sort, group, rows exported and exported-at itself. |
| `asOf` | ISO timestamp of the payload; shown in the status bar and used in the export filename. |
| `exportName` | Filename stem: `<exportName>-<asOf date>.csv`. |
| `exportTitle?` | First line of the CSV provenance block. Defaults to `"Export provenance"` — set it to your product's name. |
| `emptyTitle` / `emptyBody` | Shown when the filter empties the grid. `emptyBody` receives `clear()` — name the filter that produced the emptiness and offer to clear it. Sober voice, no illustration, no joke. |
| `footnote?` | A `ReactNode` seated in the status bar's left group. Facts about the population only. |
| `toolbarExtra?` | One surface-specific control beside the lens. Use the engine's own chrome classes so it matches: `<label className="dg-lens"><span className="dg-lens-k">Against</span><select className="dg-select">…`. |
| `forceColumns?` | `Record<colId, boolean>` the surface asserts when **its own** state changes (e.g. admitting baseline columns once a comparison basis is chosen). Applied on change only, so a reader's hand-toggles are never fought. A column absent from the record is left alone. |
| `hierarchy?` | Declares the rows a **forest** rather than a list. See below. |

## Hierarchies — when the rows are a decomposition, not a list

```ts
interface Hierarchy<R> {
  parentOf: (row: R) => string | null;   // a rowId, or null at a root
  isBranch: (row: R) => boolean;         // this row is a LEVEL, not an entry
  openToDepth?: number;                  // branches at or beyond this depth open closed
}
```

The distinction from the `groupBy` lens is the whole point, and getting it backwards produces a
number the product cannot defend:

- A **lens** pivots a flat population and the engine aggregates each bucket itself. The bucket's
  figure is *the engine's* claim, computed from the rows beneath it.
- A **hierarchy** is rows all the way down. Every level is a row the surface supplied carrying
  values the surface computed, and **the engine never sums a branch**. That is deliberate: a
  reconciling decomposition only holds if the residual is stated, and an engine that derived a
  parent from its children could not know what its children *fail* to explain. Stating that gap
  is the surface's job.

A grid carries a hierarchy **or** a lens, never both. While one is present the `Group by` control
is not rendered and `g` says so rather than silently doing nothing.

What the engine does with it:

- Builds the forest from `rowId` / `parentOf`. A row whose parent is not in `rows` stands as a
  root, so a partial or filtered payload still draws every row it was handed.
- Walks depth-first. Children keep the order the sort put them in, so **a sort is sibling-scoped
  for free** — the heaviest domain leads the tree and the heaviest driver leads its own domain,
  and no row is ever lifted out of the level it reconciles against.
- **Filters keep the path to every match**: a matching row admits its ancestors, never their other
  children. A leaf shown without the levels that carry it is a list, not a filtered decomposition.
- Indents by `--grid-indent` × depth — spacing only, never a second type scale.
- Draws a disclosure on every branch. A branch with nothing beneath it keeps the disclosure's
  advance and loses its glyph, so an empty level states its emptiness instead of passing as a leaf.
- `Enter` opens and closes a level, exactly as it does a lens group. `onOpenRow` is not called on a
  branch — there is no entry behind it to open.
- **The grand total sums the roots**, not every row on screen: adding the levels together would
  count the same weight once per level. The foot says `Total · N at the top level` so the reader
  can check the arithmetic by eye.
- The CSV gains a leading **`Level`** column carrying the depth as an integer. Indentation is a
  rendering fact and a spreadsheet does not carry it; without the column the tree would arrive in
  Excel as a flat list whose parents look like peers.

Branch rows render as subtotals per §4.2: a 1px `--line` rule above and a weight step, **never a
fill** — a filled 28px band reads as a header.

## Column definitions

```ts
interface ColumnDef<R> {
  id: string;                 // stable; it keys view state, DOM ids and export headers
  header: string;             // SENTENCE CASE, never uppercase (§2.1)
  unit?: string;              // "USD · 000s", "% of total" — unit and scale live in the
                              // header, never in the cell (§2.2). Rendered on a second line.
  type: ColumnTypeId;         // see the registry below
  width: number;              // px; the reader may resize, and the width persists
  group?: string;             // spanning band above the header; one level
  pin?: Pin;                  // "left" | "right" | null — initial pin only
  hidden?: boolean;           // initially hidden; the column panel reveals it
  hint?: string;              // [data-hint] on the header — say what the column MEANS
  value: (row: R) => CellValue;
  render?: (row: R, v: CellValue) => ReactNode;  // last resort; the type formats by default
  agg?: AggKind;              // overrides the type's aggregator. null = non-additive
  groupable?: boolean;        // offered in the Group by lens
  headerQuiet?: boolean;      // keeps the label for AT, drops it from the visual band
  noFilter?: boolean;         // suppress the floating filter (row-action columns only)
}
```

`value` is the only thing the engine asks of your data:

```ts
interface CellValue {
  sort: number | string | null;  // the comparable
  text: string;                  // what a human AND the export see
  absent?: boolean;              // true ⇒ renders "—" + the hint. NEVER pass 0 for absence
  confidence?: number;           // present ⇒ the cell renders Confidence Treatment
  tickmark?: Tickmark;           // "agreed" † | "derived" ‡ | "confirmed" § | "estimate" ∆
  dir?: "up" | "down";           // variance direction, rendered ▲/▼ beside the numeral
  note?: string;                 // overrides the cell's [data-hint]
  key?: string;                  // grouping / set-filter key when it differs from `text`
}
```

Rules the engine enforces so you do not have to, and must not work around:

- **Absence is stated, never filled.** `absent: true` renders `—` in ghost ink with a hint. Passing
  `0`, `"N/A"` or `""` for a fact your source does not record is a false claim, not a placeholder.
- **Confidence rides on the numeral:** solid ≥ 0.75, faded ≥ 0.4, else hatched —
  `treatmentOf(confidence)` is exported if you need the same bands outside a cell. If most of your
  figures hatch, that may be the honest answer; give the reader calibration rather than re-cutting
  the bands until the screen looks varied. See DESIGN-CONTRACT §1.3.
- A cell carrying `dir` renders at full ink and takes its treatment from underline texture and a
  weight step only — a coloured value is never multiplied by an opacity (§3.3.2).
- **Subtotals take the weakest link** — the minimum confidence of the contributors, never the mean.
- **Non-additive columns declare `agg: null`** and render `—`. Never let the grid average a rate.
- The tickmark legend renders permanently in the status bar, and only for marks actually on screen.

## The column-type registry

`columnType(id)` returns alignment, mono, numeric, filter kind, default aggregator, `format` and
accounting treatment together. Pick the type that describes the **quantity**; never re-format in
`render`.

| id | align | mono | dp | filter | default agg | notes |
|---|---|---|---|---|---|---|
| `id-mono` | left | ✓ | — | text | null | identifiers only — character-by-character comparison |
| `text` | left | | — | text | null | contains-box filter (a name column has as many values as rows) |
| `enum` | left | | — | set | null | closed vocabulary; set filter with counts; pair with `groupable` |
| `date` | left | ✓ | — | date | null | a date is a label, not a magnitude. `2025-06`, `2025-06-01..2025-12-31` |
| `count` | right | | 0 | number | sum | |
| `ratio2` | right | | 2 | number | sum | |
| `score3` | right | | 3 | number | null | |
| `pct0` / `pct2` | right | | 0 / 2 | number | null | percent **or** bp per column, declared in the header, never both |
| `delta2` | right | | 2 | number | sum | signed with U+2212 MINUS, never a hyphen |
| `delta-pct2` | right | | 2 | number | null | a sum of percentage changes is not a percentage change |
| `money-acct` | right | | 2 | number | sum | parentheses, no minus; the closing paren is reserved on positives |
| `duration-d` | right | | 0 | number | null | one fixed unit per column |

Number filters accept `>2` `>=2` `<1.5` `<=1.5` `=0` `2..5` and a bare number. Adding a type means
editing `ColumnTypeId` + `TYPES` in `columnTypes.ts` — a shared change; keep it general.

## Density and view state

Three tiers on `[data-density]`: compact 24px rows / standard **28** / relaxed 36. **Density moves
spacing only** (Law 3) — the engine writes `--grid-row-h`, `--grid-header-h`, `--grid-filter-h`,
`--grid-pad-x`, `--grid-pad-x-lead`, `--grid-indent` onto the root and nothing else. Type size, icon
size, hairline weight and ink are identical at every tier. Never add a rule that changes type with
density.

```ts
interface GridViewState {
  version: 1;
  sort: SortKey[];      // order IS priority; index 0 primary
  filters: FilterModel; // by colId
  quick: string;
  hidden: string[];
  order: string[];
  pins: Record<string, Pin>;
  widths: Record<string, number>;
  density: Density;
  groupBy: string | null;
}
```

The grid owns this state internally. It is read from `#/<route>/<encoded>` on mount, written back
with `replaceState`, and persisted as named saved views under `ui.grid.<gridId>.views` with density
under `ui.grid.<gridId>.density`. Preferences are **not** source data, so local persistence is not
fabrication. `parseView` proves every field before use, so a stale or hand-edited record
degrades to the default view instead of taking the surface down. Shipping a shape change means
bumping `version` and migrating in `parseView`.

## Keyboard grammar

`keymap.ts` is the single source; the `?` overlay renders from `KEYMAP`, so the documentation cannot
drift from the handler. The grid is **one tab stop** — `Tab` leaves it, roving tabindex inside.

*Rows:* arrows · `Ctrl`+`←`/`→` and `Home`/`End` row ends · `Ctrl`+`Home`/`End` grid ends ·
`PgUp`/`PgDn` · `Shift`+arrows extend the range · `Ctrl`+`Shift`+arrows extend to the edge · `Space`
toggle row selection · `Shift`+`Space` select row · `Ctrl`+`Space` select column · `Ctrl`+`A` ·
`Enter` expand a group / open the row · `↑` from row 1 moves into the header · printable characters
type-ahead seek on `seekColId` (1000ms idle reset, buffer shown bottom-left, `Esc` clears).

*Header:* `←`/`→` · `Enter` sort asc → desc → **none** · `Shift`+`Enter` multi-sort · `Alt`+`↓` menu
· `Alt`+`←`/`→` resize · `Shift`+`←`/`→` move · `Ctrl`+`Enter` filter · `↓`/`Esc` back to the rows.

*Clipboard:* `Ctrl`+`C` cell or range, tab-delimited never comma · `Ctrl`+`Shift`+`C` with headers.

*Surface:* `/` quick filter · `[` `]` cycle saved views · `\` column panel · `g` lens · `d` density ·
`i` inspect · `o` open · `?` overlay · `Esc` close.

Under a `hierarchy`, `Enter` opens and closes the focused level and `g` reports that there is no
lens to cycle. No binding is added, so the `?` overlay stays complete without a second list.

**A surface adding its own row-level keys** must not collide with these, and must add them to `KEYMAP` in the `surface` zone so the `?` overlay tells the
truth. A binding that is not in `KEYMAP` does not exist as far as the reader is concerned.

## What the engine will not do for you

- **It does not fetch.** Rows come from your surface. Loading and error states are
  `SurfaceLoading` / `SurfaceError`, outside the grid.
- **It does not paginate.** Ever. It virtualises above 100 rows with a 12-row buffer.
- **It does not size itself.** `.dg` is `flex: 1; min-height: 0`, so its host must be a
  constrained flex column — use `className="surface surface-fill"`. Without that the grid grows
  to its full row count and pushes its own status bar below the fold.
- **It does not fill a cell with RAG colour**, stripe rows, or carry state in colour alone. If you
  need a status encoding, use `rowBar`, an ink + weight step, or a `render` that follows §2.2 — and
  give it a redundant non-colour channel.
- **It does not invent a total.** Non-additive means `—`.
