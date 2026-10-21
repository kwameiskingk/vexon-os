// The spreadsheet-shaped team table — one row per setter — shared by the
// Metrics & Insights "Table" view and the Performance Review team month view
// (Nadia's Excel replacement). Column semantics are the SSOT rules:
// days worked = attendance-based, show rate = computeSitRatePct (uncapped),
// daily averages = safeRatio(total, daysWorked) (— when no attendance),
// Suppositions = booked÷sat and dials÷booked exactly as the review engine
// (useSetterReview) computes them — dials, not talk time, per the recorded
// ruling. Convos: manual_daily_metrics wins per day, Close connects fill
// uncovered days; rows with NO manual entry in the period carry a visible
// "Close" marker rather than silently passing connects off as convos.
// Notes: setter_period_notes, month-grain, with the prior month's note
// rendered read-only beneath (the "Notes from June PR" carry-forward).
//
// Visual language mirrors the board cards (boardPrimitives): the caller may
// pass a per-row BoardState + pre-formatted badge ("Critical · Sat") — rows
// then get the same left state-rail and pill as the cards. Callers without
// RAG context (the review team view) omit them and rows render plain. One
// shared component, no per-page style forks.
//
// dayMode (Metrics Daily tab): booked/sat are weekly-grain by ruling, so the
// values passed are the WEEK of the selected day (same as the cards' Wk
// wells) — headers say "Wk" and the Dials/MB ratio is suppressed rather than
// mixing a one-day dials window with a week booked window.

import { useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { computeSitRatePct, safeRatio } from "@/lib/metrics/setterMetrics";
import { useSetterPeriodNotes, priorMonthKey } from "@/hooks/useSetterPeriodNotes";
import { BOARD_STATE, type BoardState } from "@/components/rag/boardPrimitives";

export interface TeamMetricsRow {
  profileId: string;
  name: string;
  daysWorked: number;
  booked: number;
  sat: number;
  dials: number;
  talkSeconds: number;
  convos: number;
  convosVerified: boolean;
  /** Completed call reviews in the window (Marcus's 2 Sep reporting ask);
      omitted by feeders that don't count them — renders as a dash. */
  callReviews?: number;
  /** Board state for the row rail/pill (crit/watch/steady); omit for plain rows. */
  state?: BoardState;
  /** Pre-formatted badge text, e.g. "Critical · Sat"; null/omitted = no pill. */
  badge?: string | null;
  offToday?: boolean;
  /** Booked/sat came from a manual review adjustment for this month. */
  adjusted?: boolean;
}

const dash = "—";
const fmtRatio = (v: number | null): string => (v == null ? dash : v.toFixed(1));
const fmtPct = (v: number | null): string => (v == null ? dash : `${Math.round(v)}%`);
const fmtDays = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const headCls = "micro-label uppercase text-txt-muted whitespace-nowrap";

/** Tiny marker beside booked/sat when a manual review adjustment shaped them. */
function AdjustedMark() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label="Manually adjusted for this month"
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Manually adjusted on the Performance Review for this month
      </TooltipContent>
    </Tooltip>
  );
}

