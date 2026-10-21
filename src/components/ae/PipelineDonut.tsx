import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface PipelineStage {
  name: string;
  count: number;
  value: number;
  color: string;
}

interface PipelineDonutProps {
  data: PipelineStage[];
  isLoading?: boolean;
}

export function PipelineDonut({ data, isLoading }: PipelineDonutProps) {
  const totalValue = data.reduce((sum, stage) => sum + stage.value, 0);
  const totalCount = data.reduce((sum, stage) => sum + stage.count, 0);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `£${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `£${(value / 1000).toFixed(0)}k`;
    }
    return `£${value.toLocaleString()}`;
  };

  // For the chart: if all counts are zero, show a placeholder segment
  const hasAnyData = data.some(stage => stage.count > 0);
  const chartData = hasAnyData 
    ? data.filter(stage => stage.count > 0)
    : [{ name: "Empty", count: 1, value: 0, color: "hsl(var(--muted))" }]; // Show grey ring when no data

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-5 w-40 bg-muted animate-pulse rounded" />
        <div className="h-48 w-48 mx-auto rounded-full bg-muted animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 w-full bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Deals Grouped by Stage</h3>
        <p className="text-xs text-muted-foreground">Current pipeline breakdown</p>
      </div>

      <div className="flex-1 flex items-center gap-6">
        {/* Donut Chart */}
        <div className="relative h-40 w-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={hasAnyData ? 2 : 0}
                dataKey="count"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              {hasAnyData && (
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} deals`, name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
          
          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-foreground">
              {hasAnyData ? formatCurrency(totalValue) : "£0"}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalCount} {totalCount === 1 ? "deal" : "deals"}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-2">
          {data.map((stage, index) => (
            <div key={index} className="flex items-center justify-between text-sm gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div 
                  className="h-3 w-3 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: stage.color }} 
                />
                <span className="text-muted-foreground truncate">{stage.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-foreground font-medium">{stage.count}</span>
                <span className="text-muted-foreground text-xs">
                  {formatCurrency(stage.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
