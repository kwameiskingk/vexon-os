import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox } from "lucide-react";
import { ReactNode } from "react";

export interface PipelineColumnProps {
  id: string;
  title: string;
  count: number;
  summaryLabel?: string;
  summaryValue?: string;
  badgeColor: string;
  children: ReactNode;
  itemIds: string[];
  emptyMessage?: string;
}

export function PipelineColumn({
  id,
  title,
  count,
  summaryLabel,
  summaryValue,
  badgeColor,
  children,
  itemIds,
  emptyMessage = "No items",
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col min-w-[280px] w-[280px]">
      {/* Stage Header */}
      <div className="mb-3 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-white ${badgeColor}`}
          >
            {title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {count} {count === 1 ? "opportunity" : "opportunities"}
        </p>
        {summaryLabel && summaryValue && (
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {summaryLabel}
            </span>
            <span className="text-sm font-semibold text-foreground">{summaryValue}</span>
          </div>
        )}
      </div>

      {/* Column Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-lg border-2 border-dashed transition-all duration-200 ${
          isOver
            ? "border-primary bg-primary/5 shadow-lg"
            : "border-border/50 bg-muted/20 hover:border-border"
        }`}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {itemIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Inbox className="h-6 w-6 mb-2 opacity-40" />
              <p className="text-xs">{emptyMessage}</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px]">
              <div className="p-2 space-y-2">{children}</div>
            </ScrollArea>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
