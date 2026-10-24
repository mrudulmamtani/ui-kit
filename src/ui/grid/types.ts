/*
 * DataGrid — the data-grid contract.
 *
 * WHERE THIS LIVES, AND WHY. This is the product's ONE shared table primitive: no surface may
 * hand-roll a `<table>`. A grid built inside a single surface's folder inevitably grows that
 * surface's assumptions into its core, and the second caller then forks it. Nothing in this
 * folder knows about any domain — `DataGrid` is generic over the row type and driven entirely
 * by column definitions.
 *
 * `README.md` beside this file is the public contract. Read it before wiring a second grid.
 *
 * The engine never formats a domain value itself. A column states its TYPE, and the type carries
 * alignment, precision, filter kind, aggregation and export behaviour together (§3.1), so a rule
 * like "fixed decimal count per column" is enforced in one place rather than per screen.
 */
import type { ReactNode } from "react";

export type Align = "left" | "right";
export type Pin = "left" | "right" | null;
export type SortDir = "asc" | "desc";

/** One key of a multi-column sort. Order in the array IS the priority (index 0 = primary). */
export interface SortKey {
  readonly colId: string;
  readonly dir: SortDir;
}

export type FilterKind = "text" | "number" | "set" | "date";

/** Numeric comparison grammar accepted by a number column's floating filter: `>2`, `<=1.5`, `2..5`, `=0`. */
export type NumOp = "gt" | "gte" | "lt" | "lte" | "eq" | "between";

export type ColumnFilter =
  | { readonly kind: "text"; readonly q: string }
  | { readonly kind: "set"; readonly values: readonly string[] }
  | { readonly kind: "number"; readonly op: NumOp; readonly a: number; readonly b: number | null; readonly raw: string }
  | { readonly kind: "date"; readonly from: string | null; readonly to: string | null; readonly raw: string };

export type FilterModel = Readonly<Record<string, ColumnFilter>>;

/**
 * Audit tickmark channel (§3.3.6) — a provenance glyph orthogonal to colour and fill. Only ever
 * applied where the procedure is actually true of the value; there is no "assumed" tickmark.
 */
export type Tickmark = "agreed" | "derived" | "confirmed" | "estimate";

export const TICKMARK_GLYPH: Readonly<Record<Tickmark, string>> = {
  agreed: "†",
  derived: "‡",
  confirmed: "§",
  estimate: "∆",
};

/** Short name for the permanent footer legend; the full procedure travels on the hint. A legend
 * entry has to NAME the procedure to be a legend at all, but at 11px in a 28px footer band the
 * whole sentence crowds out the calibration line beside it. */
export const TICKMARK_SHORT: Readonly<Record<Tickmark, string>> = {
  agreed: "agreed",
  derived: "derived",
  confirmed: "confirmed",
  estimate: "estimate",
};

export const TICKMARK_MEANING: Readonly<Record<Tickmark, string>> = {
  agreed: "agreed to source artifact",
  derived: "derived — carries a five-layer explanation trace",
  confirmed: "third-party confirmed",
  estimate: "estimate",
};

/**
 * What a column extracts from a row. `sort` is the comparable; `text` is what a human and an
 * export both see; `absent` distinguishes "the enterprise records no such fact" from a zero
 * (§2.7) — the engine renders absence, it never fills it in.
 */
export interface CellValue {
  readonly sort: number | string | null;
  readonly text: string;
  readonly absent?: boolean;
  /** 0–1 confidence in a computed value. Present ⇒ the cell renders a value-emphasis tier. */
  readonly confidence?: number;
  readonly tickmark?: Tickmark;
  /** Direction of a variance, rendered as a ▲/▼ glyph beside the numeral. Colour never carries
   * direction on its own (§3.2): the glyph is the redundant channel that survives monochrome. */
  readonly dir?: "up" | "down";
  readonly note?: string;
  /** value used by set filters / grouping when it differs from the display text */
  readonly key?: string;
}

export type AggKind = "sum" | "min" | "max" | "count" | null;

export interface ColumnDef<R> {
  readonly id: string;
  /** Sentence case, never uppercase — caps lose word-shape at 11px across 16 columns (§2.1). */
  readonly header: string;
  /** Unit and scale live in the header, never in the cell (§2.2). Rendered on a second line. */
  readonly unit?: string;
  readonly type: ColumnTypeId;
  readonly width: number;
  /** Spanning band above the header. Max one level here — the register does not nest deeper. */
  readonly group?: string;
  readonly pin?: Pin;
  readonly hidden?: boolean;
  readonly hint?: string;
  readonly value: (row: R) => CellValue;
  readonly render?: (row: R, v: CellValue) => ReactNode;
  /** Overrides the type's aggregator. `null` = non-additive: the grid renders — rather than lie. */
  readonly agg?: AggKind;
  /** Lens id when this column is offered as a group-by. */
  readonly groupable?: boolean;
  /** Keeps the header label for assistive technology while taking it out of the visual band —
   * for a row-action column whose 36px cannot hold a word and whose meaning is the glyph. */
  readonly headerQuiet?: boolean;
  /** Suppresses the floating-filter control. Only for columns that carry no value of their own —
   * a row-action column — where a filter box would be a control over nothing. */
  readonly noFilter?: boolean;
}

export type ColumnTypeId =
  | "id-mono"
  | "text"
  | "enum"
  | "date"
  | "count"
  | "ratio2"
  | "score3"
  | "pct0"
  | "pct2"
  | "delta2"
  | "delta-pct2"
  | "money-acct"
  | "duration-d";

export interface ColumnType {
  readonly id: ColumnTypeId;
  readonly align: Align;
  readonly mono: boolean;
  readonly numeric: boolean;
  readonly filterKind: FilterKind;
  readonly agg: AggKind;
  /** Fixed decimal count per column, no exceptions (§3.2). */
  readonly format: (n: number) => string;
  /** Accounting presentation reserves the closing-paren advance width on positives too. */
  readonly accounting: boolean;
}

/** Everything about a view that is worth persisting, sharing in a URL or naming as a saved view. */
export interface GridViewState {
  readonly version: 1;
  readonly sort: readonly SortKey[];
  readonly filters: FilterModel;
  readonly quick: string;
  readonly hidden: readonly string[];
  readonly order: readonly string[];
  readonly pins: Readonly<Record<string, Pin>>;
  readonly widths: Readonly<Record<string, number>>;
  readonly density: Density;
  readonly groupBy: string | null;
}

export type Density = "compact" | "standard" | "relaxed";
