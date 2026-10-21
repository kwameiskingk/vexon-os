import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ChevronRight, Briefcase } from "lucide-react";

interface Opportunity {
  id: string;
  company_name: string;
  client_name: string;
  contract_value: number | null;
  stage: "discovery" | "follow_up" | "pitch";
  source: "meeting" | "discovery_log" | "pitch_call";
}

export function AEOpportunitiesTable() {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadOpportunities();
  }, []);

  const loadOpportunities = async () => {
    setIsLoading(true);
    const opps: Opportunity[] = [];

    // Discovery stage - recent meetings without outcome
    const { data: pendingMeetings } = await supabase
      .from("meetings")
      .select("id, company_name, prospect_name")
      .eq("department", "acquisition")
      .is("status", null)
      .order("meeting_date", { ascending: false })
      .limit(10);

    // Get meeting IDs that already have discovery logs
    const meetingIds = pendingMeetings?.map(m => m.id) || [];
    let loggedMeetingIds = new Set<string>();
    
    if (meetingIds.length > 0) {
      const { data: existingLogs } = await supabase
        .from("sales_discovery_logs")
        .select("meeting_id")
        .in("meeting_id", meetingIds);
      loggedMeetingIds = new Set(existingLogs?.map(l => l.meeting_id) || []);
    }

    pendingMeetings?.forEach(m => {
      if (!loggedMeetingIds.has(m.id)) {
        opps.push({
          id: m.id,
          company_name: m.company_name,
          client_name: m.prospect_name,
          contract_value: null,
          stage: "discovery",
          source: "meeting",
        });
      }
    });

    // Follow-up stage - discovery logs with interest
    const { data: followUps } = await supabase
      .from("sales_discovery_logs")
      .select("id, client_name, contract_value")
      .in("client_interest", ["interested", "unsure"])
      .eq("converted_to_client", false)
      .is("marked_not_proceeding", null)
      .order("updated_at", { ascending: false })
      .limit(10);

    followUps?.forEach(f => {
      opps.push({
        id: f.id,
        company_name: f.client_name || "Unknown",
        client_name: f.client_name || "Unknown",
        contract_value: f.contract_value,
        stage: "follow_up",
        source: "discovery_log",
      });
    });

    // Pitch stage - scheduled pitch calls
    const { data: pitchCalls } = await supabase
      .from("pitch_calls")
      .select("id, company_name, client_name, contract_value")
      .eq("converted_to_client", false)
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .limit(5);

    pitchCalls?.forEach(p => {
      opps.push({
        id: p.id,
        company_name: p.company_name || p.client_name || "Unknown",
        client_name: p.client_name || "Unknown",
        contract_value: p.contract_value,
        stage: "pitch",
        source: "pitch_call",
      });
    });

    // Sort by stage priority and limit to 8
    const stageOrder = { discovery: 1, follow_up: 2, pitch: 3 };
    opps.sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage]);
    
    setOpportunities(opps.slice(0, 8));
    setIsLoading(false);
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "TBD";
    if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
    return `£${value.toLocaleString()}`;
  };

  const getStageConfig = (stage: string) => {
    switch (stage) {
      case "discovery":
        return { label: "Discovery", className: "bg-primary/10 text-primary border-primary/20" };
      case "follow_up":
        return { label: "Follow-up", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
      case "pitch":
        return { label: "Pitch", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" };
      default:
        return { label: stage, className: "bg-muted text-muted-foreground" };
    }
  };

  const handleRowClick = (opp: Opportunity) => {
    if (opp.source === "meeting" || opp.source === "discovery_log") {
      navigate("/ae/discovery-calls");
    } else {
      navigate("/ae/follow-up-calls");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Active Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Active Opportunities
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => navigate("/ae/discovery-calls")}
          >
            View All
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {opportunities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active opportunities</p>
            <p className="text-xs mt-1">Your pipeline is empty</p>
          </div>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opp) => {
              const stageConfig = getStageConfig(opp.stage);
              return (
                <button
                  key={`${opp.source}-${opp.id}`}
                  onClick={() => handleRowClick(opp)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {opp.company_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {opp.client_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-medium text-foreground">
                      {formatCurrency(opp.contract_value)}
                    </span>
                    <Badge variant="outline" className={`text-xs ${stageConfig.className}`}>
                      {stageConfig.label}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
