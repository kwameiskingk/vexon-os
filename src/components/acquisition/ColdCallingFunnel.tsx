import { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, PhoneCall, PhoneIncoming, MessageSquare, Flame, Calendar, UserCheck, Handshake } from "lucide-react";

interface FunnelStep {
  label: string;
  icon: React.ElementType;
  benchMin: number;
  benchMax: number;
  industryMin: number;
  industryMax: number;
}

function calculateFunnelSteps(dials: number): FunnelStep[] {
  return [{
    label: "Dials", icon: PhoneCall,
    benchMin: dials, benchMax: dials,
    industryMin: Math.round(dials * 0.4), industryMax: Math.round(dials * 0.6)
  }, {
    label: "Connected Calls", icon: PhoneIncoming,
    benchMin: Math.round(dials * 0.20), benchMax: Math.round(dials * 0.30),
    industryMin: Math.round(dials * 0.06), industryMax: Math.round(dials * 0.12)
  }, {
    label: "Conversations (>30s)", icon: MessageSquare,
    benchMin: Math.round(dials * 0.10), benchMax: Math.round(dials * 0.15),
    industryMin: Math.round(dials * 0.02), industryMax: Math.round(dials * 0.06)
  }, {
    label: "Warm Leads", icon: Flame,
    benchMin: Math.round(dials * 0.03), benchMax: Math.round(dials * 0.05),
    industryMin: Math.round(dials * 0.01), industryMax: Math.round(dials * 0.02)
  }, {
    label: "Meetings Booked", icon: Calendar,
    benchMin: Math.round(dials * 0.005), benchMax: Math.round(dials * 0.01),
    industryMin: 0, industryMax: Math.round(dials * 0.0025)
  }, {
    label: "Meetings Attended", icon: UserCheck,
    benchMin: Math.round(dials * 0.0035), benchMax: Math.round(dials * 0.007),
    industryMin: Math.round(dials * 0.00125), industryMax: Math.round(dials * 0.00163)
  }, {
    label: "Deals Closed", icon: Handshake,
    benchMin: Math.round(dials * 0.0005), benchMax: Math.round(dials * 0.001),
    industryMin: Math.round(dials * 0.00006), industryMax: Math.round(dials * 0.00016)
  }];
}

export function ColdCallingFunnel() {
  const [isOpen, setIsOpen] = usePersistedState('cold-calling-funnel-open', true);
  const [dailyDials, setDailyDials] = useState(200);
  const [showComparison, setShowComparison] = useState(true);
  const funnelSteps = calculateFunnelSteps(dailyDials);

  const formatRange = (min: number, max: number) =>
    min === max ? min.toString() : `${min}–${max}`;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PhoneCall className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Cold-Calling Funnel Visual</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Benchmark your dial-to-close conversion rates against industry standards</p>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Controls — single row */}
            <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-secondary border border-border">
              <div className="flex items-center gap-2">
                <Label className="text-muted-foreground text-xs whitespace-nowrap">Daily Dials</Label>
                <Input
                  type="number"
                  value={dailyDials}
                  onChange={e => setDailyDials(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showComparison} onCheckedChange={setShowComparison} className="data-[state=checked]:bg-primary" />
                <Label className="text-muted-foreground text-xs cursor-pointer">Compare vs Industry</Label>
              </div>
              <div className="flex gap-4 ml-auto text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-primary/30 border border-primary" />
                  <span className="text-muted-foreground">Meridian</span>
                </div>
                {showComparison && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-muted border border-border" />
                    <span className="text-muted-foreground">Industry</span>
                  </div>
                )}
              </div>
            </div>

            {/* Funnel — compact bars */}
            <div className="space-y-3">
              {funnelSteps.map((step) => {
                const Icon = step.icon;
                const maxValue = dailyDials;
                const benchWidth = Math.max((step.benchMax / maxValue) * 100, 8);
                const industryWidth = Math.max((step.industryMax / maxValue) * 100, 5);

                return (
                  <div key={step.label} className="space-y-0.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-foreground">{step.label}</span>
                    </div>
                    <div className="ml-8 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-16 shrink-0">Meridian</span>
                        <div className="flex-1 flex items-center gap-1.5">
                          <div
                            className="h-5 rounded bg-gradient-to-r from-primary/80 to-primary/60 transition-all duration-300"
                            style={{ width: `${Math.min(benchWidth, 100)}%` }}
                          />
                          <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                            {formatRange(step.benchMin, step.benchMax)}
                          </span>
                        </div>
                      </div>
                      {showComparison && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground/70 w-16 shrink-0">Industry</span>
                          <div className="flex-1 flex items-center gap-1.5">
                            <div
                              className="h-5 rounded bg-gradient-to-r from-slate-400 to-slate-300 dark:from-slate-500 dark:to-slate-400 transition-all duration-300"
                              style={{ width: `${Math.min(industryWidth, 100)}%` }}
                            />
                            <span className="text-xs text-foreground whitespace-nowrap">
                              {formatRange(step.industryMin, step.industryMax)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary Stats — compact */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-border">
              <div className="text-center p-2.5 rounded-lg bg-secondary border border-border">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Meridian Connect</p>
                <p className="text-lg font-bold text-primary">20–30%</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-secondary border border-border">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Industry Connect</p>
                <p className="text-lg font-bold text-muted-foreground">6–12%</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-secondary border border-border">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Meridian Close</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">7–15%</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-secondary border border-border">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Industry Close</p>
                <p className="text-lg font-bold text-muted-foreground">5–10%</p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">Industry benchmarks sourced from Industry Standard research data</p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
