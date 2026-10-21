import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { fetchAePipelineSnapshot } from "@/lib/aePipeline";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChartIcon } from "lucide-react";

interface PipelineData {
  name: string;
  value: number;
  count: number;
  color: string;
}

export function AEPipelineDonut() {
  const [data, setData] = useState<PipelineData[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPipelineData();
  }, []);

  const loadPipelineData = async () => {
    setIsLoading(true);

    // Stage derivation shared with the SDR-manager dashboard tile (lib/aePipeline).
    const snapshot = await fetchAePipelineSnapshot();

    const pipelineData: PipelineData[] = [
      {
        name: "Discovery",
        value: snapshot.discoveryCount * 5000, // Estimated value per discovery
        count: snapshot.discoveryCount,
        color: "hsl(var(--primary))",
      },
      {
        name: "Follow-up",
        value: snapshot.followUpValue,
        count: snapshot.followUpCount,
        color: "hsl(45 93% 47%)", // Amber
      },
      {
        name: "Converted",
        value: snapshot.convertedValue,
        count: snapshot.convertedCount,
        color: "hsl(160 60% 45%)", // Emerald
      },
    ];

    // Filter out zero values
    const filteredData = pipelineData.filter(d => d.count > 0);
    
    setData(filteredData);
    setTotalValue(filteredData.reduce((sum, d) => sum + d.value, 0));
    setIsLoading(false);
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `£${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `£${(value / 1000).toFixed(0)}k`;
    return `£${value.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-primary" />
            Pipeline Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalDeals = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          Pipeline Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <PieChartIcon className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No pipeline data</p>
          </div>
        ) : (
          <div className="flex items-center">
            <div className="w-1/2 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string, props: any) => [
                      `${formatCurrency(value)} (${props.payload.count} deals)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 space-y-3">
              <div className="text-center mb-4">
                <p className="text-2xl font-bold text-foreground">{totalDeals}</p>
                <p className="text-xs text-muted-foreground">Total Deals</p>
              </div>
              {data.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-foreground">{item.name}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
