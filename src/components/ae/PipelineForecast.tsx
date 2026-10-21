import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ForecastRow {
  month: string;
  contractValue: number;
  expectingToClose: number;
  forecastedValue: number;
}

interface PipelineForecastProps {
  data: ForecastRow[];
  isLoading?: boolean;
}

export function PipelineForecast({ data, isLoading }: PipelineForecastProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `£${(value / 1000).toFixed(0)}k`;
    }
    return `£${value.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 w-full bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Pipeline Forecast</h3>
        <p className="text-xs text-muted-foreground">Projected revenue by month</p>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wide h-8">
                Month
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right h-8">
                Avg Value
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right h-8">
                Expecting
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-right h-8">
                Forecast
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 || data.every(row => row.expectingToClose === 0 && row.forecastedValue === 0) ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No deals in pipeline yet
                </TableCell>
              </TableRow>
            ) : (
              data.filter(row => row.expectingToClose > 0 || row.forecastedValue > 0).map((row, index) => (
                <TableRow key={index} className="border-border/30 hover:bg-muted/30">
                  <TableCell className="py-2.5 text-sm font-medium text-foreground">
                    {row.month}
                  </TableCell>
                  <TableCell className="py-2.5 text-sm text-muted-foreground text-right">
                    {row.contractValue > 0 ? formatCurrency(row.contractValue) : '—'}
                  </TableCell>
                  <TableCell className="py-2.5 text-sm text-foreground text-right font-medium">
                    {row.expectingToClose}
                  </TableCell>
                  <TableCell className="py-2.5 text-sm text-emerald-500 text-right font-semibold">
                    {row.forecastedValue > 0 ? formatCurrency(row.forecastedValue) : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Total */}
      <div className="pt-3 mt-auto border-t border-border/30 flex justify-between items-center">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Forecast</span>
        <span className="text-lg font-bold text-foreground">
          {data.reduce((sum, row) => sum + row.forecastedValue, 0) > 0 
            ? formatCurrency(data.reduce((sum, row) => sum + row.forecastedValue, 0))
            : '—'}
        </span>
      </div>
    </div>
  );
}
