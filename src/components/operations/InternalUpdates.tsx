import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell } from "lucide-react";
import { format } from "date-fns";

export const InternalUpdates = memo(() => {
  const { data: updates = [], isLoading } = useQuery({
    queryKey: ['internal-updates'],
    queryFn: async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const { data, error } = await supabase
        .from('admin_feedback_entries')
        .select(`
          id,
          eod_text,
          entry_date,
          author_user_id,
          profiles!inner(full_name, email)
        `)
        .gte('entry_date', threeDaysAgo.toISOString().split('T')[0])
        .order('entry_date', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 300000, // Refetch every 5 minutes
    staleTime: 240000, // 4 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Recent Internal Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Recent Internal Updates
          <Badge variant="secondary" className="ml-auto">{updates.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent updates</p>
        ) : (
          <div className="space-y-3">
            {updates.map((update: any) => (
              <div key={update.id} className="p-3 border rounded-lg bg-card transition-all duration-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-medium">{update.profiles.full_name}</p>
                  <Badge variant="outline" className="text-xs">
                    {format(new Date(update.entry_date), 'MMM dd')}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {update.eod_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

InternalUpdates.displayName = 'InternalUpdates';
