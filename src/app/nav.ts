/*
 * Navigation model — the information architecture of the application.
 *
 * REPLACE THE ROUTES BELOW with your product's own. Everything else in the kit reads this
 * file, so a route added here appears in the rail, the top bar's headline, the command
 * palette and the hash router at once; there is no second list to keep in step.
 *
 * Two rules worth keeping:
 *   - Each route is ONE canonical surface. A route that means two things needs two routes.
 *   - Avoid the vocabulary of fake importance in labels: Console, Hub, Center, Cockpit,
 *     Portal, Manager, Wizard. Name the thing the reader came for ("Orders", not
 *     "Order Management Console").
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Boxes,
  FileText,
  Search as SearchIcon,
  Settings,
  Table2,
} from "lucide-react";

export type RouteId = "overview" | "records" | "catalog" | "reports" | "settings";

/** Where an unrecognised hash and the masthead link both land. */
export const HOME: RouteId = "overview";

export interface NavItem {
  readonly id: RouteId;
  /** Sentence case. This becomes the top bar's serif headline. */
  readonly label: string;
  readonly icon: LucideIcon;
  /** One clause saying what the surface is FOR. It becomes the top bar's standfirst, so keep
   * it short enough not to ellipsise at your narrowest supported frame. */
  readonly hint: string;
  /** Rail grouping. Add or rename freely; `SECTION_LABEL` must cover every value used. */
  readonly section: "work" | "reference" | "admin";
}

/** Every route the router can render, in reading order. */
export const ROUTES: readonly NavItem[] = [
  { id: "overview", label: "Overview", icon: Activity, hint: "Where things stand right now", section: "work" },
  { id: "records", label: "Records", icon: Table2, hint: "The full population, filterable and exportable", section: "work" },
  { id: "catalog", label: "Catalog", icon: Boxes, hint: "Every item and what it is made of", section: "reference" },
  { id: "reports", label: "Reports", icon: FileText, hint: "Composed, citable output", section: "reference" },
  { id: "settings", label: "Settings", icon: Settings, hint: "Preferences for this workspace", section: "admin" },
] as const;

/** What the rail offers. Filter `ROUTES` here if some routes are deep-link-only. */
export const NAV: readonly NavItem[] = ROUTES;

export const SECTION_LABEL: Record<NavItem["section"], string> = {
  work: "Work",
  reference: "Reference",
  admin: "Admin",
};

export const SEARCH_ICON = SearchIcon;

/* Resolved against ROUTES, not NAV: a route withheld from the rail is still a route, so its
   deep link and the browser's back/forward keep working either way. */
export function routeFromHash(): RouteId {
  const h = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return ROUTES.find((n) => n.id === h)?.id ?? HOME;
}
