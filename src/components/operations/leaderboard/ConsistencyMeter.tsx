import { Progress } from "@/components/ui/progress";

interface ConsistencyMeterProps {
  consistency: number;
}

export const ConsistencyMeter = ({ consistency }: ConsistencyMeterProps) => {
  const getColor = () => {
    if (consistency >= 80) return "text-green-500";
    if (consistency >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">🔵 Consistency:</span>
      <span className={`text-xs font-bold ${getColor()}`}>{consistency}%</span>
      <div className="flex-1 max-w-[60px]">
        <Progress value={consistency} className="h-1.5" />
      </div>
    </div>
  );
};
