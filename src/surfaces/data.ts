/*
 * SCAFFOLD DATA — delete this file when you wire a real source.
 *
 * Deterministically generated, not hand-authored: a seeded LCG produces the same rows on every
 * run, so screenshots and the contrast audit are reproducible and no one is tempted to tune a
 * number to make a screen look better. The field names are deliberately generic.
 */

export interface Row {
  readonly ref: string;
  readonly name: string;
  readonly owner: string;
  readonly state: "open" | "blocked" | "closed";
  readonly score: number;
  readonly amount: number;
  readonly opened: string;
  /** 0–1. Drives the value-emphasis tier on derived figures. */
  readonly confidence: number;
}

/* A seeded linear congruential generator — same sequence every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const STATES = ["open", "blocked", "closed"] as const;
const OWNERS = ["Team A", "Team B", "Team C", "Team D"] as const;
const WORDS = [
  "Intake", "Transfer", "Review", "Settlement", "Dispatch", "Reconcile",
  "Approval", "Handover", "Inspection", "Clearance", "Adjustment", "Renewal",
] as const;

function build(n: number): readonly Row[] {
  const rnd = lcg(20260424);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const a = WORDS[Math.floor(rnd() * WORDS.length)]!;
    const b = WORDS[Math.floor(rnd() * WORDS.length)]!;
    const day = 1 + Math.floor(rnd() * 28);
    rows.push({
      ref: `R-${String(1000 + i)}`,
      name: a === b ? `${a} queue` : `${a} ${b.toLowerCase()}`,
      owner: OWNERS[Math.floor(rnd() * OWNERS.length)]!,
      state: STATES[Math.floor(rnd() * STATES.length)]!,
      score: Math.round(rnd() * 500) / 100,
      amount: Math.round(rnd() * 480000) / 100,
      opened: `2026-03-${String(day).padStart(2, "0")}`,
      confidence: Math.round(rnd() * 100) / 100,
    });
  }
  return rows;
}

export const ROWS: readonly Row[] = build(64);
