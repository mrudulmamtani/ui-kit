/*
 * App shell state: active route (hash-synced), rail collapse, command-palette open.
 *
 * This store is ONLY the shell. Surface-local state belongs in each surface — a shell store
 * that grows per-surface fields becomes the place every component reaches into, and then
 * nothing can be rendered in isolation.
 */
import { create } from "zustand";
import { ROUTES, routeFromHash, type RouteId } from "./nav";

interface ShellState {
  route: RouteId;
  railCollapsed: boolean;
  paletteOpen: boolean;
  setRoute: (r: RouteId) => void;
  toggleRail: () => void;
  setPalette: (open: boolean) => void;
}

export const useShell = create<ShellState>((set) => ({
  route: routeFromHash(),
  railCollapsed: false,
  paletteOpen: false,
  /* The hash IS the router. Writing it drives the listener below, so back/forward, a pasted
     deep link and an in-app click all take exactly the same path. */
  setRoute: (route) => {
    if (ROUTES.some((n) => n.id === route)) {
      window.location.hash = `#/${route}`;
      set({ route });
    }
  },
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setPalette: (paletteOpen) => set({ paletteOpen }),
}));

// keep the store in sync with browser back/forward
window.addEventListener("hashchange", () => {
  useShell.setState({ route: routeFromHash() });
});
