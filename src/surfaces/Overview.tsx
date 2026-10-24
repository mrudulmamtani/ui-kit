/*
 * SCAFFOLD SURFACE — delete once you have your own.
 *
 * It exists to demonstrate the register rather than to be useful: an editorial masthead, a KPI
 * row where every figure carries an emphasis tier, and panels structured by hairlines. Read it
 * as a worked example of DESIGN-CONTRACT.md §2, not as a layout to copy wholesale.
 *
 * Figures are arithmetic over the same deterministic scaffold rows the Records surface uses, so
 * nothing on this page is a number someone typed to make a screenshot look full.
 */
import { Chip, Metric, Panel } from "../ui/primitives";
import { ROWS } from "./data";

export function Overview() {
  const total = ROWS.length;
  const open = ROWS.filter((r) => r.state === "open").length;
  const blocked = ROWS.filter((r) => r.state === "blocked").length;
  const meanScore = ROWS.reduce((a, r) => a + r.score, 0) / total;
  const meanConf = ROWS.reduce((a, r) => a + r.confidence, 0) / total;
  const median = [...ROWS].map((r) => r.confidence).sort((a, b) => a - b)[Math.floor(total / 2)]!;

  return (
    <div className="surface">
      {/* The masthead is the one place the serif runs large. An eyebrow in caps, a serif
          headline, a standfirst in quiet ink — the opening of a page of a document. */}
      <header style={{ marginBottom: "var(--space-6)" }}>
        <div className="eyebrow">Scaffold workspace</div>
        <h1 className="display" style={{ fontSize: "var(--text-2xl)" }}>
          Where things stand
        </h1>
        <p className="faint" style={{ maxWidth: "62ch", marginTop: "var(--space-2)" }}>
          Every figure below is derived from the {total} scaffold records, and every one carries an
          emphasis tier. A reader should never meet a bare number whose basis is unstated.
        </p>
      </header>

      {/* KPI row. One primary figure per view — these three support it, they do not compete. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
        }}
      >
        <Panel eyebrow="Records in scope">
          <Metric value={total} size="xl" />
        </Panel>
        <Panel eyebrow="Open">
          <Metric value={open} size="xl" confidence={0.9} />
        </Panel>
        <Panel eyebrow="Blocked">
          <Metric value={blocked} size="xl" confidence={0.52} />
        </Panel>
        <Panel eyebrow="Mean score">
          <Metric value={meanScore.toFixed(2)} size="xl" confidence={meanConf} />
          {/* Calibration: what a reader needs in order to read the tier correctly. */}
          <div className="faint" style={{ fontSize: "var(--text-2xs)", marginTop: "var(--space-1)" }}>
            median confidence {(median * 100).toFixed(0)}%
          </div>
        </Panel>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
      >
        <Panel title="States" eyebrow="Distribution">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {(["open", "blocked", "closed"] as const).map((s) => {
                const n = ROWS.filter((r) => r.state === s).length;
                return (
                  <tr key={s} style={{ borderTop: "1px solid var(--line-faint)" }}>
                    <td style={{ padding: "var(--space-2) 0" }}>
                      <Chip tone={s === "blocked" ? "danger" : s === "open" ? "accent" : "neutral"} dot>
                        {s}
                      </Chip>
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "var(--space-2) 0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {n}
                    </td>
                    {/* Magnitude as deposited ink, not as a rainbow. One bar, one meaning. */}
                    <td style={{ padding: "var(--space-2) 0 var(--space-2) var(--space-4)", width: "45%" }}>
                      <div
                        style={{
                          height: 6,
                          width: `${(n / total) * 100}%`,
                          background: "var(--seq-3)",
                          borderRadius: "var(--radius-xs)",
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title="Reading this page" eyebrow="Note">
          <p className="faint">
            Figures render solid at ≥ 0.75 confidence, faded at ≥ 0.4, hatched below. The bands are
            a default — set your own in <span className="mono">ui/primitives.tsx</span> and state
            them in your design contract.
          </p>
        </Panel>
      </div>
    </div>
  );
}
