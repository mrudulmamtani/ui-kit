/*
 * Command palette — the keyboard-first way into everything the product addresses.
 *
 * Every row is a URL some surface already publishes, so nothing here is a verb for a feature
 * that does not exist. Routes are contributed automatically from `app/nav.ts`; anything else
 * comes from the `source` you pass, which is where your records, documents or entities enter.
 *
 * Results are GROUPED and the groups are ordered by their own best match, so typing "reports"
 * puts the route first and typing a record's name puts the record first — the reader never
 * scans past a heading to reach the obvious answer. Ranking is exact > prefix > word-start >
 * substring. WITHIN a group that is tie-broken by the item's own `weight`, because among equal
 * textual matches the heavier item is the one meant; ACROSS groups it deliberately is not —
 * weight is not a claim about what the reader typed, and letting it count silently lifted a
 * heavy record above an exactly-as-good route every time.
 *
 * The run of characters that matched is marked in each name. It answers the one question a
 * ranked list cannot: WHY is this row here — which matters most where the match is not at the
 * front ("Settlement Delay" under a query of "delay").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NAV } from "../app/nav";
import { useShell } from "../app/store";
import "./command-palette.css";

export interface CommandItem {
  readonly id: string;
  /** Heading this row files under. Rows sharing a group render under one heading. */
  readonly group: string;
  readonly label: string;
  /** Quiet secondary line — a type, an owner, a date. */
  readonly meta?: string;
  /** Right-aligned figure. Wrap it in `<Metric>` if it is derived. */
  readonly figure?: ReactNode;
  /** Where Enter goes. Must be a hash route the app already renders. */
  readonly hash: string;
  /** A group's rows should share an icon so the list is scannable by shape. */
  readonly icon?: LucideIcon;
  /** Tie-break WITHIN a group only. */
  readonly weight?: number;
}

/** Called each time the palette opens. Return your searchable corpus. */
export type CommandSource = () => readonly CommandItem[] | Promise<readonly CommandItem[]>;

interface Scored extends CommandItem {
  readonly key: string;
  /** Within-group ordering: text match plus weight. */
  readonly score: number;
  /** Across-group ordering: the text match alone. */
  readonly text: number;
}

interface Group {
  readonly id: string;
  readonly heading: string;
  readonly items: readonly Scored[];
  /** How many candidates matched in total, so a truncated group can say so. */
  readonly matched: number;
}

