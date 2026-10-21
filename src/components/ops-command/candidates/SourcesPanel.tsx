// Where the call list comes from, per channel (11 Sep). Collapsed by
// default (the owner): a one-line summary with the channels as chips. Expanded,
// a proper table — one row per source with the count and how those people
// stand today (booked or beyond / to call / ruled out / no status yet) as
// numbers, plus a slim bar. Click a row (or a chip) to filter the list to
// that channel; click again to clear.
//
// Whole-table numbers on purpose (Elena's 1 Sep scoreboard rule): the
// search box and tabs never change these, so channels stay comparable.

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CvScreening } from "@/hooks/useCvScreenings";
import { explicitSourceOf, sourceLabel } from "@/lib/candidateSource";

interface SourceRow {
  source: string;
  total: number;
  toCall: number;
  booked: number;
  out: number;
  unset: number;
}

const BOOKED_OR_BEYOND = new Set(["booked", "interviewing", "hired"]);
const RULED_OUT = new Set(["not_suitable", "withdrawn"]);

export function summariseSources(rows: CvScreening[]): SourceRow[] {
  const by = new Map<string, SourceRow>();
  for (const c of rows) {
    const src = explicitSourceOf(c);
    if (!src) continue;
    const row = by.get(src) ?? { source: src, total: 0, toCall: 0, booked: 0, out: 0, unset: 0 };
    row.total += 1;
    const s = c.review_status;
    if (!s) row.unset += 1;
    else if (s === "to_call" || s === "called") row.toCall += 1;
    else if (BOOKED_OR_BEYOND.has(s)) row.booked += 1;
    else if (RULED_OUT.has(s)) row.out += 1;
    else row.unset += 1;
    by.set(src, row);
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

const SEGMENTS = [
  { key: "booked", label: "Booked or beyond", cls: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  { key: "toCall", label: "To call", cls: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  { key: "out", label: "Ruled out", cls: "bg-red-400", text: "text-red-700 dark:text-red-300" },
  { key: "unset", label: "No status yet", cls: "bg-muted-foreground/30", text: "text-muted-foreground" },
] as const;

export function SourcesPanel({ rows, active, onSelect }: {
  rows: CvScreening[];
  /** The source currently filtering the list, or null. */
  active: string | null;
  onSelect: (source: string | null) => void;
}) {
  const stats = useMemo(() => summariseSources(rows), [rows]);
  const [open, setOpen] = useState(false);
  if (stats.length === 0) return null;
  const grand = stats.reduce((n, s) => n + s.total, 0);

  return (
    <section className="rounded-xl border border-border bg-card">
      {/* Collapsed header: the summary and the channels as chips. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span className="text-sm font-semibold">Sources</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {grand.toLocaleString()} people · {stats.length} channel{stats.length === 1 ? "" : "s"}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-2">
          {stats.map((s) => {
            const isActive = active === s.source;
            return (
              <button
                key={s.source}
                type="button"
                onClick={() => onSelect(isActive ? null : s.source)}
                aria-pressed={isActive}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted/60",
                )}
              >
                {sourceLabel(s.source)}
                <span className={cn("tabular-nums", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>{s.total.toLocaleString()}</span>
                {isActive && <X className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-4 py-2 text-left font-semibold">Source</th>
                <th className="px-3 py-2 text-right font-semibold">People</th>
                {SEGMENTS.map((seg) => (
                  <th key={seg.key} className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap", seg.text)}>{seg.label}</th>
                ))}
                <th className="px-4 py-2 text-left font-semibold w-[28%]">Mix</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const isActive = active === s.source;
                return (
                  <tr
                    key={s.source}
                    onClick={() => onSelect(isActive ? null : s.source)}
                    className={cn("cursor-pointer border-t border-border/60 transition-colors", isActive ? "bg-primary/[0.06]" : "hover:bg-muted/40")}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      <span className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-primary" : "bg-muted-foreground/40")} />
                        {sourceLabel(s.source)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s.total.toLocaleString()}</td>
                    {SEGMENTS.map((seg) => (
                      <td key={seg.key} className={cn("px-3 py-2.5 text-right tabular-nums", s[seg.key] ? seg.text : "text-muted-foreground/40")}>
                        {s[seg.key] ? s[seg.key].toLocaleString() : "·"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5">
                      <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        {SEGMENTS.map((seg) => {
                          const v = s[seg.key];
                          if (!v) return null;
                          return <span key={seg.key} className={seg.cls} style={{ width: `${(v / s.total) * 100}%` }} title={`${seg.label}: ${v}`} />;
                        })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {active && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Showing {sourceLabel(active)} only. Click the row or chip again to show every source.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
