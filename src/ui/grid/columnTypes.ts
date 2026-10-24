/*
 * The column-type registry — the unit of reuse.
 *
 * A type carries formatting, alignment, precision, negative treatment, filter kind and
 * aggregation TOGETHER. Every numeric rule in §3.2 is enforceable only because it hangs off a
 * type rather than off a screen: fixed decimals per column, right-alignment for magnitudes,
 * left-alignment for qualitative pseudo-numbers (ids, dates), monospace for identifiers only.
 */
import type { ColumnType, ColumnTypeId, NumOp, ColumnFilter } from "./types";

/* One declared product locale. Never the browser default — a screenshot shared between London
   and Frankfurt must group thousands the same way or the figure is ambiguous. */
const LOCALE = "en-GB";

/**
 * A value that rounds away to zero at a column's own precision IS zero at that precision, and a
 * sign on it asserts a direction the printed figure does not have: `−0.00` reads as a decrease
 * while simultaneously claiming there was none. Such values arrive from ordinary floating-point
 * residue — a decomposition whose children sum to their parent to within 1e-16 — so the sign is
 * dropped here, once, rather than guarded at every call site that might produce one.
 */
function snap(n: number, dp: number): number {
  return Math.abs(n) < 0.5 * Math.pow(10, -dp) ? 0 : n;
}

function fixed(dp: number): (n: number) => string {
  const nf = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (n) => nf.format(snap(n, dp));
}

/** A signed variance: U+2212 MINUS SIGN on negatives, U+002B PLUS on positives, so the two
 * directions occupy identical advance width and the decimal axis holds down the column. */
function signed(dp: number): (n: number) => string {
  const f = fixed(dp);
  return (n) => {
    const v = snap(n, dp);
    return v < 0 ? `−${f(Math.abs(v))}` : v > 0 ? `+${f(v)}` : f(0);
  };
}

/** Accounting: parentheses, no minus. The reserved closing paren on positives is done in CSS. */
function accounting(dp: number): (n: number) => string {
  const f = fixed(dp);
  return (n) => {
    const v = snap(n, dp);
    return v < 0 ? `(${f(Math.abs(v))}` : f(v);
  };
}

const TYPES: Readonly<Record<ColumnTypeId, ColumnType>> = {
  "id-mono": {
    id: "id-mono",
    align: "left",
    mono: true,
    numeric: false,
    filterKind: "text",
    agg: null,
    format: (n) => String(n),
    accounting: false,
  },
  /* Free text — a name or a title. Its floating filter is a CONTAINS box, because a name column
     has as many distinct values as it has rows and a set filter there is a useless dropdown. */
  text: {
    id: "text",
    align: "left",
    mono: false,
    numeric: false,
    filterKind: "text",
    agg: null,
    format: (n) => String(n),
    accounting: false,
  },
  /* A closed vocabulary — type, domain, owner, status. Low cardinality, so the filter is a SET
     with counts, and the column is offerable as a group-by lens. */
  enum: {
    id: "enum",
    align: "left",
    mono: false,
    numeric: false,
    filterKind: "set",
    agg: null,
    format: (n) => String(n),
    accounting: false,
  },
  /* A date is a label, not a magnitude: left-aligned, mono so the day columns line up. */
  date: {
    id: "date",
    align: "left",
    mono: true,
    numeric: false,
    filterKind: "date",
    agg: null,
    format: (n) => String(n),
    accounting: false,
  },
  count: {
    id: "count",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: "sum",
    format: fixed(0),
    accounting: false,
  },
  ratio2: {
    id: "ratio2",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: "sum",
    format: fixed(2),
    accounting: false,
  },
  score3: {
    id: "score3",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: null,
    format: fixed(3),
    accounting: false,
  },
  /* Percent OR basis points per column, declared in the header, never both, and never averaged
     by the grid — a rate is non-additive, so the default aggregator is null (§3.3.4). */
  pct0: {
    id: "pct0",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: null,
    format: fixed(0),
    accounting: false,
  },
  pct2: {
    id: "pct2",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: null,
    format: fixed(2),
    accounting: false,
  },
  /* A VARIANCE, not a magnitude. Leading U+2212 MINUS SIGN, never a hyphen: in a tabular face the
     minus sign carries digit width and the hyphen does not, so a column of hyphenated negatives
     sets its digits half a character off the positives above it (§3.2). Additive by construction —
     the sum of the entries' movements IS the ledger's movement — so it foots. */
  delta2: {
    id: "delta2",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: "sum",
    format: signed(2),
    accounting: false,
  },
  /* The same, expressed as a rate: never summed, because a sum of percentage changes is not a
     percentage change of anything (§3.3.4). */
  "delta-pct2": {
    id: "delta-pct2",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: null,
    format: signed(2),
    accounting: false,
  },
  "money-acct": {
    id: "money-acct",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: "sum",
    format: accounting(2),
    accounting: true,
  },
  "duration-d": {
    id: "duration-d",
    align: "right",
    mono: false,
    numeric: true,
    filterKind: "number",
    agg: null,
    format: fixed(0),
    accounting: false,
  },
};

