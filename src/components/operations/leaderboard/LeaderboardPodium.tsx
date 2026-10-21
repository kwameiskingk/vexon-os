import { Trophy, Medal, Award, Crown } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PodiumEntry {
  name: string;
  email?: string;
  avatar_url?: string | null;
  meetings_booked?: number;
  total_closes?: number;
  contract_value?: number;
  department?: string;
  rank: number;
  primaryValue?: number | string;
  primaryLabel?: string;
}

interface LeaderboardPodiumProps {
  entries: PodiumEntry[];
  metricKey?: "meetings_booked" | "total_closes" | "contract_value" | "primaryValue";
  metricLabel?: string;
  currentUserEmail?: string | null;
  achievementCount?: number;
}

export function LeaderboardPodium({
  entries,
  metricKey = "meetings_booked",
  metricLabel = "Meetings",
  currentUserEmail,
  achievementCount,
}: LeaderboardPodiumProps) {
  const top3 = entries.slice(0, 3);
  const first = top3[0];
  const second = top3[1];
  const third = top3[2];

  const getMetricValue = (entry: PodiumEntry) => {
    if (metricKey === "primaryValue") return entry.primaryValue ?? 0;
    if (metricKey === "total_closes") return entry.total_closes ?? 0;
    if (metricKey === "contract_value") return entry.contract_value ?? 0;
    return entry.meetings_booked ?? 0;
  };

  const formatValue = (val: number | string) => {
    if (typeof val === "string") return val;
    if (metricKey === "contract_value") {
      return val >= 1000 ? `£${(val / 1000).toFixed(1)}k` : `£${val}`;
    }
    return val.toString();
  };

  const getPlaceStyles = (place: 1 | 2 | 3) => {
    const medals = {
      1: { color: "#F4C430", glow: "rgba(244,196,48,0.25)", bgAlpha: "0.06", borderTop: "#F4C430" },
      2: { color: "#C0C0C0", glow: "rgba(192,192,192,0.15)", bgAlpha: "0.04", borderTop: "#C0C0C0" },
      3: { color: "#CD7F32", glow: "rgba(205,127,50,0.15)", bgAlpha: "0.04", borderTop: "#CD7F32" },
    };
    const m = medals[place];

    return {
      metal: m.color,
      stageBackground: `rgba(${place === 1 ? '244,196,48' : place === 2 ? '192,192,192' : '205,127,50'},${m.bgAlpha})`,
      stageBorder: `${m.borderTop}40`,
      stageGlow: `0 0 16px ${m.glow}`,
      stageBorderTop: `2px solid ${m.borderTop}`,
    };
  };

  const slots: Array<{
    entry: PodiumEntry | undefined;
    place: 1 | 2 | 3;
    icon: typeof Crown;
    heightClass: string;
    emphasisClass?: string;
  }> = [
    { entry: second, place: 2, icon: Medal, heightClass: "h-20 sm:h-24" },
    { entry: first, place: 1, icon: Crown, heightClass: "h-28 sm:h-32", emphasisClass: "sm:-translate-y-2" },
    { entry: third, place: 3, icon: Award, heightClass: "h-16 sm:h-20" },
  ];

  if (!first) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Trophy className="mr-3 h-10 w-10 opacity-30" />
        <span>No data yet for this period</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border shadow-sm">
        {/* Podium background — radial stage lighting */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 120%, rgba(88,75,182,0.2) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, hsl(var(--card)) 0%, transparent 40%)",
          }}
        />
        {/* Decorative concentric arcs */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">
          <circle cx="200" cy="320" r="120" fill="none" stroke="currentColor" strokeWidth="0.5"/>
          <circle cx="200" cy="320" r="180" fill="none" stroke="currentColor" strokeWidth="0.5"/>
          <circle cx="200" cy="320" r="240" fill="none" stroke="currentColor" strokeWidth="0.5"/>
          <circle cx="200" cy="320" r="300" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        </svg>

        <div className="relative z-10 px-4 pb-5 pt-6 sm:px-6 sm:pt-8">
          <div className="grid min-h-[320px] grid-cols-3 items-end gap-3 sm:min-h-[350px] sm:gap-6">
            {slots.map(({ entry, place, icon: Icon, heightClass, emphasisClass }) => {
              const styles = getPlaceStyles(place);

              if (!entry) {
                return (
                  <div key={`empty-${place}`} className="flex h-full flex-col items-center justify-end">
                    <div
                      className={cn("relative w-full rounded-t-xl border border-b-0 bg-muted/20", heightClass)}
                    >
                      <span className="absolute inset-0 flex items-center justify-center font-heading text-3xl font-bold text-foreground/20">
                        {place}
                      </span>
                    </div>
                  </div>
                );
              }

              const value = getMetricValue(entry);
              const isCurrentUser =
                !!currentUserEmail && entry.email?.toLowerCase() === currentUserEmail.toLowerCase();

              return (
                <div
                  key={entry.email || `${entry.name}-${place}`}
                  className={cn("flex h-full flex-col items-center justify-end", emphasisClass)}
                >
                  <Icon className="mb-2 h-6 w-6 sm:h-7 sm:w-7" style={{ color: styles.metal }} />

                    <div
                      className={cn(
                        "mb-2 rounded-full p-0.5",
                        place === 1 && "champion-glow-ring"
                      )}
                      style={{
                        border: `3px solid ${styles.metal}`,
                        boxShadow: place === 1 ? `0 0 16px ${styles.metal}40` : undefined,
                      }}
                    >
                    <UserAvatar
                      name={entry.name}
                      avatarUrl={entry.avatar_url}
                      size={place === 1 ? "xl" : "lg"}
                      className="ring-0"
                    />
                  </div>

                  {isCurrentUser && (
                    <Badge className="mb-2 bg-primary text-primary-foreground">
                      You
                    </Badge>
                  )}

                  <p
                    className={cn(
                      "w-full truncate text-center font-heading text-sm font-semibold text-foreground sm:text-base",
                      place === 1 && "text-base sm:text-lg"
                    )}
                  >
                    {entry.name}
                  </p>

                  <p className="mt-0.5 font-heading text-xl font-bold sm:text-2xl" style={{ color: styles.metal }}>
                    {formatValue(value)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{metricLabel}</p>

                  <div
                    className={cn("relative mt-3 w-full rounded-t-xl", heightClass)}
                    style={{
                      background: styles.stageBackground,
                      borderTop: styles.stageBorderTop,
                      borderLeft: `1px solid ${styles.stageBorder}`,
                      borderRight: `1px solid ${styles.stageBorder}`,
                      boxShadow: styles.stageGlow,
                    }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center font-heading text-3xl font-bold text-foreground/20">
                      {place}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {achievementCount !== undefined && achievementCount > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-xl border-l-[3px] border-l-primary border border-primary/15 px-4 py-3 text-sm"
          style={{ background: 'linear-gradient(135deg, rgba(88,75,182,0.12), rgba(88,75,182,0.04))' }}
        >
          <span className="text-lg">🏅</span>
          <span className="text-muted-foreground">
            You earned <span className="font-semibold text-foreground">{achievementCount}</span> achievement
            {achievementCount !== 1 ? "s" : ""} this month
          </span>
        </div>
      )}
    </div>
  );
}
