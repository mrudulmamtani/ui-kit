/*
 * App shell — the ONE persistent frame. NavRail + stage(TopBar + surface), with the command
 * palette overlaying. Surfaces render inside the frame and never unmount it; there is no
 * full-page takeover and no `window.location` navigation outside the hash router.
 *
 * Global shortcuts: ⌘K / Ctrl+K palette, ⌘\ toggle rail, `/` to search when not typing.
 *
 * Each surface should carry its OWN ErrorBoundary inside the router — that is where a render
 * fault should stop. The boundary here is the last resort: it only sees a throw from the frame
 * itself (rail, top bar, palette), and catching it costs the reader the whole frame.
 */
import { useEffect } from "react";
import { NavRail } from "./ui/NavRail";
import { TopBar } from "./ui/TopBar";
import { CommandPalette } from "./ui/CommandPalette";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Surface } from "./surfaces";
import { useShell } from "./app/store";

export default function App() {
  const { route, paletteOpen, setPalette, toggleRail } = useShell();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!paletteOpen);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleRail();
      } else if (e.key === "/" && !paletteOpen && !isTyping(e)) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPalette, toggleRail]);

  return (
    <ErrorBoundary
      surface="The application frame"
      resetKey={route}
      detail="The fault reached the frame itself, so it could not be contained to a surface. Retry remounts the frame; if it recurs, reload the application."
    >
      <div className="app">
        <NavRail status={{ tone: "ok", id: "local", hint: "Running against local scaffold data" }} />
        <div className="stage">
          <TopBar
            facts={[
              { label: "Workspace", value: "Scaffold", hint: "Replace with your own basis facts" },
              { label: "As at", value: "—", numeric: true, hint: "The date this reading is struck" },
            ]}
          />
          <Surface route={route} />
        </div>
        <CommandPalette />
      </div>
    </ErrorBoundary>
  );
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}
