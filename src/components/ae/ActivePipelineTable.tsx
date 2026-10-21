import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

interface PipelineItem {
  id: string;
  company: string;
  client: string;
  value: number;
  stage: "discovery" | "follow_up" | "ready" | "won";
}

interface ActivePipelineTableProps {
  data: PipelineItem[];
  isLoading?: boolean;
}

const stageConfig = {
  discovery: {
    label: "Discovery",
    className: "bg-primary/10 text-primary border-primary/30",
  },
  follow_up: {
    label: "Follow-up",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  },
  ready: {
    label: "Ready",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  },
  won: {
    label: "Won",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  },
};

export function ActivePipelineTable({ data, isLoading }: ActivePipelineTableProps) {
  const navigate = useNavigate();

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `£${(value / 1000).toFixed(0)}k`;
    }
    return `£${value.toLocaleString()}`;
  };

  const handleRowClick = (item: PipelineItem) => {
    if (item.stage === "discovery" || item.stage === "follow_up") {
      navigate("/ae/discovery-calls");
    } else {
      navigate("/ae/follow-up-calls");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 w-full bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Active Pipeline</h3>
          <p className="text-xs text-muted-foreground">Current opportunities</p>
        </div>
        <button
          onClick={() => navigate("/ae/discovery-calls")}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          View all
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto space-y-1">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No active pipeline items
          </div>
        ) : (
          data.map((item) => {
            const stage = stageConfig[item.stage];
            return (
              <button
                key={item.id}
                onClick={() => handleRowClick(item)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 border border-transparent hover:border-border/30 transition-all text-left group"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.company}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.client}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(item.value)}
                  </span>
                  <Badge variant="secondary" className={`text-xs ${stage.className}`}>
                    {stage.label}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
