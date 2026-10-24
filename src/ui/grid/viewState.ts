/*
 * View state — persistence, addressability and export.
 *
 * Preferences are NOT source data, so keeping them in `localStorage` is not fabrication. What is
 * stored is column state, filters, sort, group, density and saved-view names; no record, row or
 * figure is ever written to or read back from storage.
 *
 * `version` ships with every stored record so a later shape change migrates instead of throwing,
 * and the partial-application distinction is honoured: a field left
 * `undefined` leaves the setting unchanged, an explicit `null` clears it.
 */
import type { ColumnFilter, Density, FilterModel, GridViewState, Pin, SortKey } from "./types";

const VERSION = 1 as const;

export function emptyView(density: Density = "standard"): GridViewState {
  return {
    version: VERSION,
    sort: [],
    filters: {},
    quick: "",
    hidden: [],
    order: [],
    pins: {},
    widths: {},
    density,
    groupBy: null,
  };
}

/* ------------------------------------------------------------------ parsing (defensive)
 * Everything below crosses a trust boundary — a URL someone pasted, or a storage record written
 * by an older build. Nothing is cast; every field is proven before it is used, and an unreadable
 * record degrades to the default view rather than taking the surface down. */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readStrings(v: unknown): readonly string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function readSort(v: unknown): readonly SortKey[] {
  if (!Array.isArray(v)) return [];
  const out: SortKey[] = [];
  for (const k of v) {
    if (!isRecord(k)) continue;
    const colId = k["colId"];
    const dir = k["dir"];
    if (typeof colId === "string" && (dir === "asc" || dir === "desc")) out.push({ colId, dir });
  }
  return out;
}

function readFilter(v: unknown): ColumnFilter | null {
  if (!isRecord(v)) return null;
  const kind = v["kind"];
  if (kind === "text" && typeof v["q"] === "string") return { kind, q: v["q"] };
  if (kind === "set") {
    const values = readStrings(v["values"]);
    return values.length ? { kind, values } : null;
  }
  if (kind === "number") {
    const op = v["op"];
    const a = v["a"];
    const b = v["b"];
    const raw = v["raw"];
    const ops = ["gt", "gte", "lt", "lte", "eq", "between"] as const;
    const okOp = ops.find((o) => o === op);
    if (okOp && typeof a === "number" && typeof raw === "string") {
      return { kind, op: okOp, a, b: typeof b === "number" ? b : null, raw };
    }
    return null;
  }
  if (kind === "date") {
    const raw = v["raw"];
    if (typeof raw !== "string") return null;
    const from = v["from"];
    const to = v["to"];
    return { kind, from: typeof from === "string" ? from : null, to: typeof to === "string" ? to : null, raw };
  }
  return null;
}

function readFilters(v: unknown): FilterModel {
  if (!isRecord(v)) return {};
  const out: Record<string, ColumnFilter> = {};
  for (const [k, raw] of Object.entries(v)) {
    const f = readFilter(raw);
    if (f) out[k] = f;
  }
  return out;
}

function readPins(v: unknown): Readonly<Record<string, Pin>> {
  if (!isRecord(v)) return {};
  const out: Record<string, Pin> = {};
  for (const [k, p] of Object.entries(v)) {
    if (p === "left" || p === "right" || p === null) out[k] = p;
  }
  return out;
}

function readWidths(v: unknown): Readonly<Record<string, number>> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, w] of Object.entries(v)) {
    if (typeof w === "number" && Number.isFinite(w) && w > 24) out[k] = Math.round(w);
  }
  return out;
}

function readDensity(v: unknown): Density {
  return v === "compact" || v === "relaxed" || v === "standard" ? v : "standard";
}

export function parseView(raw: unknown): GridViewState | null {
  if (!isRecord(raw)) return null;
  if (raw["version"] !== VERSION) return null; // future shapes migrate here rather than throw
  const groupBy = raw["groupBy"];
  const quick = raw["quick"];
  return {
    version: VERSION,
    sort: readSort(raw["sort"]),
    filters: readFilters(raw["filters"]),
    quick: typeof quick === "string" ? quick : "",
    hidden: readStrings(raw["hidden"]),
    order: readStrings(raw["order"]),
    pins: readPins(raw["pins"]),
    widths: readWidths(raw["widths"]),
    density: readDensity(raw["density"]),
    groupBy: typeof groupBy === "string" ? groupBy : null,
  };
}

/* ------------------------------------------------------------------ the address bar
 * Every filter, sort, group, density and column arrangement serialises into the route's own
 * hash segment, so a screen state is a link. The shell's router reads only the first segment,
 * so the payload is URI-encoded (its slashes escape) and rides in the second. */

export function encodeView(v: GridViewState): string {
  return encodeURIComponent(JSON.stringify(v));
}

export function decodeView(segment: string): GridViewState | null {
  try {
    return parseView(JSON.parse(decodeURIComponent(segment)));
  } catch {
    return null;
  }
}

export function viewFromHash(route: string): GridViewState | null {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] !== route) return null;
  const seg = parts[1];
  return seg ? decodeView(seg) : null;
}

/** Written with `replaceState`: the address stays truthful without filling the back button. */
export function writeHash(route: string, v: GridViewState, isDefault: boolean): void {
  const next = isDefault ? `#/${route}` : `#/${route}/${encodeView(v)}`;
  if (window.location.hash === next) return;
  window.history.replaceState(null, "", next);
}

export function deepLink(route: string, v: GridViewState): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#/${route}/${encodeView(v)}`;
}

/* ------------------------------------------------------------------ local persistence */

export interface SavedView {
  readonly name: string;
  readonly state: GridViewState;
}

function key(gridId: string): string {
  return `ui.grid.${gridId}.views`;
}
function densityKey(gridId: string): string {
  return `ui.grid.${gridId}.density`;
}

export function loadSavedViews(gridId: string): readonly SavedView[] {
  try {
    const raw = window.localStorage.getItem(key(gridId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedView[] = [];
    for (const item of parsed) {
      if (!isRecord(item)) continue;
      const name = item["name"];
      const state = parseView(item["state"]);
      if (typeof name === "string" && state) out.push({ name, state });
    }
    return out;
  } catch {
    return [];
  }
}

export function storeSavedViews(gridId: string, views: readonly SavedView[]): void {
  try {
    window.localStorage.setItem(key(gridId), JSON.stringify(views));
  } catch {
    /* storage denied — the session keeps working, the views simply do not outlive it */
  }
}

export function loadDensity(gridId: string): Density {
  try {
    return readDensity(window.localStorage.getItem(densityKey(gridId)));
  } catch {
    return "standard";
  }
}

export function storeDensity(gridId: string, d: Density): void {
  try {
    window.localStorage.setItem(densityKey(gridId), d);
  } catch {
    /* ignored — density falls back to the default next session */
  }
}

/* ------------------------------------------------------------------ clipboard + export */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Tab-delimited, never comma: a register value contains commas and Excel splits on them. */
export function toTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  /* A BOM so Excel opens UTF-8 correctly — the provenance block contains ‘·’ and ‘†’. */
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