export function TeamMetricsTable({
  rows,
  monthKey,
  notesEditable = true,
  dayMode = false,
}: {
  rows: TeamMetricsRow[];
  /** yyyy-MM-01 — the month the Notes column reads and writes. */
  monthKey: string;
  notesEditable?: boolean;
  /** Daily tab: booked/sat carry the week of the selected day (cards' Wk wells). */
  dayMode?: boolean;
}) {
  const { current, priorNotes, saveNote } = useSetterPeriodNotes(
    rows.map((r) => r.profileId),
    monthKey,
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const priorLabel = format(new Date(`${priorMonthKey(monthKey)}T12:00:00`), "MMM");
  const wk = dayMode ? "Wk " : "";

  const noteValue = (profileId: string) =>
    drafts[profileId] !== undefined ? drafts[profileId] : current.get(profileId) ?? "";

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(headCls, "min-w-[170px] pl-4")}>Setter</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Days Worked</TableHead>
            <TableHead className={cn(headCls, "text-right")}>{wk}Booked</TableHead>
            <TableHead className={cn(headCls, "text-right")}>{wk}Sat</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Reviews</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Show Rate</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Dials</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Talk</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Convos</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Daily Dials</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Daily Talk</TableHead>
            <TableHead className={cn(headCls, "text-right")}>Daily Convos</TableHead>
            <TableHead className={cn(headCls, "text-right")}>
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">
                  {wk}MB / Sat
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">
                  Meetings booked needed per sat meeting (booked ÷ sat).
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className={cn(headCls, "text-right")}>
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">
                  Dials / MB
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  {dayMode
                    ? "Dials ÷ booked needs one window — switch to Weekly or Monthly (the Daily tab shows one day of dials but a week of bookings)."
                    : "Dials needed per meeting booked (dials ÷ booked)."}
                </TooltipContent>
              </Tooltip>
            </TableHead>
            <TableHead className={cn(headCls, "min-w-[220px]")}>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const talkMin = Math.round(r.talkSeconds / 60);
            const prior = priorNotes.get(r.profileId);
            const isDirty =
              drafts[r.profileId] !== undefined && drafts[r.profileId] !== (current.get(r.profileId) ?? "");
            const S = r.state ? BOARD_STATE[r.state] : null;
            return (
              <TableRow key={r.profileId} className={cn(r.offToday && "opacity-70")}>
                <TableCell className="relative py-2.5 pl-4">
                  {S && <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", S.rail)} />}
                  <span className="flex items-center gap-2">
                    <span className="truncate font-heading text-sm font-semibold text-txt-primary">{r.name}</span>
                    {S && r.badge && (
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,.5)]",
                          S.pillBg,
                          S.pillText,
                        )}
                      >
                        <span className={cn("h-1 w-1 rounded-full", S.dot)} />
                        {r.badge}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">{fmtDays(r.daysWorked)}</TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1">
                    {r.booked}
                    {r.adjusted && <AdjustedMark />}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1">
                    {r.sat}
                    {r.adjusted && <AdjustedMark />}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {r.callReviews == null ? dash : r.callReviews}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {fmtPct(computeSitRatePct(r.sat, r.booked))}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">{r.dials}</TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">{talkMin}m</TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    {r.convos}
                    {!r.convosVerified && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="secondary"
                            className="cursor-help rounded-full px-1.5 py-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                          >
                            Close
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] text-xs">
                          No manual conversations entry this period — showing Close connects instead.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {fmtRatio(safeRatio(r.dials, r.daysWorked))}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {safeRatio(talkMin, r.daysWorked) == null
                    ? dash
                    : `${fmtRatio(safeRatio(talkMin, r.daysWorked))}m`}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {fmtRatio(safeRatio(r.convos, r.daysWorked))}
                </TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">{fmtRatio(safeRatio(r.booked, r.sat))}</TableCell>
                <TableCell className="py-2.5 text-right tabular-nums">
                  {dayMode ? dash : fmtRatio(safeRatio(r.dials, r.booked))}
                </TableCell>
                <TableCell className="py-2.5">
                  <div className="space-y-1">
                    {notesEditable ? (
                      <div className="flex items-start gap-1.5">
                        <Textarea
                          value={noteValue(r.profileId)}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.profileId]: e.target.value }))}
                          placeholder="Add a note for this month…"
                          className="min-h-[36px] h-9 text-xs resize-y"
                        />
                        {isDirty && (
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={saveNote.isPending}
                            onClick={() =>
                              saveNote.mutate(
                                { profileId: r.profileId, note: drafts[r.profileId] ?? "" },
                                {
                                  onSuccess: () =>
                                    setDrafts((d) => {
                                      const next = { ...d };
                                      delete next[r.profileId];
                                      return next;
                                    }),
                                },
                              )
                            }
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs whitespace-pre-wrap">{current.get(r.profileId) || dash}</p>
                    )}
                    {prior && (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                        <span className="font-medium">{priorLabel}:</span> {prior}
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
