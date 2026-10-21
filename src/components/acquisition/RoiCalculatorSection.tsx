import { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  Calculator,
  Users,
  PoundSterling,
  TrendingUp,
  Percent,
  RotateCcw,
} from "lucide-react";

interface RoiInputs {
  meetings: number;
  closingRate: number;
  worstCaseValue: number;
  costPerMeeting: number;
  profitMargin: number;
}

type TimeHorizon = 1 | 2 | 3 | 12;

const defaultInputs: RoiInputs = {
  meetings: 10,
  closingRate: 40,
  worstCaseValue: 5000,
  costPerMeeting: 250,
  profitMargin: 50,
};

function calculateOutputs(inputs: RoiInputs, months: number) {
  const cr = inputs.closingRate / 100;
  const pm = inputs.profitMargin / 100;
  const monthlyCost = inputs.meetings * inputs.costPerMeeting;
  const totalCost = monthlyCost * months;

  const clientsClosed = inputs.meetings * cr * months;
  const revenue = inputs.meetings * cr * inputs.worstCaseValue * months;
  const profit = revenue * pm;
  const roiPounds = profit - totalCost;
  const roiPercent = totalCost > 0 ? (roiPounds / totalCost) * 100 : 0;
  const revenueVsCostPercent = totalCost > 0 ? (revenue / totalCost) * 100 : 0;

  return { clientsClosed, revenue, profit, roiPounds, roiPercent, revenueVsCostPercent };
}

export function RoiCalculatorSection() {
  const [isOpen, setIsOpen] = usePersistedState('roi-calculator-open', true);
  const [inputs, setInputs] = useState<RoiInputs>(defaultInputs);
  const [selectedHorizon, setSelectedHorizon] = useState<TimeHorizon>(3);

  const outputs = calculateOutputs(inputs, selectedHorizon);
  const allHorizons = {
    1: calculateOutputs(inputs, 1),
    2: calculateOutputs(inputs, 2),
    3: calculateOutputs(inputs, 3),
    12: calculateOutputs(inputs, 12),
  };

  const updateInput = (key: keyof RoiInputs, value: string) => {
    const numValue = parseFloat(value) || 0;
    setInputs((prev) => ({ ...prev, [key]: Math.max(0, numValue) }));
  };

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const fmtNum = (value: number, d = 1) =>
    new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(value);

  const fmtPct = (value: number) => `${fmtNum(value, 1)}%`;

  const horizons: TimeHorizon[] = [1, 2, 3, 12];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calculator className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">ROI Calculator</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Calculate projected returns across different time horizons</p>
                </div>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Inputs — single compact row */}
            <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl bg-secondary border border-border">
              <CompactInput label="Meetings/mo" value={inputs.meetings} onChange={v => updateInput('meetings', v)} />
              <CompactInput label="Close %" value={inputs.closingRate} onChange={v => updateInput('closingRate', v)} suffix="%" />
              <CompactInput label={"Placement Fee\n(Lowest)"} value={inputs.worstCaseValue} onChange={v => updateInput('worstCaseValue', v)} prefix="£" />
              <CompactInput label="Cost/Meeting" value={inputs.costPerMeeting} onChange={v => updateInput('costPerMeeting', v)} prefix="£" />
              <CompactInput label="Margin %" value={inputs.profitMargin} onChange={v => updateInput('profitMargin', v)} suffix="%" />
              <Button variant="ghost" size="sm" onClick={() => setInputs(defaultInputs)} className="h-9 px-2">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Time Horizon — inline */}
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Horizon:</span>
              <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
                {horizons.map((h) => (
                  <button
                    key={h}
                    onClick={() => setSelectedHorizon(h)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                      selectedHorizon === h
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    {h}{h === 1 ? 'M' : 'M'}
                  </button>
                ))}
              </div>
            </div>

            {/* Output Tiles — compact 6-col grid */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <MiniTile icon={Users} label="Clients" value={fmtNum(outputs.clientsClosed)} positive />
              <MiniTile icon={PoundSterling} label="Revenue" value={fmt(outputs.revenue)} positive />
              <MiniTile icon={TrendingUp} label="Profit" value={fmt(outputs.profit)} positive />
              <MiniTile icon={PoundSterling} label="ROI (£)" value={fmt(outputs.roiPounds)} positive={outputs.roiPounds >= 0} />
              <MiniTile icon={Percent} label="ROI (%)" value={fmtPct(outputs.roiPercent)} positive={outputs.roiPercent >= 0} />
              <MiniTile icon={Percent} label="Rev vs Cost" value={fmtPct(outputs.revenueVsCostPercent)} positive />
            </div>

            {/* Comparison Table — compact */}
            <div className="rounded-xl bg-secondary border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted-foreground font-medium p-2 pl-3">Metric</th>
                    {horizons.map((h) => (
                      <th key={h} className={`text-right font-medium p-2 pr-3 ${h === selectedHorizon ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}>
                        {h}M
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: 'Clients', key: 'clientsClosed', format: fmtNum, colored: false },
                    { label: 'Revenue', key: 'revenue', format: fmt, colored: false },
                    { label: 'Profit', key: 'profit', format: fmt, colored: false },
                    { label: 'ROI (£)', key: 'roiPounds', format: fmt, colored: true },
                    { label: 'ROI (%)', key: 'roiPercent', format: fmtPct, colored: true },
                    { label: 'Rev vs Cost', key: 'revenueVsCostPercent', format: fmtPct, colored: false },
                  ]).map((row) => (
                    <tr key={row.label} className="border-b border-border last:border-0">
                      <td className="text-muted-foreground p-2 pl-3">{row.label}</td>
                      {horizons.map((h) => {
                        const val = allHorizons[h][row.key as keyof typeof outputs];
                        const isSelected = h === selectedHorizon;
                        const colorClass = row.colored
                          ? val >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          : 'text-foreground';
                        return (
                          <td key={h} className={`text-right p-2 pr-3 ${colorClass} ${isSelected ? 'bg-primary/10 font-semibold' : ''}`}>
                            {row.format(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/* ── Tiny sub-components ── */

function CompactInput({ label, value, onChange, prefix, suffix }: {
  label: string; value: number; onChange: (v: string) => void; prefix?: string; suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-[11px] whitespace-pre-line leading-tight block min-h-[28px] flex items-end">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{prefix}</span>}
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-9 w-24 text-sm ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-6' : ''}`}
        />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

function MiniTile({ icon: Icon, label, value, positive }: {
  icon: React.ElementType; label: string; value: string; positive: boolean;
}) {
  return (
    <div className="rounded-lg bg-card border border-border p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon className={`h-3.5 w-3.5 ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
        <span className="text-muted-foreground text-[10px] font-medium">{label}</span>
      </div>
      <p className={`text-lg font-bold leading-tight ${positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {value}
      </p>
    </div>
  );
}
