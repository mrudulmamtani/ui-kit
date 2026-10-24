/*
 * DataGrid — the product's ONE data-grid primitive (ALADDIN-BRIEF §2), built in-house.
 *
 * Generic over the row type and driven entirely by column definitions: the engine knows about
 * pinning, sorting, filtering, grouping, keyboard traversal, selection, clipboard and export, and
 * knows nothing about risks, controls or Operational Weight. Everything domain-shaped arrives
 * through `ColumnDef.value` / `ColumnDef.render`, and every word the engine speaks about the rows
 * comes from `label` / `noun`, so no surface's vocabulary is baked in.
 *
 * THE PUBLIC API IS DOCUMENTED IN `README.md` BESIDE THIS FILE — column definitions, the column
 * type registry, the density/view-state contract, the keymap and how a surface wires a grid.
 * Change a prop here and change it there in the same edit.
 *
 * Law 3 is enforced structurally: density moves ONLY the geometry custom properties below. Type
 * size, icon size, hairline weight and ink are identical at every tier, so a density change can
 * never produce an illegible grid.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight, Columns3, Copy, Download, Link2, Search, X } from "lucide-react";
import {
  columnType,
  dateFilterMatches,
  filterPhrase,
  numberFilterMatches,
  parseDateFilter,
  parseNumberFilter,
} from "./columnTypes";
import { KEYMAP, isSeekChar, zoneLabel, type KeyZone } from "./keymap";
import {
  copyText,
  deepLink,
  downloadCsv,
  emptyView,
  loadDensity,
  loadSavedViews,
  storeDensity,
  storeSavedViews,
  toCsv,
  toTsv,
  viewFromHash,
  writeHash,
  type SavedView,
} from "./viewState";
import {
  TICKMARK_GLYPH,
  TICKMARK_MEANING,
  TICKMARK_SHORT,
  type CellValue,
  type ColumnDef,
  type ColumnFilter,
  type Density,
  type GridViewState,
  type Pin,
  type SortKey,
  type Tickmark,
} from "./types";
import "./data-grid.css";

/* -------------------------------------------------------------- density tiers
 * The single source for both axes of the tier: JS writes these onto the grid root as custom
 * properties, and the stylesheet consumes them. A tier therefore cannot drift between the two. */
interface Tier {
  readonly row: number;
  readonly header: number;
  readonly filter: number;
  readonly padX: number;
  readonly padXLead: number;
  readonly indent: number;
}
const TIERS: Readonly<Record<Density, Tier>> = {
  compact: { row: 24, header: 28, filter: 26, padX: 8, padXLead: 12, indent: 12 },
  standard: { row: 28, header: 32, filter: 28, padX: 8, padXLead: 12, indent: 16 },
  relaxed: { row: 36, header: 40, filter: 32, padX: 12, padXLead: 16, indent: 16 },
};
const DENSITIES: readonly Density[] = ["compact", "standard", "relaxed"];

/** Rows above which the body windows. Below it every row is in the DOM, which keeps Ctrl+F honest. */
const VIRTUALISE_ABOVE = 100;
const ROW_BUFFER = 12;
/** Total pinned width may never exceed this share of the grid viewport (§2.3). */
const MAX_PINNED_SHARE = 0.4;
/** Autosize samples a fixed set of rendered rows once, then locks the width (§2.6). */
const AUTOSIZE_SAMPLE = 200;
/** A column may never be dragged narrower than this — below it a header label is a stub. */
const MIN_COL_W = 48;
/** Fit-to-frame will not squeeze a column below this; past it the grid scrolls instead. */
const FIT_FLOOR = 68;
/** …nor absorb a deficit larger than this share of the frame. A column set that overruns the
 * frame by a hair should close the gap silently; one that overruns it by three added columns
 * should SCROLL, with the frozen edges saying so — squeezing sixteen columns to their floors
 * turns every header into an ellipsis and buys the reader nothing. */
const MAX_ABSORB_SHARE = 0.06;

export interface RowBar {
  readonly tone: "warn" | "danger" | "ok";
  readonly hint: string;
}

export interface DataGridProps<R> {
  readonly gridId: string;
  /** Route id the deep link is written against — the shell's hash router owns navigation. */
  readonly route: string;
  /** The view's own name for this grid, sentence case — "Orders", "Inventory". It becomes the
   * grid's accessible name and the heading of the surface section of the `?` overlay. */
  readonly label: string;
  /** The same population as a lowercase mid-sentence noun — "order book", "inventory",
   * "queue". The engine writes prose about the population ("57% of the register") and must never
   * guess what the rows are called. */
  readonly noun: string;
  readonly rows: readonly R[];
  readonly columns: readonly ColumnDef<R>[];
  readonly rowId: (row: R) => string;
  readonly rowLabel: (row: R) => string;
  /** 3px full-height severity bar at the row's left edge, inside the pinned region (§2.2). */
  readonly rowBar?: (row: R) => RowBar | null;
  /** Column the type-ahead buffer seeks on — the leading identifier. */
  readonly seekColId: string;
  /** The order the ledger is READ in when nothing else is asked for. A grid whose natural order
   * is the payload's insertion order tells the reader nothing; the register opens ranked. */
  readonly defaultSort?: readonly SortKey[];
  readonly activeRowId: string | null;
  readonly onActiveRow: (row: R | null) => void;
  readonly onOpenRow?: (row: R) => void;
  readonly onInspectRow?: (row: R) => void;
  /** Derived calibration line for the status bar (§3.3.5). Never a constant. */
  readonly calibration: ReactNode;
  /** Provenance facts written into rows 1–8 of every export (§4.4). */
  readonly provenance: readonly (readonly [string, string])[];
  readonly asOf: string;
  readonly exportName: string;
  /** First line of every CSV export — brand or product name. Defaults to "Export provenance". */
  readonly exportTitle?: string;
  readonly emptyTitle: string;
  readonly emptyBody: (clear: () => void) => ReactNode;
  readonly footnote?: ReactNode;
  /** A surface-specific control seated in the toolbar beside the lens — the comparison basis on
   * the register, say. The engine renders it and knows nothing about what it does. */
  readonly toolbarExtra?: ReactNode;
  /** Columns the SURFACE asserts into or out of the view when its own state changes — admitting
   * the baseline columns the moment a comparison basis is chosen. Applied on change only, so the
   * reader's later hand-toggles are never fought; `undefined` leaves a column alone entirely. */
  readonly forceColumns?: Readonly<Record<string, boolean>>;
  /** Present ⇒ the rows are a FOREST, not a list. See `Hierarchy` below. */
  readonly hierarchy?: Hierarchy<R>;
}

/**
 * A hierarchy the surface computed and the engine only renders (§4.2's reconciling decomposition
 * is the first caller). The distinction from the `groupBy` lens matters: a lens PIVOTS a flat
 * population and the engine aggregates each bucket itself, so a bucket's figure is the engine's
 * claim. A hierarchy is the opposite — every level is a row the surface supplied, carrying values
 * the surface computed, and the engine never sums a branch. That is deliberate: a decomposition
 * only reconciles if the residual is stated, and an engine that invented the parent from its
 * children could not know what its children failed to explain.
 *
 * A grid may carry a hierarchy or a lens, never both — a forest is already pivoted, and the lens
 * control is suppressed while one is present.
 */
export interface Hierarchy<R> {
  /** `rowId` of this row's parent, or `null` at a root. A parent that is not in `rows` is treated
   * as absent and the row stands as a root, so a partial payload draws rather than disappears. */
  readonly parentOf: (row: R) => string | null;
  /** True where the row has children BY CONSTRUCTION — a branch with none still draws as a branch
   * with an empty disclosure, which is how "this level explains nothing" stays visible. */
  readonly isBranch: (row: R) => boolean;
  /** Depth (0 = roots) at and below which branches open on first render. Default: every level. */
  readonly openToDepth?: number;
}

type DisplayRow<R> =
  | { readonly kind: "group"; readonly key: string; readonly label: string; readonly count: number }
  | {
      readonly kind: "leaf";
      readonly row: R;
      readonly indent: number;
      /** Set only under a hierarchy: this row is a level, not an entry. */
      readonly branch?: boolean;
      readonly expanded?: boolean;
      readonly kids?: number;
    };

interface Focus {
  readonly r: number;
  readonly c: number;
}

interface Resolved<R> {
  readonly col: ColumnDef<R>;
  readonly width: number;
  readonly pin: Pin;
  readonly offset: number;
  readonly lastLeft: boolean;
  readonly firstRight: boolean;
}

/* --------------------------------------------------------- adopting a foreign view
 * A view arriving off the address bar was written by SOME grid, not necessarily this one — a link
 * pasted from an older build whose columns have since changed, or a second grid sharing the route
 * (the register draws its ledger and its decomposition against `#/register`). `parseView` already
 * proves the SHAPE of the record; what it cannot know is the column set, so every column id is
 * proven here against the live one. A view that names nothing this grid has is not this grid's
 * view at all, and the grid opens at its own default rather than in a state assembled from
 * another screen's ids. */
function pickKnown<V>(m: Readonly<Record<string, V>>, ids: ReadonlySet<string>): Record<string, V> {
  return Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)));
}

/* Depth of a row in the forest, walked upward. The `seen` guard is not defensive decoration: a
 * surface that computed a cyclic parentage would otherwise hang the grid rather than draw a wrong
 * number, and a hang is the one failure a reader cannot diagnose. */
function depthIn<R>(row: R, byRowId: ReadonlyMap<string, R>, h: Hierarchy<R>): number {
  let depth = 0;
  let parentId = h.parentOf(row);
  const seen = new Set<string>();
  while (parentId !== null && !seen.has(parentId)) {
    const parent = byRowId.get(parentId);
    if (!parent) break;
    seen.add(parentId);
    depth += 1;
    parentId = h.parentOf(parent);
  }
  return depth;
}

/** Branches at or beyond `openToDepth` start closed. Seeded once, so a later payload never
 * reopens what the reader has closed. */
function initialCollapsed<R>(
  rows: readonly R[],
  rowId: (row: R) => string,
  h: Hierarchy<R> | undefined,
): ReadonlySet<string> {
  if (!h || h.openToDepth === undefined) return new Set();
  const byRowId = new Map(rows.map((r) => [rowId(r), r]));
  const out = new Set<string>();
  for (const r of rows) {
    if (h.isBranch(r) && depthIn(r, byRowId, h) >= h.openToDepth) out.add(rowId(r));
  }
  return out;
}

function adoptView<R>(v: GridViewState, columns: readonly ColumnDef<R>[], base: GridViewState): GridViewState {
  const ids = new Set(columns.map((c) => c.id));
  const mentions =
    v.sort.some((k) => ids.has(k.colId)) ||
    Object.keys(v.filters).some((id) => ids.has(id)) ||
    v.hidden.some((id) => ids.has(id)) ||
    v.order.some((id) => ids.has(id)) ||
    Object.keys(v.pins).some((id) => ids.has(id)) ||
    Object.keys(v.widths).some((id) => ids.has(id)) ||
    (v.groupBy !== null && ids.has(v.groupBy));
  if (!mentions) return { ...base, density: v.density };
  return {
    ...v,
    sort: v.sort.filter((k) => ids.has(k.colId)),
    filters: pickKnown(v.filters, ids),
    hidden: v.hidden.filter((id) => ids.has(id)),
    order: v.order.filter((id) => ids.has(id)),
    pins: pickKnown(v.pins, ids),
    widths: pickKnown(v.widths, ids),
    groupBy: v.groupBy !== null && ids.has(v.groupBy) ? v.groupBy : null,
  };
}

