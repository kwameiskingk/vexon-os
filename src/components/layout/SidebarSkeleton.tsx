import { Skeleton } from "@/components/ui/skeleton";

export const SidebarSkeleton = () => {
  return (
    <div className="space-y-2 px-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Skeleton 
          key={i} 
          className="h-9 w-full rounded-lg" 
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
};
