import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KPICardSkeletonProps {
  showProgress?: boolean;
  className?: string;
}

export const KPICardSkeleton = ({ showProgress = false, className }: KPICardSkeletonProps) => {
  return (
    <Card className={cn("group relative overflow-hidden", className)}>
      {/* Status stripe skeleton */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted/50" />
      
      <CardContent className="p-5 sm:p-6 pl-4 sm:pl-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex-shrink-0" />
        </div>
        
        {showProgress && (
          <div className="mt-4 pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="h-2 w-16" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