export function CommandPalette({
  source,
  placeholder = "Search records and pages",
  limitPerGroup = 6,
}: {
  source?: CommandSource;
  placeholder?: string;
  limitPerGroup?: number;
}) {
  const { paletteOpen, setPalette, route } = useShell();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [corpus, setCorpus] = useState<readonly CommandItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    setQ("");
    setSel(0);
    if (source) Promise.resolve(source()).then(setCorpus).catch(() => setCorpus([]));
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [paletteOpen, source]);

  /* Routes are contributed here rather than asked of the caller — the palette and the rail must
     never disagree about what pages exist. */
  const routeItems = useMemo<readonly CommandItem[]>(
    () =>
      NAV.map((n) => ({
        id: `route:${n.id}`,
        group: "Pages",
        label: n.label,
        meta: n.hint,
        hash: `#/${n.id}`,
        icon: n.icon,
      })),
    [],
  );

  const groups = useMemo(
    () => buildGroups(q, [...routeItems, ...corpus], limitPerGroup, route),
    [q, routeItems, corpus, limitPerGroup, route],
  );

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    if (sel >= flat.length) setSel(0);
  }, [flat.length, sel]);
  useEffect(() => {
    if (!paletteOpen) return;
    const active = listRef.current?.querySelector('[data-active="true"]');
    if (active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
  }, [sel, paletteOpen, flat.length]);

  const run = useCallback(
    (item: Scored | undefined) => {
      if (!item) return;
      /* The hash IS the router: setting it drives the shell's own listener, which switches the
         route. No window.location navigation happens. */
      window.location.hash = item.hash;
      setPalette(false);
    },
    [setPalette],
  );

  if (!paletteOpen) return null;

  const total = `${routeItems.length + corpus.length} addressable`;

  return (
    <div className="palette-scrim" onMouseDown={() => setPalette(false)}>
      <div
        className="palette"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette-field">
          <Search size={16} className="palette-field-icon" aria-hidden />
          <input
            ref={inputRef}
            className="palette-input"
            value={q}
            placeholder={placeholder}
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={flat[sel] ? `pal-${flat[sel].key}` : undefined}
            aria-autocomplete="list"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              /* Tab moves the selection rather than escaping to the page behind the scrim. In a
                 modal with one field and a result list there is nowhere else for focus to go, and
                 a Tab that silently lands on the rail underneath loses the reader the dialog. */
              if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                setSel((s) => (flat.length ? (s + 1) % flat.length : 0));
              } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
                e.preventDefault();
                setSel((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0));
              } else if (e.key === "Home") {
                e.preventDefault();
                setSel(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setSel(Math.max(0, flat.length - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(flat[sel]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setPalette(false);
              }
            }}
          />
        </div>

        <div
          className="palette-results"
          id="palette-results"
          role="listbox"
          ref={listRef}
          aria-label="Results"
        >
          {groups.map((g) => (
            <section
              className="palette-group"
              key={g.id}
              role="group"
              aria-labelledby={`pal-head-${g.id}`}
            >
              <header className="palette-group-head" id={`pal-head-${g.id}`}>
                <span className="eyebrow">{g.heading}</span>
                {g.matched > g.items.length && (
                  <span className="palette-group-count mono">
                    {g.items.length} of {g.matched}
                  </span>
                )}
              </header>
              {g.items.map((item) => {
                const i = flat.indexOf(item);
                const Icon = item.icon ?? Search;
                return (
                  <button
                    key={item.key}
                    id={`pal-${item.key}`}
                    role="option"
                    aria-selected={i === sel}
                    data-active={i === sel}
                    className={i === sel ? "palette-row sel" : "palette-row"}
                    onMouseMove={() => setSel(i)}
                    onClick={() => run(item)}
                  >
                    <Icon size={15} strokeWidth={1.8} className="palette-row-icon" aria-hidden />
                    <span className="palette-label">
                      <Hit text={item.label} q={q.trim().toLowerCase()} />
                    </span>
                    <span className="palette-meta">{item.meta}</span>
                    <span className="palette-figure">{item.figure}</span>
                    <span className="palette-enter" aria-hidden>
                      <CornerDownLeft size={13} />
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
          {flat.length === 0 && (
            <p className="palette-empty">
              Nothing matches <span className="mono">{q}</span>.
            </p>
          )}
        </div>

        <footer className="palette-foot">
          <span className="palette-keys">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>Move</span>
            <kbd>↵</kbd>
            <span>Open</span>
            <kbd>esc</kbd>
            <span>Close</span>
          </span>
          <span className="palette-corpus mono">{q.trim() ? `${flat.length} shown` : total}</span>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ ranking */

/** exact > prefix > word-start > substring. -1 means "not a match at all". */
function textScore(label: string, q: string): number {
  if (!q) return 0;
  const s = label.toLowerCase();
  if (s === q) return 1000;
  if (s.startsWith(q)) return 800;
  if (new RegExp(`\\b${escapeRe(q)}`).test(s)) return 600;
  if (s.includes(q)) return 400;
  return -1;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildGroups(
  raw: string,
  all: readonly CommandItem[],
  limit: number,
  currentRoute: string,
): readonly Group[] {
  const q = raw.trim().toLowerCase();
  const byGroup = new Map<string, Scored[]>();

  for (const it of all) {
    /* The page you are already on is not a destination. Offering it is a dead row that pushes a
       live one below the fold. */
    if (it.hash === `#/${currentRoute}`) continue;
    const text = textScore(it.label, q);
    if (text < 0) continue;
    const scored: Scored = {
      ...it,
      key: it.id.replace(/[^\w-]/g, "_"),
      text,
      score: text + (it.weight ?? 0),
    };
    const bucket = byGroup.get(it.group);
    if (bucket) bucket.push(scored);
    else byGroup.set(it.group, [scored]);
  }

  const groups: Group[] = [];
  for (const [heading, items] of byGroup) {
    items.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    groups.push({
      id: heading.replace(/[^\w-]/g, "_").toLowerCase(),
      heading,
      items: items.slice(0, limit),
      matched: items.length,
    });
  }

  /* Groups compete on how well they matched what was typed, nothing else. */
  groups.sort(
    (a, b) =>
      (b.items[0]?.text ?? -1) - (a.items[0]?.text ?? -1) || a.heading.localeCompare(b.heading),
  );
  return groups;
}

/* ------------------------------------------------------------------ match marking
 * Marked in the frame's own selection blue at wash strength, so no new colour enters the page. */
function Hit({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="palette-hit">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
