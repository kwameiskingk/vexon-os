import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Users, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { usePersistedState } from "@/hooks/usePersistedState";

export const TodaysCandidates = memo(() => {
  const [isOpen, setIsOpen] = usePersistedState('todays-candidates-collapsed', true);
  
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['todays-candidates'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('candidates')
        .select('id, first_name, last_name, email, country, call_time, status')
        .eq('date_of_call', today)
        .order('call_time', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 300000, // Refetch every 5 minutes
    staleTime: 240000, // 4 minutes
  });

  const pendingCandidates = candidates.filter(c => c.status === 'pending');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Today's Candidates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Today's Candidates
              <Badge>{candidates.length} total</Badge>
              <ChevronDown className={`h-4 w-4 ml-auto transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No candidates scheduled today</p>
            ) : (
              <div className="space-y-3">
                {pendingCandidates.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Pending Review ({pendingCandidates.length})</p>
                    {pendingCandidates.map((candidate) => (
                      <div key={candidate.id} className="p-3 border rounded-lg bg-accent/50 transition-all duration-200 hover:bg-accent/70">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-medium">{candidate.first_name} {candidate.last_name}</p>
                            <p className="text-sm text-muted-foreground">{candidate.email}</p>
                            {candidate.call_time && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Call: {candidate.call_time}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline">{candidate.country || 'N/A'}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {candidates.filter(c => c.status !== 'pending').length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {candidates.filter(c => c.status === 'passed').length} passed • 
                      {' '}{candidates.filter(c => c.status === 'failed').length} failed
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});

TodaysCandidates.displayName = 'TodaysCandidates';