export function columnType(id: ColumnTypeId): ColumnType {
  return TYPES[id];
}

/* ------------------------------------------------------------------ number filter grammar
 * A single compact control accepts the whole grammar, so the floating filter row stays one line
 * per column: `>2` `>=2` `<1.5` `<=1.5` `=0` `2..5` and a bare number (equality). */
const NUM_RE = /^\s*(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.\s*(-?\d+(?:\.\d+)?))?\s*$/;

export function parseNumberFilter(raw: string): ColumnFilter | null {
  const m = NUM_RE.exec(raw);
  if (!m) return null;
  const a = Number(m[2]);
  if (!Number.isFinite(a)) return null;
  const bRaw = m[3];
  if (bRaw !== undefined) {
    const b = Number(bRaw);
    if (!Number.isFinite(b)) return null;
    return { kind: "number", op: "between", a: Math.min(a, b), b: Math.max(a, b), raw };
  }
  const opText = m[1];
  const op: NumOp =
    opText === ">" ? "gt" : opText === ">=" ? "gte" : opText === "<" ? "lt" : opText === "<=" ? "lte" : "eq";
  return { kind: "number", op, a, b: null, raw };
}

export function numberFilterMatches(f: Extract<ColumnFilter, { kind: "number" }>, v: number): boolean {
  switch (f.op) {
    case "gt":
      return v > f.a;
    case "gte":
      return v >= f.a;
    case "lt":
      return v < f.a;
    case "lte":
      return v <= f.a;
    case "eq":
      return v === f.a;
    case "between":
      return f.b === null ? v === f.a : v >= f.a && v <= f.b;
  }
}

/** `2025-06` and `2025-06-01..2025-12-31` both work; a bare prefix is a closed month/year window. */
export function parseDateFilter(raw: string): ColumnFilter | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split("..");
  const from = (parts[0] ?? "").trim();
  const to = (parts[1] ?? "").trim();
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(from)) return null;
  if (to && !/^\d{4}(-\d{2})?(-\d{2})?$/.test(to)) return null;
  return { kind: "date", from: from || null, to: to || null, raw };
}

export function dateFilterMatches(f: Extract<ColumnFilter, { kind: "date" }>, iso: string): boolean {
  if (f.from !== null && f.to === null) return iso.startsWith(f.from);
  if (f.from !== null && iso < f.from) return false;
  /* an inclusive upper bound on a truncated date: `..2025-12` must admit 2025-12-31 */
  if (f.to !== null && iso.slice(0, f.to.length) > f.to) return false;
  return true;
}

/** Human words for a filter, used by the chip bar, the export provenance block and the deep link. */
export function filterPhrase(header: string, f: ColumnFilter): string {
  switch (f.kind) {
    case "text":
      return `${header} contains “${f.q}”`;
    case "set":
      return `${header} in ${f.values.join(", ")}`;
    case "number":
      return `${header} ${f.raw.trim()}`;
    case "date":
      return `${header} ${f.raw.trim()}`;
  }
}