export function DataGrid<R>(props: DataGridProps<R>) {
  const {
    gridId,
    route,
    label,
    noun,
    rows,
    columns,
    rowId,
    rowLabel,
    rowBar,
    seekColId,
    defaultSort,
    activeRowId,
    onActiveRow,
    onOpenRow,
    onInspectRow,
    calibration,
    provenance,
    asOf,
    exportName,
    exportTitle,
    emptyTitle,
    emptyBody,
    footnote,
    toolbarExtra,
    forceColumns,
    hierarchy,
  } = props;

  /* ---------------------------------------------------------------- view state */
  const [view, setView] = useState<GridViewState>(() => {
    const base: GridViewState = {
      ...emptyView(loadDensity(gridId)),
      sort: defaultSort ?? [],
      hidden: columns.filter((c) => c.hidden).map((c) => c.id),
      pins: Object.fromEntries(columns.map((c) => [c.id, c.pin ?? null])),
    };
    const fromUrl = viewFromHash(route);
    return fromUrl ? adoptView(fromUrl, columns, base) : base;
  });
  const patch = useCallback((p: Partial<GridViewState>) => setView((v) => ({ ...v, ...p })), []);

  /* The surface's assertion about which columns the view must carry, applied when that assertion
     CHANGES and never on every render — otherwise a reader who hides a column watches it come
     straight back. */
  const forceKey = JSON.stringify(forceColumns ?? {});
  useEffect(() => {
    const want = JSON.parse(forceKey) as Record<string, boolean>;
    const ids = Object.keys(want);
    if (ids.length === 0) return;
    setView((v) => {
      const hidden = new Set(v.hidden);
      for (const id of ids) {
        if (want[id]) hidden.delete(id);
        else hidden.add(id);
      }
      return { ...v, hidden: [...hidden] };
    });
  }, [forceKey]);

  const [savedViews, setSavedViews] = useState<readonly SavedView[]>(() => loadSavedViews(gridId));
  const [activeView, setActiveView] = useState<number>(-1);
  const [focus, setFocus] = useState<Focus>({ r: 0, c: 0 });
  const [zone, setZone] = useState<"body" | "header">("body");
  const [anchor, setAnchor] = useState<Focus | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => initialCollapsed(rows, rowId, hierarchy));
  const [seek, setSeek] = useState("");
  const [menu, setMenu] = useState<{ colId: string; x: number; y: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /* Which edges of the scroll box still hide something. `below` is the vertical twin of `right`:
     a body that ends flush on a row boundary with nine more rows beneath it and no cue reads as
     the whole ledger, which is the most expensive misreading a register can produce. */
  const [edge, setEdge] = useState<{ left: boolean; right: boolean; above: boolean; below: boolean }>({
    left: false,
    right: true,
    above: false,
    below: true,
  });
  const readEdges = useCallback((el: HTMLElement) => {
    setEdge({
      left: el.scrollLeft > 0,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      above: el.scrollTop > 0,
      below: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);
  const [viewportRows, setViewportRows] = useState(20);
  const [scrollTop, setScrollTop] = useState(0);
  /* The grand-total band absorbs whatever the viewport height leaves over after a whole number
   * of rows. A body that ends mid-x-height reads as a paint bug rather than as "there is more
   * below", and the total row is already opaque and sticky at the foot, so growing it by the
   * remainder makes the rows region an exact multiple of the row pitch at every viewport size. */
  const [totalH, setTotalH] = useState(0);
  const [drag, setDrag] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const seekTimer = useRef<number | null>(null);
  const noteTimer = useRef<number | null>(null);

  const tier = TIERS[view.density];
  const byId = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const say = useCallback((message: string) => {
    setNote(message);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 4200);
  }, []);

  useEffect(
    () => () => {
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
      if (seekTimer.current !== null) window.clearTimeout(seekTimer.current);
    },
    [],
  );

  /* ---------------------------------------------------------------- columns */
  const ordered = useMemo(() => {
    const rank = new Map(view.order.map((id, i) => [id, i]));
    return [...columns].sort((a, b) => (rank.get(a.id) ?? columns.indexOf(a)) - (rank.get(b.id) ?? columns.indexOf(b)));
  }, [columns, view.order]);

  const visible = useMemo(
    () => ordered.filter((c) => !view.hidden.includes(c.id)),
    [ordered, view.hidden],
  );

  const [frameW, setFrameW] = useState(1200);

  /* Two bands of the grid are CONDITIONAL, and the row budget has to know it. A group band is
     drawn only where a column actually names a group (§2.2), and a grand total is worth a row of
     the ledger only where at least one visible column carries a live aggregator — over a ledger
     of rates and identifiers it costs a row of paper to print a line of em-dashes and a count the
     status bar already states. Reserving either unconditionally silently spent a row of density
     on a band that was never rendered. */
  const hasBand = useMemo(() => visible.some((c) => (c.group ?? "") !== ""), [visible]);
  const hasTotals = useMemo(
    () =>
      visible.some((c) => {
        const t = columnType(c.type);
        return t.numeric && (c.agg === undefined ? t.agg : c.agg) !== null;
      }),
    [visible],
  );

  const headStackH = (hasBand ? tier.header - 4 : 0) + tier.header + tier.filter;
  /* The frame is measured, never the scroll box: the scroll box's own height is an OUTPUT of this
     effect, so observing it would feed back on itself. */
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const el = scrollRef.current;
    if (!frame || !el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setFrameW(el.clientWidth);
      const avail = frame.clientHeight;
      /* the grand total, where there is one, holds one row of the box */
      const forRows = avail - headStackH - (hasTotals ? tier.row : 0);
      const n = Math.max(1, Math.floor(forRows / tier.row));
      setViewportRows(n);
      setTotalH(hasTotals ? tier.row + Math.max(0, forRows - n * tier.row) : 0);
      readEdges(el);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [tier.row, headStackH, hasTotals, readEdges]);

  /* Pin resolution, with the 40% ceiling enforced in code rather than trusted to a config.
     When the ceiling is hit the LAST pinned column loses its pin — identity keeps the left edge.
     -----------------------------------------------------------------------------------------
     FIT TO WIDTH. A grid whose declared widths fall short of its frame leaves a dead gutter on
     the right; a grid that overruns it slides its last scrolling column under the right-pinned
     region and amputates the values there. Neither is acceptable on a governance ledger, so the
     surplus — and only ever a surplus, never a deficit — is distributed across the scrolling
     columns in proportion to their declared width. A column the reader has resized by hand is
     frozen at that width and takes no share: an explicit instruction outranks the layout. */
  const resolved = useMemo<readonly Resolved<R>[]>(() => {
    const widthOf = (c: ColumnDef<R>) => view.widths[c.id] ?? c.width;
    const pinOf = (c: ColumnDef<R>): Pin => (c.id in view.pins ? (view.pins[c.id] ?? null) : (c.pin ?? null));
    const left = visible.filter((c) => pinOf(c) === "left");
    const right = visible.filter((c) => pinOf(c) === "right");
    const centre = visible.filter((c) => pinOf(c) === null);
    const cap = Math.max(160, frameW * MAX_PINNED_SHARE);
    const keptLeft: ColumnDef<R>[] = [];
    const keptRight: ColumnDef<R>[] = [];
    let used = 0;
    for (const c of left) {
      if (used + widthOf(c) > cap) break;
      keptLeft.push(c);
      used += widthOf(c);
    }
    for (const c of right) {
      if (used + widthOf(c) > cap) break;
      keptRight.push(c);
      used += widthOf(c);
    }
    const demoted = new Set(
      [...left, ...right].filter((c) => !keptLeft.includes(c) && !keptRight.includes(c)).map((c) => c.id),
    );
    const out: Resolved<R>[] = [];
    let acc = 0;
    for (const c of keptLeft) {
      out.push({ col: c, width: widthOf(c), pin: "left", offset: acc, lastLeft: false, firstRight: false });
      acc += widthOf(c);
    }
    if (out.length > 0) {
      const last = out[out.length - 1];
      if (last) out[out.length - 1] = { ...last, lastLeft: true };
    }
    for (const c of centre) {
      out.push({ col: c, width: widthOf(c), pin: null, offset: 0, lastLeft: false, firstRight: false });
    }
    for (const c of [...left, ...right].filter((c) => demoted.has(c.id))) {
      out.push({ col: c, width: widthOf(c), pin: null, offset: 0, lastLeft: false, firstRight: false });
    }
    /* fit to the frame, across the scrolling region, before the right pins are laid out */
    const declared = out.reduce((sum, r) => sum + r.width, 0) + keptRight.reduce((sum, c) => sum + widthOf(c), 0);
    const delta = frameW - declared;
    const flexible = out.filter((r) => r.pin === null && !(r.col.id in view.widths));
    /* A SURPLUS is handed out in one proportional pass. A DEFICIT is absorbed column by column
       against a per-column floor, iteratively: each pass shares what is left among the columns
       still above their floor, so a narrow column (Artifacts at 74) is not squeezed to a stub
       while a wide one keeps its slack. When every column has reached its floor and a deficit
       survives, the reader has genuinely admitted more columns than the frame holds and the grid
       scrolls — with the frozen-edge cue that says so. Never a single all-or-nothing test: that
       is what left a 6px slice of a column amputated under the right-pinned region. */
    const floorOf = (r: Resolved<R>) => Math.min(r.width, FIT_FLOOR);
    const sized = new Map<string, number>(flexible.map((r) => [r.col.id, r.width]));
    if (flexible.length > 0 && delta > 0) {
      const basis = flexible.reduce((sum, r) => sum + r.width, 0);
      let handed = 0;
      flexible.forEach((r, i) => {
        const share = i === flexible.length - 1 ? delta - handed : Math.round((delta * r.width) / basis);
        handed += share;
        sized.set(r.col.id, r.width + share);
      });
    } else if (flexible.length > 0 && delta < 0 && -delta <= frameW * MAX_ABSORB_SHARE) {
      let owed = -delta;
      for (let pass = 0; pass < 8 && owed > 0; pass += 1) {
        const room = flexible.filter((r) => (sized.get(r.col.id) ?? r.width) > floorOf(r));
        const basis = room.reduce((sum, r) => sum + ((sized.get(r.col.id) ?? r.width) - floorOf(r)), 0);
        if (room.length === 0 || basis <= 0) break;
        const take = Math.min(owed, basis);
        let handed = 0;
        room.forEach((r, i) => {
          const cur = sized.get(r.col.id) ?? r.width;
          const slack = cur - floorOf(r);
          const cut = i === room.length - 1 ? take - handed : Math.round((take * slack) / basis);
          handed += cut;
          sized.set(r.col.id, Math.max(floorOf(r), cur - cut));
        });
        owed -= take;
      }
    }
    for (let i = 0; i < out.length; i += 1) {
      const r = out[i];
      if (!r) continue;
      const w = sized.get(r.col.id);
      if (w !== undefined && r.pin === null && w !== r.width) out[i] = { ...r, width: w };
    }
    /* left offsets are recomputed after the grow pass so a pinned edge never drifts */
    let lacc = 0;
    for (let i = 0; i < out.length; i += 1) {
      const r = out[i];
      if (!r || r.pin !== "left") continue;
      out[i] = { ...r, offset: lacc };
      lacc += r.width;
    }

    let racc = 0;
    const rightResolved: Resolved<R>[] = [];
    for (const c of [...keptRight].reverse()) {
      rightResolved.unshift({
        col: c,
        width: widthOf(c),
        pin: "right",
        offset: racc,
        lastLeft: false,
        firstRight: false,
      });
      racc += widthOf(c);
    }
    const first = rightResolved[0];
    if (first) rightResolved[0] = { ...first, firstRight: true };
    return [...out, ...rightResolved];
  }, [visible, view.widths, view.pins, frameW]);

  const totalW = useMemo(() => resolved.reduce((s, r) => s + r.width, 0), [resolved]);

  /* ---------------------------------------------------------------- distinct values */
  const distinct = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const c of columns) {
      if (columnType(c.type).filterKind !== "set") continue;
      const counts = new Map<string, number>();
      for (const r of rows) {
        const v = c.value(r);
        const k = v.key ?? v.text;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      m.set(c.id, counts);
    }
    return m;
  }, [columns, rows]);

  /* ---------------------------------------------------------------- filter + sort */
  const cellCache = useMemo(() => {
    const m = new Map<string, Map<string, CellValue>>();
    for (const r of rows) {
      const inner = new Map<string, CellValue>();
      for (const c of columns) inner.set(c.id, c.value(r));
      m.set(rowId(r), inner);
    }
    return m;
  }, [rows, columns, rowId]);

  const cellOf = useCallback(
    (row: R, colId: string): CellValue => {
      const v = cellCache.get(rowId(row))?.get(colId);
      return v ?? { sort: null, text: "—", absent: true };
    },
    [cellCache, rowId],
  );

  const filtered = useMemo(() => {
    const q = view.quick.trim().toLowerCase();
    const entries = Object.entries(view.filters);
    return rows.filter((r) => {
      for (const [colId, f] of entries) {
        const col = byId.get(colId);
        if (!col) continue;
        const v = cellOf(r, colId);
        if (!matches(f, v)) return false;
      }
      if (q) {
        let hit = false;
        for (const c of visible) {
          if (cellOf(r, c.id).text.toLowerCase().includes(q)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, view.filters, view.quick, byId, cellOf, visible]);

  /* Under a hierarchy the filter keeps the PATH to every match. A decomposition whose matching
     leaf is shown without the levels that carry it is not a filtered decomposition, it is a list
     with the reconciliation cut off — the reader can no longer see what share of what the row is.
     Ancestors are admitted, never their other children, so the levels on screen still state
     honestly that they are showing part of themselves. */
  const kept = useMemo(() => {
    if (!hierarchy || filtered.length === rows.length) return filtered;
    const byRowId = new Map(rows.map((r) => [rowId(r), r]));
    const keep = new Set(filtered.map(rowId));
    for (const r of filtered) {
      let parentId = hierarchy.parentOf(r);
      while (parentId !== null && !keep.has(parentId)) {
        const parent = byRowId.get(parentId);
        if (!parent) break;
        keep.add(parentId);
        parentId = hierarchy.parentOf(parent);
      }
    }
    return rows.filter((r) => keep.has(rowId(r)));
  }, [hierarchy, filtered, rows, rowId]);

  const sorted = useMemo(() => {
    if (view.sort.length === 0) return kept;
    const keys = view.sort.filter((k) => byId.has(k.colId));
    return [...kept].sort((a, b) => {
      for (const k of keys) {
        const av = cellOf(a, k.colId).sort;
        const bv = cellOf(b, k.colId).sort;
        const cmp = compare(av, bv);
        if (cmp !== 0) return k.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [kept, view.sort, byId, cellOf]);

  /* ---------------------------------------------------------------- grouping
   * One lens at a time, re-pivoting in place. Rows the lens cannot place are not dropped and not
   * silently merged into a neighbour — they collect in an explicit residual group, because
   * hiding the unattributed remainder is what destroys trust in a governance screen (§4.2). */
  /* A forest is already pivoted, so the lens and the hierarchy are mutually exclusive: offering
     both would let a reader re-bucket rows that already state their own parentage. */
  const groupCol = view.groupBy !== null && !hierarchy ? (byId.get(view.groupBy) ?? null) : null;

  const groups = useMemo(() => {
    if (!groupCol) return null;
    const m = new Map<string, R[]>();
    for (const r of sorted) {
      const v = cellOf(r, groupCol.id);
      const k = v.absent ? " residual" : (v.key ?? v.text);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    const out = [...m.entries()].map(([key, list]) => ({
      key,
      label: key === " residual" ? `Unattributed — ${groupCol.header.toLowerCase()} not recorded` : key,
      rows: list as readonly R[],
    }));
    /* Ranked, not alphabetical: the reader wants the heaviest leaf first (§4.2 Top-N). */
    const measure = visible.find((c) => columnType(c.type).agg === "sum" && (c.agg ?? columnType(c.type).agg) === "sum");
    if (measure) {
      out.sort(
        (a, b) =>
          sumOf(b.rows, measure.id, cellOf) - sumOf(a.rows, measure.id, cellOf) || a.label.localeCompare(b.label),
      );
    } else {
      out.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
    }
    /* the residual always sits last, whatever it weighs */
    out.sort((a, b) => Number(a.key === " residual") - Number(b.key === " residual"));
    return out;
  }, [groupCol, sorted, cellOf, visible]);

  /* ---------------------------------------------------------------- the forest
   * Children keep the order `sorted` put them in, so a sort is SIBLING-SCOPED for free: the
   * heaviest domain leads the tree and the heaviest driver leads its own domain, without either
   * ever being lifted out of the level it reconciles against. A row whose parent is not on screen
   * stands as a root, so a filtered or partial forest still draws every row it was given. */
  const forest = useMemo(() => {
    if (!hierarchy) return null;
    const present = new Set(sorted.map(rowId));
    const kids = new Map<string, R[]>();
    const roots: R[] = [];
    for (const r of sorted) {
      const parentId = hierarchy.parentOf(r);
      if (parentId !== null && present.has(parentId)) {
        const list = kids.get(parentId);
        if (list) list.push(r);
        else kids.set(parentId, [r]);
      } else roots.push(r);
    }
    return { roots: roots as readonly R[], kids };
  }, [hierarchy, sorted, rowId]);

  const display = useMemo<readonly DisplayRow<R>[]>(() => {
    if (hierarchy && forest) {
      const out: DisplayRow<R>[] = [];
      const walk = (row: R, depth: number) => {
        const id = rowId(row);
        const children = forest.kids.get(id) ?? [];
        const branch = hierarchy.isBranch(row);
        const expanded = branch && !collapsed.has(id);
        out.push({ kind: "leaf", row, indent: depth, branch, expanded, kids: children.length });
        if (expanded) for (const child of children) walk(child, depth + 1);
      };
      for (const root of forest.roots) walk(root, 0);
      return out;
    }
    if (!groups) return sorted.map((row) => ({ kind: "leaf", row, indent: 0 }));
    const out: DisplayRow<R>[] = [];
    for (const g of groups) {
      out.push({ kind: "group", key: g.key, label: g.label, count: g.rows.length });
      if (!collapsed.has(g.key)) for (const row of g.rows) out.push({ kind: "leaf", row, indent: 1 });
    }
    return out;
  }, [hierarchy, forest, groups, sorted, collapsed, rowId]);

  const groupRowsFor = useCallback(
    (key: string): readonly R[] => groups?.find((g) => g.key === key)?.rows ?? [],
    [groups],
  );

  /* ---------------------------------------------------------------- URL address */
  const isDefault =
    sortKeysEqual(view.sort, defaultSort ?? []) &&
    Object.keys(view.filters).length === 0 &&
    view.quick === "" &&
    view.groupBy === null;
  useEffect(() => {
    writeHash(route, view, isDefault);
  }, [route, view, isDefault]);

  useEffect(() => {
    storeDensity(gridId, view.density);
  }, [gridId, view.density]);

  /* keep the focused cell inside the grid after a filter shrinks it */
  useEffect(() => {
    setFocus((f) => ({
      r: Math.min(f.r, Math.max(0, display.length - 1)),
      c: Math.min(f.c, Math.max(0, resolved.length - 1)),
    }));
  }, [display.length, resolved.length]);

  /* ---------------------------------------------------------------- sorting */
  const cycleSort = useCallback(
    (colId: string, additive: boolean) => {
      setView((v) => {
        const idx = v.sort.findIndex((k) => k.colId === colId);
        const cur = idx === -1 ? null : (v.sort[idx]?.dir ?? null);
        const next: SortKey | null = cur === null ? { colId, dir: "asc" } : cur === "asc" ? { colId, dir: "desc" } : null;
        if (!additive) return { ...v, sort: next ? [next] : [] };
        const rest = v.sort.filter((k) => k.colId !== colId);
        if (!next) return { ...v, sort: rest };
        const at = Math.min(idx === -1 ? rest.length : idx, rest.length);
        const merged = [...rest];
        merged.splice(at, 0, next);
        return { ...v, sort: merged };
      });
    },
    [],
  );

  const setFilter = useCallback((colId: string, f: ColumnFilter | null) => {
    setView((v) => {
      const next = { ...v.filters };
      if (f === null) delete next[colId];
      else next[colId] = f;
      return { ...v, filters: next };
    });
  }, []);

  const clearAll = useCallback(() => {
    setView((v) => ({ ...v, filters: {}, quick: "" }));
  }, []);

  const setPin = useCallback((colId: string, pin: Pin) => {
    setView((v) => ({ ...v, pins: { ...v.pins, [colId]: pin } }));
  }, []);

  const toggleHidden = useCallback((colId: string) => {
    setView((v) => ({
      ...v,
      hidden: v.hidden.includes(colId) ? v.hidden.filter((x) => x !== colId) : [...v.hidden, colId],
    }));
  }, []);

  const moveColumn = useCallback(
    (colId: string, delta: number) => {
      setView((v) => {
        const ids = (v.order.length ? v.order : columns.map((c) => c.id)).slice();
        const i = ids.indexOf(colId);
        if (i === -1) return v;
        const j = Math.min(ids.length - 1, Math.max(0, i + delta));
        ids.splice(j, 0, ...ids.splice(i, 1));
        return { ...v, order: ids };
      });
    },
    [columns],
  );

  const resizeColumn = useCallback(
    (colId: string, delta: number) => {
      setView((v) => {
        const cur = v.widths[colId] ?? byId.get(colId)?.width ?? 120;
        return { ...v, widths: { ...v.widths, [colId]: Math.max(MIN_COL_W, cur + delta) } };
      });
    },
    [byId],
  );

  const widthOfCol = useCallback(
    (colId: string) => view.widths[colId] ?? byId.get(colId)?.width ?? 120,
    [view.widths, byId],
  );

  /* ---- pointer resize: a grip on the header's trailing edge -------------------------------
   * Alt+←/→ already resizes from the keyboard; a practitioner reaches for the edge with a mouse
   * before reading any documentation, and a grid that does not answer that gesture reads as a
   * rendered table rather than as an instrument. */
  const startResize = useCallback(
    (colId: string, clientX: number) => {
      const start = widthOfCol(colId);
      setDrag(colId);
      const move = (ev: PointerEvent) => {
        setView((v) => ({
          ...v,
          widths: { ...v.widths, [colId]: Math.max(MIN_COL_W, Math.round(start + ev.clientX - clientX)) },
        }));
      };
      const up = () => {
        setDrag(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [widthOfCol],
  );

  /* ---- autosize: measure the rendered face, never guess an average character -----------------
   * A width guessed from a character count is wrong by a whole word in a proportional face, and
   * an identifier clipped mid-token is worse than no identifier at all: the reader cannot tell
   * whether they are looking at the whole code. Samples a fixed 200-row set once (§2.6). */
  const autoSize = useCallback(
    (colId: string) => {
      const col = byId.get(colId);
      const root = rootRef.current;
      if (!col || !root) return;
      const t = columnType(col.type);
      const probe = document.createElement("span");
      probe.className = `dg-measure dg-val${t.mono ? " mono" : ""}`;
      root.appendChild(probe);
      let w = 0;
      const sample = sorted.slice(0, AUTOSIZE_SAMPLE);
      for (const r of sample) {
        probe.textContent = cellOf(r, colId).text;
        w = Math.max(w, probe.offsetWidth);
      }
      probe.className = "dg-measure dg-h-label";
      probe.textContent = col.header;
      const headW = probe.offsetWidth + 30; /* sort caret, its gutter and the menu chevron */
      probe.className = "dg-measure dg-h-unit";
      probe.textContent = col.unit ?? "";
      const unitW = probe.offsetWidth;
      root.removeChild(probe);
      const pad = tier.padX * 2 + (t.numeric ? 0 : 6);
      const next = Math.max(MIN_COL_W, Math.ceil(Math.max(w + pad, headW, unitW + tier.padX * 2)));
      setView((v) => ({ ...v, widths: { ...v.widths, [colId]: next } }));
      say(`${col.header} sized to its longest value in view — ${next}px`);
    },
    [byId, sorted, cellOf, tier.padX, say],
  );

  /* Hand every column back to the layout: clears every manual width so the fit-to-width pass
     redistributes the frame from the declared widths again. */
  const resetWidths = useCallback(() => {
    setView((v) => ({ ...v, widths: {} }));
    say("Column widths returned to the layout");
  }, [say]);

  /* ---------------------------------------------------------------- clipboard + export */
  const rangeRect = useMemo(() => {
    if (!anchor) return null;
    return {
      r0: Math.min(anchor.r, focus.r),
      r1: Math.max(anchor.r, focus.r),
      c0: Math.min(anchor.c, focus.c),
      c1: Math.max(anchor.c, focus.c),
    };
  }, [anchor, focus]);

  const copyRange = useCallback(
    (withHeaders: boolean) => {
      const rect = rangeRect ?? { r0: focus.r, r1: focus.r, c0: focus.c, c1: focus.c };
      const cols = resolved.slice(rect.c0, rect.c1 + 1);
      const out: string[][] = [];
      if (withHeaders) out.push(cols.map((c) => headerText(c.col)));
      for (let r = rect.r0; r <= rect.r1; r += 1) {
        const d = display[r];
        if (!d) continue;
        if (d.kind === "group") out.push(cols.map((c, i) => (i === 0 ? d.label : groupAggText(c.col, groupRowsFor(d.key), cellOf))));
        else out.push(cols.map((c) => cellOf(d.row, c.col.id).text));
      }
      void copyText(toTsv(out)).then((ok) =>
        say(ok ? `Copied ${out.length} row${out.length === 1 ? "" : "s"} — tab-delimited` : "The clipboard refused the copy"),
      );
    },
    [rangeRect, focus, resolved, display, cellOf, groupRowsFor, say],
  );

  const filterWords = useMemo(() => {
    const parts: string[] = [];
    for (const [colId, f] of Object.entries(view.filters)) {
      const c = byId.get(colId);
      if (c) parts.push(filterPhrase(c.header, f));
    }
    if (view.quick.trim()) parts.push(`any column contains “${view.quick.trim()}”`);
    return parts;
  }, [view.filters, view.quick, byId]);

  const doExport = useCallback(() => {
    const cols = resolved.map((r) => r.col);
    /* Indentation is a rendering fact, and a spreadsheet does not carry it. Under a hierarchy the
       export states the level as a NUMBER in its own leading column, so the tree survives the
       round trip into a pivot instead of arriving as a flat list whose parents look like peers. */
    const head: string[] = hierarchy ? ["Level"] : [];
    for (const c of cols) {
      head.push(headerText(c));
      if (carriesConfidence(c, rows, cellOf)) head.push(`${c.id}_confidence`, `${c.id}_treatment`, `${c.id}_tickmark`);
    }
    const lines: string[][] = [
      [exportTitle ?? "Export provenance"],
      ...provenance.map(([k, v]) => [k, v]),
      ["Filter expression", filterWords.length ? filterWords.join(" AND ") : "none — the full population"],
      ["Sort", view.sort.length ? view.sort.map((k) => `${byId.get(k.colId)?.header ?? k.colId} ${k.dir}`).join(" → ") : "natural order"],
      ["Group by", groupCol ? groupCol.header : hierarchy ? "a decomposition hierarchy — see the Level column" : "none"],
      ["Rows exported", `${sorted.length} of ${rows.length}`],
      ["Exported at", new Date().toISOString()],
      [],
      head,
    ];
    for (const d of display) {
      if (d.kind === "group") {
        const row: string[] = hierarchy ? [""] : [];
        cols.forEach((c, i) => {
          row.push(i === 0 ? d.label : groupAggText(c, groupRowsFor(d.key), cellOf));
          if (carriesConfidence(c, rows, cellOf)) row.push("", "", "");
        });
        lines.push(row);
        continue;
      }
      const row: string[] = hierarchy ? [String(d.indent)] : [];
      for (const c of cols) {
        const v = cellOf(d.row, c.id);
        row.push(v.text);
        if (carriesConfidence(c, rows, cellOf)) {
          row.push(
            v.confidence === undefined ? "" : v.confidence.toFixed(4),
            v.confidence === undefined ? "" : treatmentOf(v.confidence),
            v.tickmark ? TICKMARK_GLYPH[v.tickmark] : "",
          );
        }
      }
      lines.push(row);
    }
    downloadCsv(`${exportName}-${asOf.slice(0, 10)}.csv`, toCsv(lines));
    say(`Exported ${sorted.length} rows with the provenance block`);
  }, [resolved, rows, cellOf, provenance, filterWords, view.sort, byId, groupCol, hierarchy, sorted.length, display, groupRowsFor, exportName, exportTitle, asOf, say]);

  const copyQuery = useCallback(() => {
    const where = filterWords.length ? ` WHERE ${filterWords.join(" AND ")}` : "";
    const order = view.sort.length
      ? ` ORDER BY ${view.sort.map((k) => `${byId.get(k.colId)?.header ?? k.colId} ${k.dir.toUpperCase()}`).join(", ")}`
      : "";
    const group = groupCol ? ` GROUP BY ${groupCol.header}` : "";
    void copyText(`SELECT ${resolved.map((r) => r.col.header).join(", ")} FROM ${gridId}${where}${group}${order}`).then(
      (ok) => say(ok ? "Query copied" : "The clipboard refused the copy"),
    );
  }, [filterWords, view.sort, byId, groupCol, resolved, gridId, say]);

  const copyLink = useCallback(() => {
    void copyText(deepLink(route, view)).then((ok) =>
      say(ok ? "Deep link copied — it carries the filters, sort, grouping and layout" : "The clipboard refused the copy"),
    );
  }, [route, view, say]);

  /* ---------------------------------------------------------------- saved views */
  const applySaved = useCallback(
    (i: number) => {
      const v = savedViews[i];
      if (!v) return;
      setView(v.state);
      setActiveView(i);
      say(`View “${v.name}” applied`);
    },
    [savedViews, say],
  );

  const cycleSaved = useCallback(
    (delta: number) => {
      if (savedViews.length === 0) {
        say(`No saved views yet — narrow the ${noun}, then save the view`);
        return;
      }
      const next = (activeView + delta + savedViews.length + 1) % (savedViews.length + 1);
      if (next === savedViews.length) {
        setActiveView(-1);
        setView((v) => ({
          ...emptyView(v.density),
          sort: defaultSort ?? [],
          pins: v.pins,
          order: v.order,
          widths: v.widths,
          hidden: v.hidden,
        }));
        say(`Back to the unrestricted ${noun}`);
      } else applySaved(next);
    },
    [savedViews, activeView, applySaved, say, defaultSort, noun],
  );

  const saveView = useCallback(() => {
    const name = window.prompt("Name this view", `View ${savedViews.length + 1}`);
    if (!name) return;
    const next = [...savedViews.filter((v) => v.name !== name), { name, state: view }];
    setSavedViews(next);
    storeSavedViews(gridId, next);
    setActiveView(next.length - 1);
    say(`Saved “${name}” to this browser — saved views are local, never shared`);
  }, [savedViews, view, gridId, say]);

  const dropView = useCallback(
    (name: string) => {
      const next = savedViews.filter((v) => v.name !== name);
      setSavedViews(next);
      storeSavedViews(gridId, next);
      setActiveView(-1);
    },
    [savedViews, gridId],
  );

  /* ---------------------------------------------------------------- navigation */
  const scrollCellIntoView = useCallback(
    (f: Focus) => {
      const el = scrollRef.current;
      if (!el) return;
      /* the sticky header stack above and the grand-total band below are both occluders: a cell
         scrolled to the literal viewport edge would sit UNDER one of them. */
      const top = f.r * tier.row;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + tier.row > el.scrollTop + el.clientHeight - headStackH - totalH)
        el.scrollTop = top + tier.row - el.clientHeight + headStackH + totalH;
      let x = 0;
      for (let i = 0; i < f.c; i += 1) x += resolved[i]?.width ?? 0;
      const w = resolved[f.c]?.width ?? 0;
      const pinned = resolved[f.c]?.pin;
      if (pinned === null) {
        const leftPad = resolved.filter((r) => r.pin === "left").reduce((s, r) => s + r.width, 0);
        const rightPad = resolved.filter((r) => r.pin === "right").reduce((s, r) => s + r.width, 0);
        if (x - leftPad < el.scrollLeft) el.scrollLeft = Math.max(0, x - leftPad);
        else if (x + w + rightPad > el.scrollLeft + el.clientWidth)
          el.scrollLeft = x + w + rightPad - el.clientWidth;
      }
    },
    [tier, resolved, headStackH, totalH],
  );

  const moveFocus = useCallback(
    (dr: number, dc: number, extend: boolean) => {
      setFocus((f) => {
        const next = {
          r: Math.min(display.length - 1, Math.max(0, f.r + dr)),
          c: Math.min(resolved.length - 1, Math.max(0, f.c + dc)),
        };
        scrollCellIntoView(next);
        const d = display[next.r];
        if (d?.kind === "leaf") onActiveRow(d.row);
        return next;
      });
      setAnchor((a) => (extend ? (a ?? focus) : null));
    },
    [display, resolved.length, scrollCellIntoView, onActiveRow, focus],
  );

  const runSeek = useCallback(
    (buf: string) => {
      const i = display.findIndex(
        (d) => d.kind === "leaf" && cellOf(d.row, seekColId).text.toLowerCase().startsWith(buf.toLowerCase()),
      );
      if (i === -1) return;
      setFocus((f) => {
        const next = { r: i, c: f.c };
        scrollCellIntoView(next);
        return next;
      });
      const d = display[i];
      if (d?.kind === "leaf") onActiveRow(d.row);
    },
    [display, cellOf, seekColId, scrollCellIntoView, onActiveRow],
  );

  const focusedRow = useMemo(() => {
    const d = display[focus.r];
    return d && d.kind === "leaf" ? d.row : null;
  }, [display, focus.r]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") {
        if (e.key === "Escape") {
          (target as HTMLInputElement).blur();
          scrollRef.current?.focus();
        }
        return;
      }
      const k = e.key;
      const mod = e.ctrlKey || e.metaKey;

      if (k === "Escape") {
        if (menu) setMenu(null);
        else if (helpOpen) setHelpOpen(false);
        else if (panelOpen) setPanelOpen(false);
        else if (zone === "header") setZone("body");
        else setAnchor(null);
        e.preventDefault();
        return;
      }
      if (k === "?") {
        setHelpOpen((v) => !v);
        e.preventDefault();
        return;
      }
      if (mod && (k === "c" || k === "C")) {
        copyRange(e.shiftKey);
        e.preventDefault();
        return;
      }
      if (mod && (k === "a" || k === "A")) {
        setSelected(new Set(sorted.map(rowId)));
        e.preventDefault();
        return;
      }

      if (zone === "header") {
        const col = resolved[focus.c]?.col;
        if (!col) return;
        if (k === "ArrowLeft" || k === "ArrowRight") {
          const d = k === "ArrowLeft" ? -1 : 1;
          if (e.shiftKey) moveColumn(col.id, d);
          else if (e.altKey) resizeColumn(col.id, d * 16);
          else setFocus((f) => ({ ...f, c: Math.min(resolved.length - 1, Math.max(0, f.c + d)) }));
          e.preventDefault();
        } else if (k === "Enter" && !mod) {
          cycleSort(col.id, e.shiftKey);
          e.preventDefault();
        } else if (k === "Enter" && mod) {
          document.getElementById(filterInputId(gridId, col.id))?.focus();
          e.preventDefault();
        } else if (k === "ArrowDown" && e.altKey) {
          const r = document.getElementById(headerCellId(gridId, col.id))?.getBoundingClientRect();
          if (r) setMenu({ colId: col.id, x: r.left, y: r.bottom });
          e.preventDefault();
        } else if (k === "ArrowDown") {
          setZone("body");
          e.preventDefault();
        }
        return;
      }

      switch (k) {
        case "ArrowDown":
          moveFocus(1, 0, e.shiftKey);
          e.preventDefault();
          return;
        case "ArrowUp":
          if (focus.r === 0) {
            setZone("header");
            e.preventDefault();
            return;
          }
          moveFocus(-1, 0, e.shiftKey);
          e.preventDefault();
          return;
        case "ArrowLeft":
          if (mod) moveFocus(0, -resolved.length, e.shiftKey);
          else moveFocus(0, -1, e.shiftKey);
          e.preventDefault();
          return;
        case "ArrowRight":
          if (mod) moveFocus(0, resolved.length, e.shiftKey);
          else moveFocus(0, 1, e.shiftKey);
          e.preventDefault();
          return;
        case "Home":
          if (mod) moveFocus(-display.length, -resolved.length, e.shiftKey);
          else moveFocus(0, -resolved.length, e.shiftKey);
          e.preventDefault();
          return;
        case "End":
          if (mod) moveFocus(display.length, resolved.length, e.shiftKey);
          else moveFocus(0, resolved.length, e.shiftKey);
          e.preventDefault();
          return;
        case "PageDown":
          moveFocus(viewportRows - 1, 0, e.shiftKey);
          e.preventDefault();
          return;
        case "PageUp":
          moveFocus(-(viewportRows - 1), 0, e.shiftKey);
          e.preventDefault();
          return;
        case " ": {
          const d = display[focus.r];
          if (d?.kind === "leaf") {
            const id = rowId(d.row);
            setSelected((s) => {
              const n = new Set(s);
              if (e.shiftKey) n.add(id);
              else if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            });
          }
          if (mod) {
            const colId = resolved[focus.c]?.col.id;
            if (colId) {
              setAnchor({ r: 0, c: focus.c });
              setFocus({ r: display.length - 1, c: focus.c });
            }
          }
          e.preventDefault();
          return;
        }
        case "Enter": {
          const d = display[focus.r];
          if (d?.kind === "group") {
            setCollapsed((c) => {
              const n = new Set(c);
              if (n.has(d.key)) n.delete(d.key);
              else n.add(d.key);
              return n;
            });
          } else if (d?.kind === "leaf" && d.branch) {
            /* Same key, same meaning as on a lens group: Enter opens the level. A branch has no
               entry behind it to open, so `onOpenRow` is not the fallback here. */
            const id = rowId(d.row);
            setCollapsed((c) => {
              const n = new Set(c);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            });
          } else if (d?.kind === "leaf" && onOpenRow) onOpenRow(d.row);
          e.preventDefault();
          return;
        }
        default:
          break;
      }

      if (mod || e.altKey) return;

      if (k === "/") {
        quickRef.current?.focus();
        e.preventDefault();
        return;
      }
      if (k === "\\") {
        setPanelOpen((v) => !v);
        e.preventDefault();
        return;
      }
      if (k === "[" || k === "]") {
        cycleSaved(k === "[" ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (k === "g") {
        if (hierarchy) {
          say("These rows carry their own decomposition — there is no lens to cycle");
          e.preventDefault();
          return;
        }
        const lenses = [null, ...columns.filter((c) => c.groupable).map((c) => c.id)];
        const i = lenses.indexOf(view.groupBy);
        patch({ groupBy: lenses[(i + 1) % lenses.length] ?? null });
        e.preventDefault();
        return;
      }
      if (k === "d") {
        const i = DENSITIES.indexOf(view.density);
        patch({ density: DENSITIES[(i + 1) % DENSITIES.length] ?? "standard" });
        e.preventDefault();
        return;
      }
      if (k === "o" && focusedRow && onOpenRow) {
        onOpenRow(focusedRow);
        e.preventDefault();
        return;
      }
      if (k === "i" && focusedRow && onInspectRow) {
        onInspectRow(focusedRow);
        e.preventDefault();
        return;
      }
      if (isSeekChar(k)) {
        const buf = seek + k;
        setSeek(buf);
        runSeek(buf);
        if (seekTimer.current !== null) window.clearTimeout(seekTimer.current);
        seekTimer.current = window.setTimeout(() => setSeek(""), 1000);
        e.preventDefault();
      }
    },
    [
      menu, helpOpen, panelOpen, zone, focus, resolved, moveColumn, resizeColumn, cycleSort, gridId, moveFocus,
      display, viewportRows, rowId, onOpenRow, onInspectRow, focusedRow, columns, view.groupBy, view.density,
      patch, cycleSaved, seek, runSeek, copyRange, sorted,
    ],
  );

  /* ---------------------------------------------------------------- scroll edges */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    readEdges(el);
    setScrollTop(el.scrollTop);
  }, [readEdges]);

  /* ---------------------------------------------------------------- windowing */
  const virtual = display.length > VIRTUALISE_ABOVE;
  const first = virtual ? Math.max(0, Math.floor(scrollTop / tier.row) - ROW_BUFFER) : 0;
  const last = virtual ? Math.min(display.length, first + viewportRows + ROW_BUFFER * 2) : display.length;
  const window0 = display.slice(first, last);

  /* ---------------------------------------------------------------- status figures */
  const rangeAgg = useMemo(() => {
    if (!rangeRect) return null;
    const vals: number[] = [];
    for (let r = rangeRect.r0; r <= rangeRect.r1; r += 1) {
      const d = display[r];
      if (!d || d.kind !== "leaf") continue;
      for (let c = rangeRect.c0; c <= rangeRect.c1; c += 1) {
        const col = resolved[c]?.col;
        if (!col || !columnType(col.type).numeric) continue;
        const v = cellOf(d.row, col.id).sort;
        if (typeof v === "number") vals.push(v);
      }
    }
    if (vals.length === 0) return null;
    return {
      n: vals.length,
      sum: vals.reduce((a, b) => a + b, 0),
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [rangeRect, display, resolved, cellOf]);

  /* A legend entry for a glyph the reader cannot see sends them hunting for it, so the legend is
     derived from the rows and the columns ACTUALLY on screen — not from the whole payload. */
  const tickmarksInUse = useMemo(() => {
    const set = new Set<Tickmark>();
    for (const r of sorted) for (const c of visible) {
      const t = cellOf(r, c.id).tickmark;
      if (t) set.add(t);
    }
    return [...set];
  }, [sorted, visible, cellOf]);

  const styleVars = {
    "--grid-row-h": `${tier.row}px`,
    "--grid-header-h": `${tier.header}px`,
    "--grid-filter-h": `${tier.filter}px`,
    "--grid-pad-x": `${tier.padX}px`,
    "--grid-pad-x-lead": `${tier.padXLead}px`,
    "--grid-indent": `${tier.indent}px`,
    "--grid-total-w": `${totalW}px`,
    "--grid-total-h": `${hasTotals ? (totalH > 0 ? totalH : tier.row) : 0}px`,
  } as CSSProperties;

  const groupsBand = useMemo(() => bandsOf(resolved), [resolved]);
  const activeFilterCount = Object.keys(view.filters).length + (view.quick.trim() ? 1 : 0);
  const chipbarLive = activeFilterCount > 0 || view.sort.length > 1 || selected.size > 0;

  return (
    <div className="dg" data-density={view.density} style={styleVars} ref={rootRef}>
      {/* ------------------------------------------------------------ toolbar */}
      <div className="dg-toolbar">
        {/* The binding lives in the hint, not in the placeholder. This is the toolbar's one elastic
            item, and at its floor "Quick filter  ( / )" truncated to a dangling open bracket —
            chrome that reads as broken. A placeholder must survive its own control's minimum. */}
        <div className="dg-quick" data-hint="Filter every column at once ( / )">
          <Search size={14} strokeWidth={1.8} aria-hidden />
          <input
            ref={quickRef}
            className="dg-quick-input"
            placeholder="Quick filter"
            value={view.quick}
            onChange={(e) => patch({ quick: e.target.value })}
            aria-label="Quick filter across every column"
          />
          {view.quick && (
            <button className="dg-icon-btn" onClick={() => patch({ quick: "" })} aria-label="Clear the quick filter">
              <X size={12} strokeWidth={2.1} />
            </button>
          )}
        </div>

        {!hierarchy && (
          <label className="dg-lens">
            <span className="dg-lens-k">Group by</span>
            <select
              className="dg-select"
              value={view.groupBy ?? ""}
              onChange={(e) => patch({ groupBy: e.target.value || null })}
            >
              <option value="">Nothing — flat ledger</option>
              {columns
                .filter((c) => c.groupable)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.header}
                  </option>
                ))}
            </select>
          </label>
        )}

        {toolbarExtra}

        <div className="dg-density" role="group" aria-label="Row density">
          {DENSITIES.map((d) => (
            <button
              key={d}
              className={`dg-seg${view.density === d ? " on" : ""}`}
              onClick={() => patch({ density: d })}
              aria-pressed={view.density === d}
              data-hint={`${d.charAt(0).toUpperCase()}${d.slice(1)} — ${TIERS[d].row}px rows. Spacing only: type, icons, hairlines and ink are identical at every tier`}
            >
              {d.charAt(0).toUpperCase()}
            </button>
          ))}
        </div>

        <div className="dg-views">
          {savedViews.map((v, i) => (
            <span key={v.name} className={`dg-view${activeView === i ? " on" : ""}`}>
              <button className="dg-view-btn" onClick={() => applySaved(i)}>
                {v.name}
              </button>
              <button className="dg-view-x" onClick={() => dropView(v.name)} aria-label={`Delete view ${v.name}`}>
                <X size={10} strokeWidth={2.2} />
              </button>
            </span>
          ))}
          <button className="dg-btn" onClick={saveView} data-hint="Save this arrangement to this browser ( [ ] cycles )">
            Save view
          </button>
        </div>

        <div className="dg-tools">
          <button className="dg-btn" onClick={() => setPanelOpen((v) => !v)} data-hint="Column panel ( \ )" aria-pressed={panelOpen}>
            <Columns3 size={13} strokeWidth={1.8} aria-hidden /> Columns
          </button>
          <button className="dg-btn" onClick={doExport} data-hint="CSV of exactly this view, with the provenance block">
            <Download size={13} strokeWidth={1.8} aria-hidden /> Export
          </button>
          <button className="dg-btn" onClick={copyQuery} data-hint="Copy this view as a query expression">
            <Copy size={13} strokeWidth={1.8} aria-hidden /> Query
          </button>
          <button className="dg-btn" onClick={copyLink} data-hint="Copy a link that restores this exact view">
            <Link2 size={13} strokeWidth={1.8} aria-hidden /> Link
          </button>
          <button className="dg-btn dg-help" onClick={() => setHelpOpen(true)} data-hint-end data-hint="Keyboard grammar ( ? )">
            ?
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ chip bar
       * Mandatory whenever anything restricts the ledger — a filter the reader cannot see is the
       * commonest cause of "the data is missing". When NOTHING restricts it there is no chip to
       * show, so the band is not drawn at all and the status bar states the unrestricted count:
       * 28px of permanent chrome to say "no filters" costs a row of the ledger every screen. */}
      {chipbarLive && (
      <div className="dg-chipbar">
        <span className="dg-count" aria-live="polite">
          <b>{fmtInt(sorted.length)}</b> of {fmtInt(rows.length)} entries
          {selected.size > 0 && <> · {fmtInt(selected.size)} selected</>}
        </span>
        {view.quick.trim() && (
          <FilterChip label={`any column contains “${view.quick.trim()}”`} onDrop={() => patch({ quick: "" })} />
        )}
        {Object.entries(view.filters).map(([colId, f]) => {
          const c = byId.get(colId);
          if (!c) return null;
          return <FilterChip key={colId} label={filterPhrase(c.header, f)} onDrop={() => setFilter(colId, null)} />;
        })}
        {view.sort.length > 1 && (
          <span className="dg-sortstrip" data-hint="Sort priority — click a header to cycle, shift-click to add a key">
            {view.sort.map((k, i) => (
              <button key={k.colId} className="dg-sortchip" onClick={() => cycleSort(k.colId, true)}>
                <span className="dg-sortchip-n">{i + 1}</span>
                {byId.get(k.colId)?.header ?? k.colId} {k.dir === "asc" ? "↑" : "↓"}
              </button>
            ))}
          </span>
        )}
        {activeFilterCount > 0 && (
          <button className="dg-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>
      )}

      {/* ------------------------------------------------------------ the grid */}
      <div className="dg-frame" ref={frameRef}>
        <div
          className={`dg-scroll${edge.left ? " scrolled-x" : ""}${edge.right ? " more-x" : ""}${
            edge.above ? " scrolled-y" : ""
          }${edge.below ? " more-y" : ""}`}
          ref={scrollRef}
          role="grid"
          tabIndex={0}
          aria-label={`${label} grid`}
          aria-rowcount={display.length + 1}
          aria-colcount={resolved.length}
          aria-activedescendant={cellDomId(gridId, focus.r, focus.c)}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
        >
          <div className="dg-canvas" style={{ width: totalW }}>
            <div className="dg-headwrap">
              {/* A band segment is cut at a pin boundary as well as at a group boundary, so a grid
                  that declares no groups but pins its identity column still yields two segments —
                  and the old `length > 1` test rendered them as an empty strip above the header,
                  a floating hairline that cost a row of density and said nothing. The band exists
                  only where a column actually NAMES a group (§2.2). */}
              {groupsBand.some((b) => b.label !== "") && (
                <div className="dg-band" role="row">
                  {groupsBand.map((b, i) => (
                    <div
                      key={`${b.label}-${i}`}
                      className={`dg-band-cell${b.pin ? " pinned" : ""}`}
                      style={bandStyle(b)}
                      role="presentation"
                    >
                      {!b.continues && <span className="dg-band-label">{b.label}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="dg-head" role="row" aria-rowindex={1}>
                {resolved.map((r, i) => {
                  const t = columnType(r.col.type);
                  const si = view.sort.findIndex((k) => k.colId === r.col.id);
                  const sk = si === -1 ? null : view.sort[si];
                  return (
                    <div
                      key={r.col.id}
                      id={headerCellId(gridId, r.col.id)}
                      className={`${cellClass("dg-h", r, t.align, zone === "header" && focus.c === i)}${
                        sk ? " is-sorted" : ""
                      }${drag === r.col.id ? " is-dragging" : ""}`}
                      style={pinStyle(r)}
                      role="columnheader"
                      aria-sort={sk ? (sk.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        className="dg-h-btn"
                        onClick={(e) => {
                          setZone("header");
                          setFocus((f) => ({ ...f, c: i }));
                          cycleSort(r.col.id, e.shiftKey);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMenu({ colId: r.col.id, x: e.clientX, y: e.clientY });
                        }}
                        data-hint={
                          r.col.hint ??
                          `${r.col.header}${r.col.unit ? ` (${r.col.unit})` : ""} — click sorts, shift-click adds a key`
                        }
                        /* A hint that opens leftwards from a column near the frame's right edge
                           is laid out past it, and an absolutely positioned descendant counts
                           toward the scroll box's own scrollable width: the grid then scrolls
                           horizontally by the width of a tooltip nobody is looking at, and the
                           frozen-edge cue fires on a grid that fits. Anchor it to the end for
                           every right-aligned or right-pinned column. */
                        data-hint-end={t.align === "right" || r.pin === "right" ? "" : undefined}
                        aria-label={`${r.col.header}${sk ? `, sorted ${sk.dir === "asc" ? "ascending" : "descending"}, priority ${si + 1}` : ""}`}
                      >
                        <span className="dg-h-text">
                          {/* The caret sits on the label's leading edge and shares its baseline —
                              never inside the type block, and never in the accent: sort direction
                              is the quietest fact in the header, and the sorted column already
                              states itself with a weight step. */}
                          <span className="dg-h-line">
                            <span className={`dg-h-sort${sk ? " on" : ""}`} aria-hidden>
                              {sk ? (sk.dir === "asc" ? "▲" : "▼") : "▾"}
                              {view.sort.length > 1 && si !== -1 && <sup className="dg-h-prio">{si + 1}</sup>}
                            </span>
                            <span className={`dg-h-label${r.col.headerQuiet ? " is-quiet" : ""}`}>{r.col.header}</span>
                          </span>
                          {r.col.unit && <span className="dg-h-unit">{r.col.unit}</span>}
                        </span>
                      </button>
                      <button
                        className="dg-h-menu"
                        onClick={(e) => {
                          const b = e.currentTarget.getBoundingClientRect();
                          setMenu({ colId: r.col.id, x: b.left - 180, y: b.bottom });
                        }}
                        aria-label={`Column menu for ${r.col.header}`}
                        tabIndex={-1}
                      >
                        <ChevronDown size={11} strokeWidth={2} aria-hidden />
                      </button>
                      <span
                        className="dg-h-grip"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${r.col.header}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          startResize(r.col.id, e.clientX);
                        }}
                        onDoubleClick={() => autoSize(r.col.id)}
                        /* End-anchored so the hint opens leftwards. A left-anchored tooltip
                           inside a 7px grip overflows it, and that overflow propagates to the
                           scroll box as phantom horizontal scroll on a grid that fits. */
                        data-hint-end=""
                        data-hint="Drag to resize · double-click to fit the longest value"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="dg-filterrow" role="row">
                {resolved.map((r) => (
                  <div
                    key={r.col.id}
                    className={cellClass("dg-f", r, columnType(r.col.type).align, false)}
                    style={pinStyle(r)}
                    role="presentation"
                  >
                    {r.col.noFilter ? null : (
                      <FloatingFilter
                        gridId={gridId}
                        col={r.col}
                        filter={view.filters[r.col.id] ?? null}
                        options={distinct.get(r.col.id) ?? null}
                        onChange={(f) => setFilter(r.col.id, f)}
                        onOpenSet={(b) => setMenu({ colId: r.col.id, x: Math.max(8, b.left - 8), y: b.bottom + 2 })}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="dg-body" role="rowgroup" style={virtual ? { height: display.length * tier.row } : undefined}>
              {virtual && <div style={{ height: first * tier.row }} aria-hidden />}
              {window0.map((d, wi) => {
                const ri = first + wi;
                if (d.kind === "group") {
                  return (
                    <div
                      key={`g-${d.key}`}
                      className={`dg-row dg-grouprow${focus.r === ri && zone === "body" ? " is-focus-row" : ""}`}
                      role="row"
                      aria-rowindex={ri + 2}
                    >
                      {resolved.map((r, ci) => {
                        const t = columnType(r.col.type);
                        const lead = ci === 0;
                        return (
                          <div
                            key={r.col.id}
                            id={cellDomId(gridId, ri, ci)}
                            className={cellClass("dg-c", r, t.align, focus.r === ri && focus.c === ci && zone === "body")}
                            style={pinStyle(r)}
                            role="gridcell"
                            onClick={() => {
                              setZone("body");
                              setFocus({ r: ri, c: ci });
                            }}
                          >
                            {lead ? (
                              <button
                                className="dg-grouplabel"
                                onClick={() =>
                                  setCollapsed((c) => {
                                    const n = new Set(c);
                                    if (n.has(d.key)) n.delete(d.key);
                                    else n.add(d.key);
                                    return n;
                                  })
                                }
                                aria-expanded={!collapsed.has(d.key)}
                              >
                                {collapsed.has(d.key) ? (
                                  <ChevronRight size={12} strokeWidth={2} aria-hidden />
                                ) : (
                                  <ChevronDown size={12} strokeWidth={2} aria-hidden />
                                )}
                                <span className="dg-group-name">{d.label}</span>
                                <span className="dg-group-n">
                                  {d.count} · {((d.count / Math.max(1, rows.length)) * 100).toFixed(0)}% of the {noun}
                                </span>
                              </button>
                            ) : (
                              <GroupAggCell col={r.col} rows={groupRowsFor(d.key)} cellOf={cellOf} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                const id = rowId(d.row);
                const bar = rowBar?.(d.row) ?? null;
                const isSel = selected.has(id);
                return (
                  <div
                    key={id}
                    className={`dg-row${isSel ? " is-selected" : ""}${activeRowId === id ? " is-active" : ""}${
                      focus.r === ri && zone === "body" ? " is-focus-row" : ""
                    }${d.branch ? " is-branch" : ""}`}
                    role="row"
                    aria-rowindex={ri + 2}
                    aria-selected={isSel}
                    aria-label={rowLabel(d.row)}
                    onClick={() => onActiveRow(d.row)}
                    onDoubleClick={() => onOpenRow?.(d.row)}
                  >
                    {resolved.map((r, ci) => {
                      const t = columnType(r.col.type);
                      const v = cellOf(d.row, r.col.id);
                      const inRange =
                        rangeRect != null &&
                        ri >= rangeRect.r0 &&
                        ri <= rangeRect.r1 &&
                        ci >= rangeRect.c0 &&
                        ci <= rangeRect.c1;
                      return (
                        <div
                          key={r.col.id}
                          id={cellDomId(gridId, ri, ci)}
                          className={`${cellClass("dg-c", r, t.align, focus.r === ri && focus.c === ci && zone === "body")}${
                            inRange ? " in-range" : ""
                          }${ci === 0 && d.indent > 0 ? " is-indented" : ""}`}
                          style={ci === 0 ? leadStyle(r, d.indent) : pinStyle(r)}
                          role="gridcell"
                          onMouseDown={(e) => {
                            setZone("body");
                            if (e.shiftKey) setAnchor((a) => a ?? focus);
                            else setAnchor(null);
                            setFocus({ r: ri, c: ci });
                          }}
                        >
                          {ci === 0 && bar && (
                            <span className={`dg-bar tone-${bar.tone}`} data-hint={bar.hint} aria-hidden />
                          )}
                          {ci === 0 && d.branch && (
                            /* A level that decomposes into nothing keeps the disclosure's width and
                               loses its glyph: the column stays aligned and the emptiness is the
                               statement, rather than the row silently reading as a leaf. */
                            <button
                              className="dg-twisty"
                              aria-expanded={d.expanded === true}
                              aria-label={`${d.expanded === true ? "Collapse" : "Expand"} ${rowLabel(d.row)}`}
                              data-hint={
                                d.kids === 0
                                  ? "This level decomposes no further on this population"
                                  : `${d.kids} beneath — Enter opens the level`
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                setCollapsed((c) => {
                                  const n = new Set(c);
                                  if (n.has(id)) n.delete(id);
                                  else n.add(id);
                                  return n;
                                });
                              }}
                            >
                              {d.kids === 0 ? (
                                <span className="dg-twisty-void" aria-hidden />
                              ) : d.expanded === true ? (
                                <ChevronDown size={12} strokeWidth={2} aria-hidden />
                              ) : (
                                <ChevronRight size={12} strokeWidth={2} aria-hidden />
                              )}
                            </button>
                          )}
                          {r.col.render ? r.col.render(d.row, v) : <Cell v={v} mono={t.mono} accounting={t.accounting} />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {virtual && <div style={{ height: Math.max(0, (display.length - last) * tier.row) }} aria-hidden />}
              {display.length === 0 && (
                <div className="dg-empty">
                  <p className="dg-empty-title">{emptyTitle}</p>
                  <div className="dg-empty-body">{emptyBody(clearAll)}</div>
                </div>
              )}
            </div>

            {/* grand total — pinned to the foot of the canvas, never a fill. Drawn only where
                something is genuinely additive: a band of em-dashes is not a total, and the row
                it costs is a row of the ledger. */}
            {hasTotals && display.length > 0 && (
              <div className="dg-row dg-total" role="row">
                {resolved.map((r, ci) => (
                  <div
                    key={r.col.id}
                    className={cellClass("dg-c", r, columnType(r.col.type).align, false)}
                    style={pinStyle(r)}
                    role="gridcell"
                  >
                    {ci === 0 ? (
                      <span className="dg-total-label">
                        {forest
                          ? `Total · ${fmtInt(forest.roots.length)} at the top level`
                          : `Total · ${fmtInt(sorted.length)} in view`}
                      </span>
                    ) : (
                      /* Under a hierarchy the foot sums the ROOTS, never every row on screen: a
                         decomposition states each level in full, so adding the levels together
                         would count the same weight once per level. The roots are what the tree
                         reconciles to, and the reader can check the arithmetic by eye. */
                      <GroupAggCell col={r.col} rows={forest ? forest.roots : sorted} cellOf={cellOf} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {panelOpen && (
          <ColumnPanel
            columns={ordered}
            view={view}
            onToggle={toggleHidden}
            onPin={setPin}
            onMove={moveColumn}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {/* ------------------------------------------------------------ status bar */}
      <div className="dg-status">
        <span className="dg-status-l">
          <span className="dg-status-b">
            <span className="dg-status-k">Rows</span>
            <span className="dg-status-v">
              {fmtInt(sorted.length)}
              <span className="dg-status-of">/{fmtInt(rows.length)}</span>
            </span>
            <span className="dg-status-note">
              {activeFilterCount === 0 ? "unrestricted" : `${activeFilterCount} restriction${activeFilterCount === 1 ? "" : "s"}`}
            </span>
            {/* How much of the population is actually on the glass. The scroll cue on the grand
                total says "there is more"; this says how much more, and a reader who quotes a
                figure off a screenshot needs the number, not a shadow. */}
            {display.length > viewportRows && (
              <span className="dg-status-note" data-hint="Rows on screen at this density — the body scrolls; the grand total is over the whole filtered population">
                {fmtInt(viewportRows)} on screen
              </span>
            )}
          </span>
          {footnote && <span className="dg-footnote">{footnote}</span>}
          {selected.size > 0 && (
            <span className="dg-status-b">
              <span className="dg-status-k">Selected</span>
              <span className="dg-status-v">{fmtInt(selected.size)}</span>
            </span>
          )}
          {seek && (
            <span className="dg-seek" aria-live="polite">
              ⌕ {seek.toUpperCase()}
            </span>
          )}
          {note && <span className="dg-note">{note}</span>}
        </span>
        <span className="dg-status-r">
          {/* The tickmark legend is PERMANENT chrome, never only a tooltip — a glyph with no
              visible legend is decoration. It renders only the marks present in this view. */}
          {tickmarksInUse.length > 0 && (
            <span className="dg-tickkey">
              {tickmarksInUse.map((t) => (
                <span key={t} className="dg-tickkey-i" data-hint={TICKMARK_MEANING[t]}>
                  <span className="dg-tick">{TICKMARK_GLYPH[t]}</span> {TICKMARK_SHORT[t]}
                </span>
              ))}
            </span>
          )}
          {rangeAgg && (
            <span className="dg-status-b">
              <span className="dg-status-k">Range</span>
              <span className="dg-status-v">
                n {rangeAgg.n} · Σ {rangeAgg.sum.toFixed(2)} · min {rangeAgg.min.toFixed(2)} · max{" "}
                {rangeAgg.max.toFixed(2)}
              </span>
            </span>
          )}
          <span className="dg-status-b">
            <span className="dg-status-k">As of</span>
            <span className="dg-status-v mono">{asOf.slice(0, 10)}</span>
          </span>
          <span className="dg-status-cal">{calibration}</span>
        </span>
      </div>

      {menu && (
        <ColumnMenu
          col={byId.get(menu.colId)}
          x={menu.x}
          y={menu.y}
          view={view}
          options={distinct.get(menu.colId) ?? null}
          onSort={(dir, additive) => {
            setView((v) => {
              const rest = additive ? v.sort.filter((k) => k.colId !== menu.colId) : [];
              return { ...v, sort: dir === null ? rest : [...rest, { colId: menu.colId, dir }] };
            });
            setMenu(null);
          }}
          onPin={(p) => {
            setPin(menu.colId, p);
            setMenu(null);
          }}
          onHide={() => {
            toggleHidden(menu.colId);
            setMenu(null);
          }}
          onAutoSize={() => {
            autoSize(menu.colId);
            setMenu(null);
          }}
          onResetWidths={() => {
            resetWidths();
            setMenu(null);
          }}
          onFilter={(f) => setFilter(menu.colId, f)}
          onClose={() => setMenu(null)}
        />
      )}

      {helpOpen && <KeyHelp surfaceLabel={label} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ cell */
function Cell({ v, mono, accounting }: { v: CellValue; mono: boolean; accounting: boolean }) {
  if (v.absent) {
    return (
      <span className="dg-absent" data-hint={v.note ?? "Not recorded — the enterprise records no such fact"}>
        —
      </span>
    );
  }
  const conf = v.confidence;
  /* §3.3.2 — a value that carries INK (a variance direction) may never be multiplied by the
     confidence opacity: --warn-ink at 0.66 collapses to 2.65:1 and the figure stops being
     legible. Such a value renders at full ink and takes its treatment from the underline texture
     and a weight step alone. Every other numeral keeps the standard bands. */
  const cls =
    conf === undefined ? "" : ` dg-v ${v.dir ? "emph-ink" : "conf"}-${treatmentOf(conf)}`;
  return (
    <span
      className={`dg-val${mono ? " mono" : ""}`}
      data-hint={
        v.note ??
        (conf === undefined ? v.text : `${v.text} · confidence ${(conf * 100).toFixed(1)}% · ${treatmentOf(conf)}`)
      }
    >
      {/* The text is its own box so it can ELLIPSIZE. A value that stops dead against a column
          rule with no signal is worse than a shortened one: the reader cannot tell whether they
          are reading the whole fact. The Confidence Treatment rides on this span alone, so the
          hatched rule sits under the digits and not under the tickmark beside them (§3.3.1). */}
      {/* Direction is a GLYPH first. A variance that says which way it went only in colour is
          unreadable in print and to a third of readers on screen; the arrow is the channel, the
          ink beside it is the redundancy (§3.2). Confidence still rides on the numeral alone. */}
      {v.dir && (
        <span className={`dg-dir dir-${v.dir}`} aria-hidden>
          {v.dir === "up" ? "▲" : "▼"}
        </span>
      )}
      <span className={`dg-text${cls}${v.dir ? ` dir-${v.dir}` : ""}`}>{v.text}</span>
      {/* the closing paren's advance width is reserved on positives too, or the decimal axis
          collapses by one character between a negative and a positive row (§3.2) */}
      {accounting && (
        <span className={`dg-paren${v.text.startsWith("(") ? "" : " is-ghost"}`} aria-hidden>
          )
        </span>
      )}
      {v.tickmark && (
        <span className="dg-tick" data-hint={TICKMARK_MEANING[v.tickmark]}>
          {TICKMARK_GLYPH[v.tickmark]}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ aggregation
 * The weakest link, never the mean (§3.3.3): a subtotal is treated at the MINIMUM confidence of
 * its contributors. Non-additive columns declare `agg: null` and render an em dash rather than a
 * plausible, wrong total. */
function GroupAggCell<R>({
  col,
  rows,
  cellOf,
}: {
  col: ColumnDef<R>;
  rows: readonly R[];
  cellOf: (row: R, colId: string) => CellValue;
}) {
  const t = columnType(col.type);
  const agg = col.agg === undefined ? t.agg : col.agg;
  if (agg === null || !t.numeric) {
    return (
      <span className="dg-agg-none" data-hint={`${col.header} is not additive — a subtotal here would be a reporting error`}>
        —
      </span>
    );
  }
  let n = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let conf = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    const v = cellOf(r, col.id);
    if (typeof v.sort !== "number") continue;
    n += 1;
    sum += v.sort;
    min = Math.min(min, v.sort);
    max = Math.max(max, v.sort);
    if (v.confidence !== undefined) conf = Math.min(conf, v.confidence);
  }
  if (n === 0) return <span className="dg-agg-none">—</span>;
  const value = agg === "sum" ? sum : agg === "min" ? min : agg === "max" ? max : n;
  const treated = Number.isFinite(conf);
  return (
    <span
      className={`dg-agg${treated ? ` dg-v emph-${treatmentOf(conf)}` : ""}`}
      data-hint={
        treated
          ? `${agg} of ${n} contributors · treated at the weakest link, ${(conf * 100).toFixed(0)}%`
          : `${agg} of ${n} contributors`
      }
    >
      {t.format(value)}
    </span>
  );
}

function groupAggText<R>(
  col: ColumnDef<R>,
  rows: readonly R[],
  cellOf: (row: R, colId: string) => CellValue,
): string {
  const t = columnType(col.type);
  const agg = col.agg === undefined ? t.agg : col.agg;
  if (agg === null || !t.numeric) return "";
  let n = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const v = cellOf(r, col.id);
    if (typeof v.sort !== "number") continue;
    n += 1;
    sum += v.sort;
    min = Math.min(min, v.sort);
    max = Math.max(max, v.sort);
  }
  if (n === 0) return "";
  return t.format(agg === "sum" ? sum : agg === "min" ? min : agg === "max" ? max : n);
}

function sumOf<R>(rows: readonly R[], colId: string, cellOf: (row: R, colId: string) => CellValue): number {
  let s = 0;
  for (const r of rows) {
    const v = cellOf(r, colId).sort;
    if (typeof v === "number") s += v;
  }
  return s;
}

function carriesConfidence<R>(
  col: ColumnDef<R>,
  rows: readonly R[],
  cellOf: (row: R, colId: string) => CellValue,
): boolean {
  const r0 = rows[0];
  return r0 !== undefined && cellOf(r0, col.id).confidence !== undefined;
}

/* ------------------------------------------------------------------ floating filter */
function FloatingFilter<R>({
  gridId,
  col,
  filter,
  options,
  onChange,
  onOpenSet,
}: {
  gridId: string;
  col: ColumnDef<R>;
  filter: ColumnFilter | null;
  options: ReadonlyMap<string, number> | null;
  onChange: (f: ColumnFilter | null) => void;
  onOpenSet: (bounds: DOMRect) => void;
}) {
  const t = columnType(col.type);
  const id = filterInputId(gridId, col.id);

  /* A closed vocabulary filters by SET, and a set of one is a special case, not the contract:
     the control opens the column's checkbox list so several values can be admitted at once, and
     states how many are admitted when it is closed. A single-choice dropdown here silently
     forbids "Control OR Process", which is the first thing anyone asks a register. */
  if (t.filterKind === "set" && options) {
    const values = filter && filter.kind === "set" ? filter.values : [];
    const label = values.length === 0 ? "All" : values.length === 1 ? (values[0] ?? "All") : `${values.length} values`;
    return (
      <button
        id={id}
        className={`dg-ff dg-ff-set${values.length ? " on" : ""}`}
        onClick={(e) => onOpenSet(e.currentTarget.getBoundingClientRect())}
        aria-label={`Filter ${col.header} — ${values.length === 0 ? "every value" : values.join(", ")}`}
        data-hint={values.length > 1 ? values.join(" · ") : undefined}
      >
        <span className="dg-ff-label">{label}</span>
        <ChevronDown size={10} strokeWidth={2} aria-hidden />
      </button>
    );
  }

  const raw =
    filter === null ? "" : filter.kind === "text" ? filter.q : filter.kind === "number" || filter.kind === "date" ? filter.raw : "";

  return (
    <input
      id={id}
      className={`dg-ff${raw ? " on" : ""}`}
      value={raw}
      placeholder={t.filterKind === "number" ? ">0" : t.filterKind === "date" ? "2025-12" : "contains"}
      onChange={(e) => {
        const s = e.target.value;
        if (!s.trim()) return onChange(null);
        if (t.filterKind === "number") return onChange(parseNumberFilter(s) ?? { kind: "text", q: s });
        if (t.filterKind === "date") return onChange(parseDateFilter(s) ?? { kind: "text", q: s });
        return onChange({ kind: "text", q: s });
      }}
      aria-label={`Filter ${col.header}`}
    />
  );
}

/* ------------------------------------------------------------------ column menu */
function ColumnMenu<R>({
  col,
  x,
  y,
  view,
  options,
  onSort,
  onPin,
  onHide,
  onAutoSize,
  onResetWidths,
  onFilter,
  onClose,
}: {
  col: ColumnDef<R> | undefined;
  x: number;
  y: number;
  view: GridViewState;
  options: ReadonlyMap<string, number> | null;
  onSort: (dir: "asc" | "desc" | null, additive: boolean) => void;
  onPin: (p: Pin) => void;
  onHide: () => void;
  onAutoSize: () => void;
  onResetWidths: () => void;
  onFilter: (f: ColumnFilter | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  if (!col) return null;
  const current = view.filters[col.id] ?? null;
  const chosen = new Set(current && current.kind === "set" ? current.values : []);
  const entries = options ? [...options.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : [];
  const shown = entries.filter(([k]) => k.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="dg-scrim" onClick={onClose} role="presentation" />
      <div className="dg-menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 268)), top: y + 2 }} role="menu">
        <p className="dg-menu-title">{col.header}</p>
        <button className="dg-menu-i" onClick={() => onSort("asc", false)} role="menuitem">
          Sort ascending
        </button>
        <button className="dg-menu-i" onClick={() => onSort("desc", false)} role="menuitem">
          Sort descending
        </button>
        <button className="dg-menu-i" onClick={() => onSort("asc", true)} role="menuitem">
          Add as a further sort key
        </button>
        <button className="dg-menu-i" onClick={() => onSort(null, true)} role="menuitem">
          Clear this sort
        </button>
        <hr className="dg-menu-rule" />
        <button className="dg-menu-i" onClick={() => onPin("left")} role="menuitem">
          Pin left
        </button>
        <button className="dg-menu-i" onClick={() => onPin("right")} role="menuitem">
          Pin right
        </button>
        <button className="dg-menu-i" onClick={() => onPin(null)} role="menuitem">
          Unpin
        </button>
        <hr className="dg-menu-rule" />
        <button className="dg-menu-i" onClick={onAutoSize} role="menuitem">
          Fit the width to the longest value
        </button>
        <button className="dg-menu-i" onClick={onResetWidths} role="menuitem">
          Return every width to the layout
        </button>
        <button className="dg-menu-i" onClick={onHide} role="menuitem">
          Hide this column
        </button>
        {entries.length > 0 && (
          <>
            <hr className="dg-menu-rule" />
            <p className="dg-menu-sub">Set filter</p>
            {/* mini search is mandatory above 15 distinct values (§2.4) */}
            {entries.length > 15 && (
              <input className="dg-menu-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search values" />
            )}
            <div className="dg-menu-set">
              {shown.map(([k, n]) => (
                <label key={k} className="dg-menu-check">
                  <input
                    type="checkbox"
                    checked={chosen.has(k)}
                    onChange={() => {
                      const next = new Set(chosen);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      onFilter(next.size ? { kind: "set", values: [...next] } : null);
                    }}
                  />
                  <span className="dg-menu-checklabel">{k}</span>
                  <span className="dg-menu-checkn">{n}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ column panel */
function ColumnPanel<R>({
  columns,
  view,
  onToggle,
  onPin,
  onMove,
  onClose,
}: {
  columns: readonly ColumnDef<R>[];
  view: GridViewState;
  onToggle: (id: string) => void;
  onPin: (id: string, p: Pin) => void;
  onMove: (id: string, d: number) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = columns.filter((c) => c.header.toLowerCase().includes(q.toLowerCase()));
  return (
    <aside className="dg-panel" aria-label="Columns">
      <header className="dg-panel-head">
        <span className="dg-panel-title">Columns</span>
        <button className="dg-icon-btn" onClick={onClose} aria-label="Close the column panel">
          <X size={13} strokeWidth={2} />
        </button>
      </header>
      <input className="dg-panel-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search columns" />
      <ul className="dg-panel-list">
        {shown.map((c) => {
          const pin = c.id in view.pins ? (view.pins[c.id] ?? null) : (c.pin ?? null);
          return (
            <li key={c.id} className="dg-panel-row">
              <label className="dg-panel-check">
                <input type="checkbox" checked={!view.hidden.includes(c.id)} onChange={() => onToggle(c.id)} />
                <span className="dg-panel-name">{c.header}</span>
              </label>
              <span className="dg-panel-ctl">
                <button className="dg-mini" onClick={() => onMove(c.id, -1)} data-hint="Move left" aria-label={`Move ${c.header} left`}>
                  ↑
                </button>
                <button className="dg-mini" onClick={() => onMove(c.id, 1)} data-hint="Move right" aria-label={`Move ${c.header} right`}>
                  ↓
                </button>
                <select
                  className="dg-mini-sel"
                  value={pin ?? ""}
                  onChange={(e) => onPin(c.id, e.target.value === "" ? null : e.target.value === "left" ? "left" : "right")}
                  aria-label={`Pin ${c.header}`}
                >
                  <option value="">—</option>
                  <option value="left">L</option>
                  <option value="right">R</option>
                </select>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="dg-panel-foot">
        Pinned columns are capped at 40% of the grid width; a pin beyond the cap is dropped so the scrolling region
        can never disappear.
      </p>
    </aside>
  );
}

/* ------------------------------------------------------------------ key overlay */
function KeyHelp({ surfaceLabel, onClose }: { surfaceLabel: string; onClose: () => void }) {
  const zones: readonly KeyZone[] = ["body", "header", "clipboard", "surface"];
  return (
    <div className="dg-help-overlay" role="dialog" aria-label="Keyboard grammar" onClick={onClose}>
      <div className="dg-help-card" onClick={(e) => e.stopPropagation()}>
        <header className="dg-help-head">
          <span className="dg-help-title">Keyboard grammar</span>
          <button className="dg-icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="dg-help-cols">
          {zones.map((z) => (
            <section key={z} className="dg-help-sec">
              <h3 className="dg-help-sub">{zoneLabel(z, surfaceLabel)}</h3>
              <dl className="dg-help-list">
                {KEYMAP.filter((b) => b.zone === z).map((b) => (
                  <div className="dg-help-row" key={`${z}-${b.keys}`}>
                    <dt className="dg-help-keys">{b.keys}</dt>
                    <dd className="dg-help-does">{b.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="dg-help-foot">
          This overlay is rendered from the same keymap module the handler reads, so it cannot describe a binding the
          grid does not have.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ chips */
function FilterChip({ label, onDrop }: { label: string; onDrop: () => void }) {
  return (
    <span className="dg-chip">
      <span className="dg-chip-label">{label}</span>
      <button className="dg-chip-x" onClick={onDrop} aria-label={`Remove filter: ${label}`}>
        <X size={10} strokeWidth={2.4} />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ helpers */
function matches(f: ColumnFilter, v: CellValue): boolean {
  switch (f.kind) {
    case "text":
      return v.text.toLowerCase().includes(f.q.toLowerCase());
    case "set":
      return f.values.includes(v.key ?? v.text);
    case "number":
      return typeof v.sort === "number" && numberFilterMatches(f, v.sort);
    case "date":
      return typeof v.sort === "string" && dateFilterMatches(f, v.sort);
  }
}

function sortKeysEqual(a: readonly SortKey[], b: readonly SortKey[]): boolean {
  return a.length === b.length && a.every((k, i) => k.colId === b[i]?.colId && k.dir === b[i]?.dir);
}

function compare(a: number | string | null, b: number | string | null): number {
  /* absence always sorts to the foot of the order, in both directions of a single key: an
     unrecorded fact is not a small number and must not lead an ascending sort. */
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function treatmentOf(confidence: number): "solid" | "faded" | "hatched" {
  return confidence >= 0.75 ? "solid" : confidence >= 0.4 ? "faded" : "hatched";
}

function headerText<R>(c: ColumnDef<R>): string {
  return c.unit ? `${c.header} (${c.unit})` : c.header;
}

function cellClass<R>(base: string, r: Resolved<R>, align: "left" | "right", focused: boolean): string {
  return `${base} al-${align}${r.pin ? ` pin-${r.pin}` : ""}${r.lastLeft ? " pin-edge-l" : ""}${
    r.firstRight ? " pin-edge-r" : ""
  }${focused ? " is-focus" : ""}`;
}

/** The lead cell of a hierarchy row carries its own depth; the stylesheet multiplies the density
 * tier's single indent step by it, so indentation stays a SPACING fact and never becomes a second
 * type scale (§2.1 Law 3). */
function leadStyle<R>(r: Resolved<R>, depth: number): CSSProperties {
  return { ...pinStyle(r), "--dg-depth": String(depth) } as CSSProperties;
}

function pinStyle<R>(r: Resolved<R>): CSSProperties {
  const base: CSSProperties = { width: r.width, minWidth: r.width, maxWidth: r.width };
  if (r.pin === "left") return { ...base, left: r.offset };
  if (r.pin === "right") return { ...base, right: r.offset };
  return base;
}

interface Band {
  readonly label: string;
  readonly width: number;
  readonly pin: Pin;
  readonly offset: number;
  /** true ⇒ this segment carries the SAME group as the segment before it, cut only by the pin
   *  boundary. It draws the band but not the name — the name is stated once. */
  readonly continues?: boolean;
}

function bandsOf<R>(resolved: readonly Resolved<R>[]): readonly Band[] {
  const out: Band[] = [];
  for (const r of resolved) {
    const label = r.col.group ?? "";
    const prev = out[out.length - 1];
    if (prev && prev.label === label && prev.pin === r.pin) {
      out[out.length - 1] = { ...prev, width: prev.width + r.width };
    } else {
      /* A pinned region is positioned separately, so a group straddling the pin boundary HAS to
         become two cells — but it is still one group, and printing its name over both halves
         reads as two groups that happen to share a name (§2.2 forbids a pin that splits a group;
         where the layout forces it, the name is stated once, over the leading half). */
      const continues = prev !== undefined && prev.label === label && label !== "";
      out.push({
        label,
        width: r.width,
        pin: r.pin,
        offset: r.pin === "left" ? r.offset : r.pin === "right" ? r.offset : 0,
        continues,
      });
    }
  }
  return out;
}

function bandStyle(b: Band): CSSProperties {
  const base: CSSProperties = { width: b.width, minWidth: b.width, maxWidth: b.width };
  if (b.pin === "left") return { ...base, left: b.offset };
  if (b.pin === "right") return { ...base, right: b.offset };
  return base;
}

const INT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
function fmtInt(n: number): string {
  return INT.format(n);
}

function cellDomId(gridId: string, r: number, c: number): string {
  return `${gridId}-c-${r}-${c}`;
}
function headerCellId(gridId: string, colId: string): string {
  return `${gridId}-h-${colId}`;
}
function filterInputId(gridId: string, colId: string): string {
  return `${gridId}-f-${colId}`;
}
