import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, FileText, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionRequiredModal } from "./ActionRequiredModal";
import { useAuth } from "@/contexts/AuthContext";

interface ActionItem {
  type: "overdue" | "followup" | "agreement" | "needs_approval";
  count: number;
  label: string;
}

export function ActionRequiredCard() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAE = userRole === 'account_executive';
  
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadActionItems();
  }, []);

  const loadActionItems = async () => {
    setIsLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const items: ActionItem[] = [];

    // 1. Overdue outcomes - meetings from past days without outcome in discovery logs
    const { data: pastMeetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("department", "acquisition")
      .lt("meeting_date", today)
      .is("status", null);

    // Check which of these don't have a discovery log
    if (pastMeetings && pastMeetings.length > 0) {
      const meetingIds = pastMeetings.map((m) => m.id);
      const { data: existingLogs } = await supabase
        .from("sales_discovery_logs")
        .select("meeting_id")
        .in("meeting_id", meetingIds);

      const loggedMeetingIds = new Set(existingLogs?.map((l) => l.meeting_id) || []);
      const overdueCount = meetingIds.filter((id) => !loggedMeetingIds.has(id)).length;

      if (overdueCount > 0) {
        items.push({
          type: "overdue",
          count: overdueCount,
          label: "Overdue Outcomes",
        });
      }
    }

    // 2. Meetings needing approval today
    const { data: needsApproval } = await supabase
      .from("meetings")
      .select("id")
      .eq("approved_by_admin", false)
      .eq("meeting_date", today);

    if (needsApproval && needsApproval.length > 0) {
      items.push({
        type: "needs_approval",
        count: needsApproval.length,
        label: "Meetings Needing Approval",
      });
    }

    // 3. Follow-ups due today - discoveries marked as "unsure" with follow_up_date = today
    const { data: followupsDue } = await supabase
      .from("sales_discovery_logs")
      .select("id")
      .eq("client_interest", "unsure")
      .eq("follow_up_date", today)
      .eq("converted_to_client", false)
      .is("marked_not_proceeding", null);

    if (followupsDue && followupsDue.length > 0) {
      items.push({
        type: "followup",
        count: followupsDue.length,
        label: "Follow-ups Due Today",
      });
    }

    // 3. Agreements pending - sent but not converted or marked not proceeding
    const { data: pendingAgreements } = await supabase
      .from("agreement_send_queue")
      .select("id, discovery_log_id")
      .eq("status", "sent");

    if (pendingAgreements && pendingAgreements.length > 0) {
      // Check which haven't been converted yet
      const discoveryLogIds = pendingAgreements
        .filter((a) => a.discovery_log_id)
        .map((a) => a.discovery_log_id);

      if (discoveryLogIds.length > 0) {
        const { data: unconverted } = await supabase
          .from("sales_discovery_logs")
          .select("id")
          .in("id", discoveryLogIds)
          .eq("converted_to_client", false)
          .is("marked_not_proceeding", null);

        if (unconverted && unconverted.length > 0) {
          items.push({
            type: "agreement",
            count: unconverted.length,
            label: "Agreements Pending",
          });
        }
      }
    }

    setActionItems(items);
    setIsLoading(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "overdue":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "needs_approval":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "followup":
        return <Clock className="h-4 w-4 text-warning" />;
      case "agreement":
        return <FileText className="h-4 w-4 text-primary" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "overdue":
        return "bg-destructive/10 hover:bg-destructive/15 border-destructive/20";
      case "needs_approval":
        return "bg-blue-500/10 hover:bg-blue-500/15 border-blue-500/20";
      case "followup":
        return "bg-warning/10 hover:bg-warning/15 border-warning/20";
      case "agreement":
        return "bg-primary/10 hover:bg-primary/15 border-primary/20";
      default:
        return "bg-muted";
    }
  };

  const totalActions = actionItems.reduce((sum, item) => sum + item.count, 0);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle className="text-base font-semibold">Action Required</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const handleCardClick = () => {
    if (isAE) {
      navigate('/ae/discovery-calls?filter=needs_action');
    } else {
      setIsModalOpen(true);
    }
  };

  return (
    <>
    <Card className="h-full cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200" onClick={handleCardClick}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-warning/10">
              <AlertTriangle className="h-4.5 w-4.5 text-warning" />
            </div>
            <CardTitle className="text-base font-semibold">Action Required</CardTitle>
          </div>
          {totalActions > 0 && (
            <Badge variant="destructive" className="text-xs font-medium">
              {totalActions} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {totalActions === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <div className="flex items-center justify-center w-10 h-10 mx-auto mb-2 rounded-full bg-primary/10">
              <AlertTriangle className="h-5 w-5 text-primary opacity-50" />
            </div>
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">No pending actions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {actionItems.map((item) => (
              <button
                key={item.type}
                onClick={() => navigate("/admin/acquisition/meetings")}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${getBgColor(
                  item.type
                )}`}
              >
                <div className="flex items-center gap-3">
                  {getIcon(item.type)}
                  <div className="text-left">
                    <p className="font-medium text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.count} items</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    <ActionRequiredModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
}
