/*
 * Router — one canonical surface per route, each behind its own error boundary so a render
 * fault stops at the surface rather than taking the frame with it.
 *
 * SCAFFOLD. Replace these surfaces with your product's. The two that are built out (Overview,
 * Records) exist to prove the kit renders and to show the house style; delete them once you
 * have your own.
 */
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { SurfaceEmpty } from "../ui/SurfaceState";
import type { RouteId } from "../app/nav";
import { NAV } from "../app/nav";
import { Overview } from "./Overview";
import { Records } from "./Records";

export function Surface({ route }: { route: RouteId }) {
  const label = NAV.find((n) => n.id === route)?.label ?? route;
  return (
    <ErrorBoundary surface={label} resetKey={route}>
      {render(route)}
    </ErrorBoundary>
  );
}

function render(route: RouteId) {
  switch (route) {
    case "overview":
      return <Overview />;
    case "records":
      return <Records />;
    default:
      return (
        <SurfaceEmpty title="Nothing here yet.">
          This route is declared in <span className="mono">src/app/nav.ts</span> but has no
          surface. Add one in <span className="mono">src/surfaces/</span> and wire it above.
        </SurfaceEmpty>
      );
  }
}
