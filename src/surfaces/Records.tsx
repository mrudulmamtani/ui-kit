/*
 * SCAFFOLD SURFACE — the worked example of wiring `<DataGrid>`. See src/ui/grid/README.md.
 *
 * The grid is an ENGINE: it owns filtering, sorting, grouping, pinning, density, saved views,
 * keyboard grammar and CSV export. The surface owns only what the rows MEAN — the columns, how
 * each cell is extracted, and the calibration line. Everything the surface passes here is a
 * statement about the data; nothing is a statement about the table.
 */
import { useMemo, useState } from "react";
import { DataGrid } from "../ui/grid/DataGrid";
import type { ColumnDef } from "../ui/grid/types";
import { ROWS, type Row } from "./data";

export function Records() {
  const [activeId, setActiveId] = useState<string | null>(null);

  const columns = useMemo<readonly ColumnDef<Row>[]>(
    () => [
      {
        id: "ref",
        header: "Ref",
        type: "id-mono",
        width: 132, // wide enough to seat the pinned grand-total label
        pin: "left",
        value: (r) => ({ sort: r.ref, text: r.ref }),
      },
      {
        id: "name",
        header: "Name",
        type: "text",
        width: 240,
        pin: "left",
        value: (r) => ({ sort: r.name, text: r.name }),
      },
      {
        id: "owner",
        header: "Owner",
        type: "enum",
        width: 110,
        groupable: true,
        value: (r) => ({ sort: r.owner, text: r.owner }),
      },
      {
        id: "state",
        header: "State",
        type: "enum",
        width: 100,
        groupable: true,
        value: (r) => ({ sort: r.state, text: r.state }),
      },
      {
        id: "score",
        header: "Score",
        unit: "0–5",
        type: "score3",
        width: 96,
        hint: "A derived figure, so it carries an emphasis tier.",
        /* `confidence` present ⇒ the cell renders its emphasis tier. Omit it on a counted
           figure; a count is not more or less well-evidenced, it simply is. */
        value: (r) => ({ sort: r.score, text: r.score.toFixed(2), confidence: r.confidence }),
      },
      {
        id: "amount",
        header: "Amount",
        unit: "units",
        type: "money-acct",
        width: 130,
        value: (r) => ({ sort: r.amount, text: r.amount.toFixed(2) }),
      },
      {
        id: "opened",
        header: "Opened",
        type: "date",
        width: 110,
        value: (r) => ({ sort: r.opened, text: r.opened }),
      },
    ],
    [],
  );

  const meanConf = ROWS.reduce((a, r) => a + r.confidence, 0) / ROWS.length;

  /* `surface-fill` is required: the grid is `flex: 1` and owns its own scroll region, so its
     host must be a constrained flex column or the grid grows past the fold. */
  return (
    <div className="surface surface-fill">
      <DataGrid<Row>
        gridId="records"
        route="records"
        label="Records"
        noun="record population"
        rows={ROWS}
        columns={columns}
        rowId={(r) => r.ref}
        rowLabel={(r) => `${r.ref} — ${r.name}`}
        /* A 3px mark at the row's left edge, never a cell background fill. */
        rowBar={(r) =>
          r.state === "blocked"
            ? { tone: "danger", hint: "Blocked" }
            : r.state === "open"
              ? { tone: "warn", hint: "Open" }
              : null
        }
        seekColId="ref"
        defaultSort={[{ colId: "score", dir: "desc" }]}
        activeRowId={activeId}
        onActiveRow={(r) => setActiveId(r?.ref ?? null)}
        /* Derived, never a constant — it is what lets a reader tell "poorly evidenced HERE"
           from "the renderer is broken". */
        calibration={<>mean confidence {(meanConf * 100).toFixed(0)}% across {ROWS.length} records</>}
        provenance={[
          ["Source", "scaffold generator (seeded)"],
          ["Population", `${ROWS.length} records`],
        ]}
        asOf="2026-03-28"
        exportName="records"
        exportTitle="UI Kit — export provenance"
        emptyTitle="No record matches this filter."
        emptyBody={(clear) => (
          <>
            Every record was excluded by the current filter.{" "}
            <button className="btn btn-ghost btn-sm" onClick={clear}>
              Clear filters
            </button>
          </>
        )}
      />
    </div>
  );
}
