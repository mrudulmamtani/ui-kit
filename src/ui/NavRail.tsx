/*
 * Primary navigation rail — the index of the document.
 *
 * Grouped by IA section, keyboard reachable, and collapsible to icons. Two deliberate
 * decisions worth preserving if you rework it:
 *
 *  - Labels are ALWAYS rendered and collapsed by CSS (max-width + opacity), never unmounted.
 *    An unmounted label pops; an eased one reads as the rail folding shut.
 *  - The collapse control lives in the FOOT, not the head. In the head it had to be hidden at
 *    60px to fit beside the mark, which left the collapsed rail with no way back out except
 *    the keyboard shortcut — a trap.
 *
 * The foot carries a machine-readable status id — the string you would quote in a ticket —
 * and the state of the connection behind it. Anything a reader would say out loud belongs to
 * the top bar instead; chrome restating chrome is wasted space.
 */
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BRAND } from "../app/brand";
import { HOME, NAV, SECTION_LABEL, type NavItem } from "../app/nav";
import { useShell } from "../app/store";
import { LogoMark } from "./LogoMark";
import "./nav-rail.css";

export interface RailStatus {
  /** `ok` and `danger` light the dot; anything else stays neutral for a pending state. */
  readonly tone: "ok" | "danger" | "pending";
  /** Machine id, set in mono. Short — the collapsed rail hides it entirely. */
  readonly id: string;
  /** The full sentence, shown as an instant tooltip. */
  readonly hint: string;
}

const IDLE: RailStatus = { tone: "pending", id: "connecting…", hint: "Connecting to the data source" };

export function NavRail({ status = IDLE }: { status?: RailStatus }) {
  const { route, railCollapsed, setRoute, toggleRail } = useShell();

  const sections = Array.from(new Set(NAV.map((n) => n.section))) as NavItem["section"][];

  return (
    <nav className={railCollapsed ? "nav-rail collapsed" : "nav-rail"} aria-label="Primary">
      <div className="nav-head">
        <a
          className="wordmark"
          href={`#/${HOME}`}
          onClick={(e) => {
            e.preventDefault();
            setRoute(HOME);
          }}
        >
          <LogoMark size={24} />
          <span className="wordmark-text">
            {BRAND.name}
            <span className="wordmark-sub">{BRAND.sub}</span>
          </span>
        </a>
      </div>

      <div className="nav-scroll">
        {sections.map((section) => (
          <div className="nav-section" key={section}>
            <div className="nav-section-label eyebrow" aria-hidden={railCollapsed}>
              {SECTION_LABEL[section]}
            </div>
            {NAV.filter((n) => n.section === section).map((item) => {
              const Icon = item.icon;
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  className={active ? "nav-item active" : "nav-item"}
                  onClick={() => setRoute(item.id)}
                  data-hint={railCollapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="nav-item-marker" aria-hidden />
                  <Icon size={17} className="nav-item-icon" strokeWidth={active ? 2.1 : 1.8} />
                  <span className="nav-item-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="nav-foot">
        <div className={`nav-record rec-${status.tone}`} data-hint={status.hint}>
          <span className="record-dot" aria-hidden />
          <span className="record-id mono">{status.id}</span>
        </div>
        <button
          className="rail-toggle icon-btn"
          onClick={toggleRail}
          data-hint={railCollapsed ? "Expand navigation (⌘\\)" : "Collapse navigation (⌘\\)"}
          data-hint-end
          aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {railCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </nav>
  );
}
