import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, FileText, Building2, Calendar, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

interface ActionItem {
  id: string;
  type: "overdue" | "followup" | "agreement" | "needs_approval";
  company_name: string;
  client_name?: string;
  date?: string;
  email?: string;
}

interface ActionRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActionRequiredModal({ open, onOpenChange }: ActionRequiredModalProps) {
  const [overdueItems, setOverdueItems] = useState<ActionItem[]>([]);
  const [needsApprovalItems, setNeedsApprovalItems] = useState<ActionItem[]>([]);
  const [followupItems, setFollowupItems] = useState<ActionItem[]>([]);
  const [agreementItems, setAgreementItems] = useState<ActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      loadActionItems();
    }
  }, [open]);

  const loadActionItems = async () => {
    setIsLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    // 1. Overdue outcomes - meetings from past days without outcome
    const { data: pastMeetings } = await supabase
      .from("meetings")
      .select("id, company_name, prospect_name, prospect_email, meeting_date")
      .eq("department", "acquisition")
      .lt("meeting_date", today)
      .is("status", null);

    if (pastMeetings && pastMeetings.length > 0) {
      const meetingIds = pastMeetings.map((m) => m.id);
      const { data: existingLogs } = await supabase
        .from("sales_discovery_logs")
        .select("meeting_id")
        .in("meeting_id", meetingIds);

      const loggedMeetingIds = new Set(existingLogs?.map((l) => l.meeting_id) || []);
      const overdue = pastMeetings
        .filter((m) => !loggedMeetingIds.has(m.id))
        .map((m) => ({
          id: m.id,
          type: "overdue" as const,
          company_name: m.company_name,
          client_name: m.prospect_name,
          date: m.meeting_date,
          email: m.prospect_email,
        }));
      setOverdueItems(overdue);
    } else {
      setOverdueItems([]);
    }

    // 2. Meetings needing approval today
    const { data: pendingApproval } = await supabase
      .from("meetings")
      .select("id, company_name, prospect_name, prospect_email, meeting_date, meeting_time")
      .eq("approved_by_admin", false)
      .eq("meeting_date", today);

    if (pendingApproval && pendingApproval.length > 0) {
      setNeedsApprovalItems(
        pendingApproval.map((m) => ({
          id: m.id,
          type: "needs_approval" as const,
          company_name: m.company_name,
          client_name: m.prospect_name,
          date: m.meeting_date,
          email: m.prospect_email,
        }))
      );
    } else {
      setNeedsApprovalItems([]);
    }

    // 3. Follow-ups due today
    const { data: followupsDue } = await supabase
      .from("sales_discovery_logs")
      .select("id, client_name, client_email, follow_up_date")
      .eq("client_interest", "unsure")
      .eq("follow_up_date", today)
      .eq("converted_to_client", false)
      .is("marked_not_proceeding", null);

    if (followupsDue) {
      setFollowupItems(
        followupsDue.map((f) => ({
          id: f.id,
          type: "followup" as const,
          company_name: f.client_name || "Unknown",
          client_name: f.client_name,
          date: f.follow_up_date,
          email: f.client_email,
        }))
      );
    } else {
      setFollowupItems([]);
    }

    // 3. Agreements pending
    const { data: pendingAgreements } = await supabase
      .from("agreement_send_queue")
      .select("id, discovery_log_id")
      .eq("status", "sent");

    if (pendingAgreements && pendingAgreements.length > 0) {
      const discoveryLogIds = pendingAgreements
        .filter((a) => a.discovery_log_id)
        .map((a) => a.discovery_log_id);

      if (discoveryLogIds.length > 0) {
        const { data: unconverted } = await supabase
          .from("sales_discovery_logs")
          .select("id, client_name, client_email")
          .in("id", discoveryLogIds)
          .eq("converted_to_client", false)
          .is("marked_not_proceeding", null);

        if (unconverted) {
          setAgreementItems(
            unconverted.map((u) => ({
              id: u.id,
              type: "agreement" as const,
              company_name: u.client_name || "Unknown",
              client_name: u.client_name,
              email: u.client_email,
            }))
          );
        } else {
          setAgreementItems([]);
        }
      } else {
        setAgreementItems([]);
      }
    } else {
      setAgreementItems([]);
    }

    setIsLoading(false);
  };

  const handleItemClick = () => {
    onOpenChange(false);
    navigate("/admin/acquisition/meetings");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "overdue":
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case "needs_approval":
        return <Clock className="h-5 w-5 text-blue-500" />;
      case "followup":
        return <Clock className="h-5 w-5 text-amber-500" />;
      case "agreement":
        return <FileText className="h-5 w-5 text-primary" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "overdue":
        return "bg-destructive/5 hover:bg-destructive/10 border-destructive/20";
      case "needs_approval":
        return "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/20";
      case "followup":
        return "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20";
      case "agreement":
        return "bg-primary/5 hover:bg-primary/10 border-primary/20";
      default:
        return "bg-muted";
    }
  };

  const totalActions = overdueItems.length + needsApprovalItems.length + followupItems.length + agreementItems.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Action Required
            {totalActions > 0 && (
              <Badge variant="destructive" className="ml-2">
                {totalActions} pending
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : totalActions === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-3 rounded-full bg-primary/10">
              <AlertTriangle className="h-8 w-8 text-primary opacity-50" />
            </div>
            <p className="text-lg font-medium text-foreground">All caught up!</p>
            <p className="text-sm mt-1">No pending actions at the moment</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overdue Outcomes */}
            {overdueItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Overdue Outcomes ({overdueItems.length})
                </div>
                <div className="space-y-2">
                  {overdueItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={handleItemClick}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors cursor-pointer border ${getBgColor(item.type)}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10">
                          <Building2 className="h-5 w-5 text-destructive" />
                        </div>
                        <div>
                          <p className="font-medium">{item.company_name}</p>
                          {item.client_name && (
                            <p className="text-sm text-muted-foreground">{item.client_name}</p>
                          )}
                          {item.date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              Meeting: {format(new Date(item.date), "MMM d, yyyy")}
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meetings Needing Approval */}
            {needsApprovalItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Meetings Needing Approval ({needsApprovalItems.length})
                </div>
                <div className="space-y-2">
                  {needsApprovalItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={handleItemClick}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors cursor-pointer border ${getBgColor(item.type)}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10">
                          <Building2 className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium">{item.company_name}</p>
                          {item.client_name && (
                            <p className="text-sm text-muted-foreground">{item.client_name}</p>
                          )}
                          {item.date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Calendar className="h-3 w-3" />
                              Meeting: {format(new Date(item.date), "MMM d, yyyy")}
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-ups Due */}
            {followupItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Follow-ups Due Today ({followupItems.length})
                </div>
                <div className="space-y-2">
                  {followupItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={handleItemClick}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors cursor-pointer border ${getBgColor(item.type)}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10">
                          <Building2 className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                          <p className="font-medium">{item.company_name}</p>
                          {item.email && (
                            <p className="text-xs text-muted-foreground">{item.email}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agreements Pending */}
            {agreementItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-primary" />
                  Agreements Pending ({agreementItems.length})
                </div>
                <div className="space-y-2">
                  {agreementItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={handleItemClick}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors cursor-pointer border ${getBgColor(item.type)}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{item.company_name}</p>
                          {item.email && (
                            <p className="text-xs text-muted-foreground">{item.email}</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
