import { useState } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Calendar as CalendarIcon, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { dateAtNoon, todayInLondon } from "@/hooks/useDepartmentHeadGoals";

export type CEOPeriodPreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export interface CEOPeriodValue {
  preset: CEOPeriodPreset;
  start: string;
  end: string;
}

const CEO_LIVE_DATA_START = new Date(2026, 6, 1);

/** "Now" for the presets: today's date in Europe/London (Marcus's clock), not
 * the browser zone. A viewer abroad after UK midnight still sees the office's
 * "Today". Anchored at local noon so day/week/month arithmetic dodges DST. */
export function londonNow(): Date {
  return dateAtNoon(todayInLondon());
}

export function resolvePreset(preset: Exclude<CEOPeriodPreset, "custom">, now = londonNow()): { start: Date; end: Date } {
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "this_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

const PRESETS: { key: Exclude<CEOPeriodPreset, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
];

function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return format(start, "d MMM yyyy");
  if (sameYear) return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

interface Props {
  value: CEOPeriodValue;
  onChange: (next: CEOPeriodValue) => void;
}

function parseStoredStart(s: string): Date {
  const day = (s || "").slice(0, 10);
  return new Date(`${day}T00:00:00`);
}

function parseStoredEnd(s: string): Date {
  const day = (s || "").slice(0, 10);
  return new Date(`${day}T23:59:59`);
}

export function CEODateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");
  // Non-custom presets re-resolve against London "now", exactly as
  // useCEOPeriod does for the data window. The stored start/end strings are
  // only authoritative for a custom range: a sessionStorage value saved
  // yesterday with preset "today" used to label today's numbers with
  // yesterday's date (Marcus: "the top-of-page date is not always right").
  const resolved = value.preset === "custom" ? null : resolvePreset(value.preset);
  const start = resolved ? resolved.start : parseStoredStart(value.start);
  const end = resolved ? resolved.end : parseStoredEnd(value.end);
  const label = formatRange(start, end);
  const [range, setRange] = useState<DateRange | undefined>(
    value.preset === "custom" ? { from: start, to: end } : undefined,
  );

  const toDayStr = (d: Date) => format(d, "yyyy-MM-dd");

  const choose = (preset: Exclude<CEOPeriodPreset, "custom">) => {
    const r = resolvePreset(preset);
    onChange({ preset, start: toDayStr(r.start), end: toDayStr(r.end) });
    setCustomOpen(false);
    setOpen(false);
  };

  const openChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setCustomOpen(value.preset === "custom");
      setRange(value.preset === "custom" ? { from: start, to: end } : undefined);
    }
  };

  const applyCustom = (r: DateRange | undefined, selectedDay?: Date) => {
    if (!r?.from) {
      setRange(undefined);
      return;
    }

    if (!range?.from || range.to) {
      setRange({ from: r.from, to: undefined });
      return;
    }

    const first = range.from;
    const second = selectedDay ?? r.to ?? r.from;
    const from = first <= second ? first : second;
    const to = first <= second ? second : first;
    setRange({ from, to });
    onChange({ preset: "custom", start: toDayStr(from), end: toDayStr(to) });
    setCustomOpen(false);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2.5 rounded-lg border border-border/70 bg-card pl-3 pr-3 py-1.5 text-[13px] font-medium hover:bg-muted/40 transition"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
            Period
          </span>
          <div className="h-4 w-px bg-border" />
          <span className="tabular-nums text-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0 w-auto" sideOffset={6}>
        <div className="flex">
          <div className="w-[180px] py-2 border-r border-border/60">
            {PRESETS.map((p) => {
              const active = value.preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => choose(p.key)}
                  className={cn(
                    "w-full flex items-center justify-between text-left px-3 py-1.5 text-[13px] hover:bg-muted/60 transition",
                    active && "text-foreground font-medium",
                  )}
                >
                  <span>{p.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setCustomOpen((v) => !v);
                setRange(undefined);
              }}
              className={cn(
                "w-full flex items-center justify-between text-left px-3 py-1.5 text-[13px] hover:bg-muted/60 transition",
                value.preset === "custom" && "text-foreground font-medium",
              )}
            >
              <span>Custom…</span>
              {value.preset === "custom" && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          </div>
          {customOpen && (
            <div className="p-2">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={range}
                onSelect={applyCustom}
                defaultMonth={start < CEO_LIVE_DATA_START ? CEO_LIVE_DATA_START : start}
                disabled={(date) => date < CEO_LIVE_DATA_START}
                className={cn("pointer-events-auto")}
              />
              <div className="px-2 pb-1 pt-1 text-[11px] text-muted-foreground">
                Pick a start and end date to apply a custom range.
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
