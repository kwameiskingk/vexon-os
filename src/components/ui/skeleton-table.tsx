import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
}

export const SkeletonTable = ({ rows = 5, columns = 4 }: SkeletonTableProps) => {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-muted/30 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`h-${i}`}
            className="h-3"
            style={{ width: `${i === 0 ? 30 : 15 + Math.random() * 10}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-0"
          style={{ animationDelay: `${rowIdx * 60}ms` }}
        >
          <div className="flex items-center gap-3 w-[30%]">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          </div>
          {Array.from({ length: columns - 1 }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className="h-3"
              style={{ width: `${10 + Math.random() * 8}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
