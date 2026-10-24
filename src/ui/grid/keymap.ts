/*
 * The single source of the grid's keyboard grammar.
 *
 * The `?` overlay renders FROM this table, so the documentation cannot drift from the handler:
 * a binding that is not in this file is not in the overlay, and a binding removed here disappears
 * from both at once.
 */
export type KeyZone = "body" | "header" | "surface" | "clipboard";

export interface KeyBinding {
  readonly keys: string;
  readonly does: string;
  readonly zone: KeyZone;
}

export const KEYMAP: readonly KeyBinding[] = [
  { zone: "body", keys: "↑ ↓ ← →", does: "Move the focused cell" },
  { zone: "body", keys: "Ctrl ← / →", does: "First / last cell in the row" },
  { zone: "body", keys: "Home / End", does: "First / last cell in the row" },
  { zone: "body", keys: "Ctrl Home / End", does: "First / last cell of the grid" },
  { zone: "body", keys: "PgUp / PgDn", does: "One viewport of rows, less one" },
  { zone: "body", keys: "Shift + arrows", does: "Extend the range selection" },
  { zone: "body", keys: "Ctrl Shift + arrows", does: "Extend the range to the edge" },
  { zone: "body", keys: "Space", does: "Toggle row selection" },
  { zone: "body", keys: "Shift Space", does: "Select the focused row" },
  { zone: "body", keys: "Ctrl Space", does: "Select the focused column" },
  { zone: "body", keys: "Ctrl A", does: "Select every row in view" },
  { zone: "body", keys: "Enter", does: "Open a group row or a decomposition level, or open the focused entry" },
  { zone: "body", keys: "↑ at the first row", does: "Move focus into the header" },
  { zone: "body", keys: "a…z 0…9", does: "Type-ahead seek on the reference column" },
  { zone: "body", keys: "Tab", does: "Leave the grid — the grid is one tab stop" },

  { zone: "header", keys: "← →", does: "Move between column headers" },
  { zone: "header", keys: "Enter", does: "Sort — ascending, descending, none" },
  { zone: "header", keys: "Shift Enter", does: "Add the column as a further sort key" },
  { zone: "header", keys: "Alt ↓", does: "Open the column menu" },
  { zone: "header", keys: "Alt ← / →", does: "Resize the column by 16px" },
  { zone: "header", keys: "Shift ← / →", does: "Move the column" },
  { zone: "header", keys: "Ctrl Enter", does: "Focus this column's filter" },
  { zone: "header", keys: "↓ / Esc", does: "Return to the rows" },

  { zone: "clipboard", keys: "Ctrl C", does: "Copy the focused cell or range, tab-delimited" },
  { zone: "clipboard", keys: "Ctrl Shift C", does: "Copy with the column headers" },

  { zone: "surface", keys: "/", does: "Focus the quick filter" },
  { zone: "surface", keys: "[ ]", does: "Cycle saved views" },
  { zone: "surface", keys: "\\", does: "Open the column panel" },
  { zone: "surface", keys: "g", does: "Cycle the group-by lens" },
  { zone: "surface", keys: "d", does: "Cycle density" },
  { zone: "surface", keys: "i", does: "Inspect the focused row" },
  { zone: "surface", keys: "o", does: "Open the focused entry" },
  { zone: "surface", keys: "?", does: "This overlay" },
  { zone: "surface", keys: "Esc", does: "Close the overlay, menu or panel" },
];

/* Three of the four zones belong to the grid engine and read the same on every surface. The
 * fourth does not: `surface` collects the bindings that act on the screen AROUND the rows, so its
 * heading has to be the surface's own name. `zoneLabel()` is the accessor the overlay uses; the
 * record below is the engine's half of it. */
export const ZONE_LABEL: Readonly<Record<KeyZone, string>> = {
  body: "In the rows",
  header: "In the header",
  clipboard: "Clipboard",
  surface: "On this surface",
};

/** Heading for one zone of the `?` overlay. `surfaceLabel` is `DataGridProps.label`. */
export function zoneLabel(zone: KeyZone, surfaceLabel: string): string {
  return zone === "surface" ? surfaceLabel : ZONE_LABEL[zone];
}

/** Printable single characters that the type-ahead buffer will accept. */
export function isSeekChar(key: string): boolean {
  return key.length === 1 && /[A-Za-z0-9\-_]/.test(key);
}
