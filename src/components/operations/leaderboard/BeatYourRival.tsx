import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Swords, TrendingUp, X, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";

interface BeatYourRivalProps {
  currentUser: any;
  allSetters: any[];
  currentRival?: string;
  rivalryStartedAt?: string | null;
  rivalryEndPending?: boolean;
  onSetRival: (rivalEmail: string) => void;
  onEndRival?: (rivalryStartedAt: string | null) => void;
  onApproveRivalryEnd?: (setterEmail: string) => void;
  isAdmin?: boolean;
}

export const BeatYourRival = ({ 
  currentUser, 
  allSetters, 
  currentRival, 
  rivalryStartedAt,
  rivalryEndPending,
  onSetRival, 
  onEndRival,
  onApproveRivalryEnd,
  isAdmin 
}: BeatYourRivalProps) => {
  const [isOpen, setIsOpen] = usePersistedState('active-rivalries-open', true);
  const [selectedRival, setSelectedRival] = useState(currentRival || "");

  // Find rival from either direction (you chose them OR they chose you)
  const directRival = allSetters.find(s => s.email === selectedRival);
  const inverseRival = allSetters.find(s => s.email === currentUser?.email && selectedRival);
  const rival = directRival || inverseRival || allSetters.find(s => s.email === selectedRival);
  
  const availableRivals = allSetters.filter(s => s.email !== currentUser?.email);

  if (isAdmin) {
    const pendingRivalries = allSetters.filter(s => s.rivalryEndPending);
    const activeRivalries = allSetters.filter(s => s.rival && !s.rivalryEndPending);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-2 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-background">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-purple-500" />
                  Active Rivalries
                </CardTitle>
                {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
          {pendingRivalries.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-orange-500">Pending Approval</h4>
              {pendingRivalries.map((setter: any) => (
                <div key={setter.email} className="flex items-center justify-between p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex-1">
                    <span className="text-sm font-medium">{setter.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">wants to end rivalry vs {setter.rival}</span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => onApproveRivalryEnd?.(setter.email)}
                    className="ml-2"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Active</h4>
            {activeRivalries.map((setter: any) => (
              <div key={setter.email} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">{setter.name}</span>
                <span className="text-xs text-muted-foreground">vs {setter.rival}</span>
              </div>
            ))}
            {activeRivalries.length === 0 && !pendingRivalries.length && (
              <p className="text-sm text-muted-foreground">No active rivalries</p>
            )}
          </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <Card className="border-2 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-purple-500" />
          Beat Your Rival
          {rivalryEndPending && (
            <Badge variant="outline" className="ml-auto bg-orange-500/10 text-orange-500 border-orange-500/20">
              End Pending Approval
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!currentRival ? (
          <div className="flex gap-2">
            <Select value={selectedRival} onValueChange={setSelectedRival}>
              <SelectTrigger>
                <SelectValue placeholder="Choose your rival" />
              </SelectTrigger>
              <SelectContent>
                {availableRivals.map((setter: any) => (
                  <SelectItem key={setter.email} value={setter.email}>
                    {setter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => onSetRival(selectedRival)} disabled={!selectedRival}>
              Set
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="text-center font-semibold text-lg">
                You vs {rival?.name}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{currentUser?.meetings_booked || 0}</div>
                  <div className="text-xs text-muted-foreground">vs</div>
                  <div className="text-2xl font-bold text-purple-500">{rival?.meetings_booked || 0}</div>
                  <div className="text-xs font-medium mt-1">Meetings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{currentUser?.dials_made || 0}</div>
                  <div className="text-xs text-muted-foreground">vs</div>
                  <div className="text-2xl font-bold text-purple-500">{rival?.dials_made || 0}</div>
                  <div className="text-xs font-medium mt-1">Calls</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{currentUser?.warm_leads || 0}</div>
                  <div className="text-xs text-muted-foreground">vs</div>
                  <div className="text-2xl font-bold text-purple-500">{rival?.warm_leads || 0}</div>
                  <div className="text-xs font-medium mt-1">Warm Leads</div>
                </div>
              </div>
            </div>
            {!rivalryEndPending && (
              <Button 
                variant="destructive" 
                size="sm" 
                className="w-full"
                onClick={() => onEndRival?.(rivalryStartedAt || null)}
              >
                <X className="h-4 w-4 mr-2" />
                End Rivalry
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
