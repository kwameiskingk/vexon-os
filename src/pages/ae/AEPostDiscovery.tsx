import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill, Row, RowList, RowName } from "@/components/ui-v2";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ClipboardCheck, Star, ExternalLink, MessageSquare, Calendar } from "lucide-react";
import { PostDiscoveryFeedbackForm } from "@/components/ae/PostDiscoveryFeedbackForm";

interface DiscoveryLog {
  id: string;
  client_name: string;
  meeting_at: string;
}

interface PostDiscoveryFeedback {
  id: string;
  discovery_log_id: string;
  client_name: string;
  call_date: string;
  call_type: string;
  call_recording_link: string;
  icp_fit_score: number;
  pain_severity_score: number;
  urgency_score: number;
  budget_confidence_score: number;
  decision_maker_access_score: number;
  summary: string;
  key_pain_points: string;
  desired_outcome: string;
  decision_process: string;
  objections_raised: string;
  risks_to_close: string;
  next_steps_agreed: string;
  ae_what_went_well: string;
  ae_what_to_improve: string;
  support_needed_from_ceo: string;
  status: "submitted" | "reviewed";
  admin_commentary: string | null;
  coaching_action_items: string | null;
  admin_rating: number | null;
  created_at: string;
}

export default function AEPostDiscovery() {
  const [selectedLog, setSelectedLog] = useState<DiscoveryLog | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [viewFeedback, setViewFeedback] = useState<PostDiscoveryFeedback | null>(null);

  // Get current user
  const { user: currentUser } = useAuth();

  // Get all submitted feedback for this AE
  const { data: submittedFeedback, refetch: refetchFeedback } = useQuery({
    queryKey: ["ae-post-discovery-feedback", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const { data, error } = await supabase
        .from("post_discovery_feedback")
        .select("*")
        .eq("ae_user_id", currentUser.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PostDiscoveryFeedback[];
    },
    enabled: !!currentUser?.id,
  });

  // Get discovery logs that need feedback (sat outcome, no feedback yet)
  const { data: pendingLogs, isLoading: isLoadingPending, refetch: refetchPending } = useQuery({
    queryKey: ["ae-pending-discovery-feedback", submittedFeedback],
    queryFn: async () => {
      // Get all discovery logs with sat outcome
      const { data: logs, error } = await supabase
        .from("sales_discovery_logs")
        .select("id, client_name, meeting_at")
        .not("client_name", "is", null)
        .order("meeting_at", { ascending: false });

      if (error) throw error;

      // Filter out logs that already have feedback
      const feedbackLogIds = new Set(submittedFeedback?.map((f) => f.discovery_log_id) || []);
      return (logs || []).filter((log) => !feedbackLogIds.has(log.id)) as DiscoveryLog[];
    },
    enabled: submittedFeedback !== undefined,
  });

  const handleOpenFeedbackForm = (log: DiscoveryLog) => {
    setSelectedLog(log);
    setFormOpen(true);
  };

  const handleFeedbackSuccess = () => {
    refetchFeedback();
    refetchPending();
  };

  const getAverageScore = (feedback: PostDiscoveryFeedback) => {
    const scores = [
      feedback.icp_fit_score,
      feedback.pain_severity_score,
      feedback.urgency_score,
      feedback.budget_confidence_score,
      feedback.decision_maker_access_score,
    ];
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  };

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/10</span>
      </div>
      <Progress value={value * 10} className="h-2" />
    </div>
  );

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title="Post Discovery"
          subtitle="Complete and review your discovery call feedback"
        />

        <div className="space-y-6">
        {/* Pending Feedback Section */}
        <Panel title="Pending feedback" aside={pendingLogs && pendingLogs.length > 0 ? <Pill variant="warn">{pendingLogs.length}</Pill> : <Pill variant="ok">All done</Pill>}>
            {isLoadingPending ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : pendingLogs && pendingLogs.length > 0 ? (
              <RowList columns="1fr auto">
                {pendingLogs.map((log) => (
                  <Row key={log.id} focus>
                    <RowName primary={log.client_name} secondary={format(new Date(log.meeting_at), "EEE d MMM, HH:mm")} />
                    <ButtonV2 size="sm" variant="primary" onClick={() => handleOpenFeedbackForm(log)}>Complete feedback</ButtonV2>
                  </Row>
                ))}
              </RowList>
            ) : (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">All caught up. No pending feedback to complete.</p>
            )}
        </Panel>

        {/* Submitted Feedback History */}
        <Panel title="Submitted feedback" aside={submittedFeedback ? <Pill>{submittedFeedback.length}</Pill> : undefined}>
            {submittedFeedback && submittedFeedback.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Call Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Avg Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Admin Rating</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittedFeedback.map((feedback) => (
                    <TableRow key={feedback.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">{feedback.client_name}</TableCell>
                      <TableCell>
                        {format(new Date(feedback.call_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Pill>
                          {feedback.call_type.replace("_", " ")}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        <Pill>{getAverageScore(feedback)}/10</Pill>
                      </TableCell>
                      <TableCell>
                        <Pill variant="ok">
                          {feedback.status === "reviewed" ? (
                            <>
                              Reviewed
                            </>
                          ) : (
                            "Submitted"
                          )}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        {feedback.admin_rating ? (
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < feedback.admin_rating!
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewFeedback(feedback)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No feedback submitted yet.</p>
              </div>
            )}
        </Panel>
      </div>
      </PageContainer>

      {/* Feedback Form */}
      <PostDiscoveryFeedbackForm
        discoveryLog={selectedLog}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={handleFeedbackSuccess}
      />

      {/* View Feedback Sheet */}
      <Sheet open={!!viewFeedback} onOpenChange={() => setViewFeedback(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
          <SheetHeader>
            <SheetTitle>Feedback Details</SheetTitle>
            <SheetDescription>
              {viewFeedback?.client_name} -{" "}
              {viewFeedback && format(new Date(viewFeedback.call_date), "MMM d, yyyy")}
            </SheetDescription>
          </SheetHeader>

          {viewFeedback && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-6 pb-6">
                {/* Call Info */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="text-sm">
                        {format(new Date(viewFeedback.call_date), "PPP 'at' HH:mm")}
                      </span>
                    </div>
                    <Pill>
                      {viewFeedback.call_type.replace("_", " ")}
                    </Pill>
                  </div>
                  <a
                    href={viewFeedback.call_recording_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Recording
                  </a>
                </div>

                {/* Scores */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Scores
                  </h4>
                  <div className="space-y-3">
                    <ScoreBar label="ICP Fit" value={viewFeedback.icp_fit_score} />
                    <ScoreBar label="Pain Severity" value={viewFeedback.pain_severity_score} />
                    <ScoreBar label="Urgency" value={viewFeedback.urgency_score} />
                    <ScoreBar label="Budget Confidence" value={viewFeedback.budget_confidence_score} />
                    <ScoreBar label="Decision-Maker Access" value={viewFeedback.decision_maker_access_score} />
                  </div>
                </div>

                <Separator />

                {/* Notes */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                      <p className="text-sm">{viewFeedback.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Key Pain Points</p>
                      <p className="text-sm whitespace-pre-wrap">{viewFeedback.key_pain_points}</p>
                    </div>
                    {viewFeedback.desired_outcome && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Desired Outcome</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.desired_outcome}</p>
                      </div>
                    )}
                    {viewFeedback.decision_process && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Decision Process</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.decision_process}</p>
                      </div>
                    )}
                    {viewFeedback.objections_raised && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Objections Raised</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.objections_raised}</p>
                      </div>
                    )}
                    {viewFeedback.risks_to_close && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Risks to Close</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.risks_to_close}</p>
                      </div>
                    )}
                    {viewFeedback.next_steps_agreed && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Next Steps</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.next_steps_agreed}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Self-Review */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Self-Review
                  </h4>
                  <div className="space-y-3">
                    {viewFeedback.ae_what_went_well && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">What Went Well</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.ae_what_went_well}</p>
                      </div>
                    )}
                    {viewFeedback.ae_what_to_improve && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">What to Improve</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.ae_what_to_improve}</p>
                      </div>
                    )}
                    {viewFeedback.support_needed_from_ceo && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Support Needed</p>
                        <p className="text-sm whitespace-pre-wrap">{viewFeedback.support_needed_from_ceo}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Review Section */}
                {viewFeedback.status === "reviewed" && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Admin Review
                        </h4>
                      </div>
                      
                      {viewFeedback.admin_rating && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Rating:</span>
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-5 w-5 ${
                                  i < viewFeedback.admin_rating!
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {viewFeedback.admin_commentary && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <p className="text-xs font-medium text-primary mb-2">Commentary</p>
                          <p className="text-sm whitespace-pre-wrap">{viewFeedback.admin_commentary}</p>
                        </div>
                      )}
                      
                      {viewFeedback.coaching_action_items && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                          <p className="text-xs font-medium text-amber-600 mb-2">Coaching Action Items</p>
                          <p className="text-sm whitespace-pre-wrap">{viewFeedback.coaching_action_items}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
