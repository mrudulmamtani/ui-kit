/*
 * Top context bar — where you are, and what the reading rests on.
 *
 * Two jobs, in this order. It names the surface (editorial serif headline + standfirst), and
 * it states the BASIS of everything below it: the handful of facts a reader needs in order to
 * trust the numbers on the page — which account, as at when, how complete. A surface may
 * restate the basis in its own register; the frame states it on every route, always.
 *
 * The basis is set as a RUNNING LINE, not as a stacked label/value plate. A surface that opens
 * with its own masthead would otherwise be shadowed by a smaller copy of itself 40px above —
 * same words, same caps, same figures, which reads as a rendering fault. One baseline,
 * sentence-case running labels, values in full ink: a caption to the frame, unmistakably not a
 * second masthead. Eyebrow caps belong to the PAGE.
 *
 * The whole bar is ONE baseline group: the serif route name, the standfirst and every value in
 * the basis line sit on a single invisible rule you could lay a straight edge along. The search
 * control sits outside that group because it is a control, and controls centre on the bar
 * rather than sitting on its type line.
 *
 * Facts are passed in rather than read from a store, so this component stays renderable in
 * isolation. Order them with the MOST DROPPABLE FIRST: narrow frames hide the leading fact, and
 * what should survive longest is the fact a reader is most likely to be wrong about.
 */
import { Command } from "lucide-react";
import type { ReactNode } from "react";
import { NAV, SEARCH_ICON } from "../app/nav";
import { useShell } from "../app/store";
import "./topbar.css";

export interface BasisFact {
  /** Sentence case, never caps. "Account", "Position as at", "Coverage". */
  readonly label: string;
  /** `undefined` holds the column's width with a pending rule, so the bar never reflows
   * under the reader's eye while data loads. */
  readonly value: ReactNode | undefined;
  readonly hint?: string;
  /** Tabular/date values get a slightly tighter slot. */
  readonly numeric?: boolean;
  /** A second, quieter figure riding beside the value — a median beside a mean, a total
   * beside a count. This is where you give the reader CALIBRATION. */
  readonly calibration?: ReactNode;
  readonly calibrationHint?: string;
}

export function TopBar({
  facts = [],
  searchLabel = "Search",
}: {
  facts?: readonly BasisFact[];
  searchLabel?: string;
}) {
  const { route, setPalette } = useShell();
  const item = NAV.find((n) => n.id === route);

  return (
    <header className="topbar">
      <div className="topbar-line">
        <div className="topbar-title">
          <h1>{item?.label}</h1>
          <span className="topbar-desc faint">{item?.hint}</span>
        </div>

        {facts.length > 0 && (
          <dl className="tb-basis" aria-label="Basis of preparation">
            {facts.map((f) => (
              <div className={`tb-fact${f.calibration ? " tb-fact-conf" : ""}`} key={f.label}>
                <dt>{f.label}</dt>
                <dd
                  className={f.numeric ? "tb-value tb-value-date" : "tb-value"}
                  data-hint={f.hint}
                >
                  {f.value === undefined ? (
                    <PendingRule />
                  ) : (
                    <>
                      {f.value}
                      {f.calibration && (
                        <span
                          className="tb-calibration"
                          data-hint-end
                          data-hint={f.calibrationHint}
                        >
                          {f.calibration}
                        </span>
                      )}
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <button className="omni" onClick={() => setPalette(true)} aria-label="Search and commands">
        <SEARCH_ICON size={15} className="omni-icon" />
        <span className="omni-label">{searchLabel}</span>
        <kbd className="omni-kbd">
          <Command size={11} />K
        </kbd>
      </button>
    </header>
  );
}

/** Holds a value's column width while it loads, so the bar never reflows under the eye. */
function PendingRule() {
  return <span className="tb-pending" aria-hidden />;
}
