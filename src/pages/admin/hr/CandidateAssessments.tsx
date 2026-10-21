import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { 
  ClipboardList, 
  Star, 
  X, 
  ArrowRight, 
  ChevronDown,
  User,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  FileText,
  MessageSquare
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { parseAssessmentToQA, parsePayloadToQA, type QAPair } from "@/lib/assessmentParser";

type AssessmentStatus = "new" | "shortlisted" | "invited" | "rejected" | "hired" | "moved_to_pipeline";

interface CandidateAssessment {
  id: string;
  external_submission_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role_applied: string | null;
  submitted_at_raw: string | null;
  assessment_pretty_text: string | null;
  assessment_payload: Record<string, unknown> | null;
  source: string | null;
  status: AssessmentStatus;
  created_at: string;
  updated_at: string;
}

const statusColors: Record<AssessmentStatus, string> = {
  new: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  shortlisted: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  invited: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  hired: "bg-green-500/20 text-green-400 border-green-500/30",
  moved_to_pipeline: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const statusLabels: Record<AssessmentStatus, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  invited: "Invited",
  rejected: "Rejected",
  hired: "Hired",
  moved_to_pipeline: "In Pipeline",
};

// Q&A Display Component
function AssessmentQASection({ 
  prettyText, 
  payload 
}: { 
  prettyText: string | null; 
  payload: Record<string, unknown> | null;
}) {
  const qaPairs = useMemo(() => {
    // Try payload first, then fall back to pretty text
    const payloadPairs = parsePayloadToQA(payload);
    if (payloadPairs.length > 0) {
      return payloadPairs;
    }
    return parseAssessmentToQA(prettyText);
  }, [prettyText, payload]);

  if (qaPairs.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Assessment Responses
        </h3>
        <div className="bg-muted/50 rounded-lg p-6 text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No assessment data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Assessment Responses
        <Badge variant="secondary" className="ml-auto text-xs">
          {qaPairs.length} questions
        </Badge>
      </h3>
      <ScrollArea className="h-[400px] rounded-lg border border-border">
        <div className="divide-y divide-border">
          {qaPairs.map((qa, index) => (
            <div 
              key={index} 
              className={`p-3 ${index % 2 === 0 ? 'bg-muted/30' : 'bg-background'}`}
            >
              <div className="flex gap-2 mb-1">
                <span className="text-xs font-semibold text-primary shrink-0">Q:</span>
                <span className="text-sm text-muted-foreground">{qa.question}</span>
              </div>
              <div className="flex gap-2 pl-0">
                <span className="text-xs font-semibold text-emerald-500 shrink-0">A:</span>
                <span className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {qa.answer}
                </span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function CandidateAssessments() {
  const [statusFilter, setStatusFilter] = useState<AssessmentStatus | "all">("new");
  const [selectedAssessment, setSelectedAssessment] = useState<CandidateAssessment | null>(null);
  const [isPayloadOpen, setIsPayloadOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: assessments, isLoading } = useQuery({
    queryKey: ["candidate-assessments", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("candidate_assessments")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CandidateAssessment[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AssessmentStatus }) => {
      const { error } = await supabase
        .from("candidate_assessments")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-assessments"] });
      toast.success("Status updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update status: " + error.message);
    },
  });

  const moveToHiringMutation = useMutation({
    mutationFn: async (assessment: CandidateAssessment) => {
      // Check if candidate already exists in hiring pipeline
      const { data: existingCandidate } = await supabase
        .from("candidates")
        .select("id")
        .eq("email", assessment.email)
        .maybeSingle();

      if (!existingCandidate) {
        // Create candidate in hiring pipeline
        const { error: insertError } = await supabase
          .from("candidates")
          .insert({
            first_name: assessment.full_name?.split(" ")[0] || "Unknown",
            last_name: assessment.full_name?.split(" ").slice(1).join(" ") || "",
            email: assessment.email || "",
            mobile_phone: assessment.phone,
            date_of_call: new Date().toISOString().split("T")[0],
            status: "to_call_ceo",
            notes: `Imported from JotForm assessment. Role: ${assessment.role_applied || "N/A"}`,
          });
        if (insertError) throw insertError;
      }

      // Update assessment status
      const { error: updateError } = await supabase
        .from("candidate_assessments")
        .update({ status: "moved_to_pipeline" })
        .eq("id", assessment.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidate-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate moved to Hiring Management pipeline");
      setSelectedAssessment(null);
    },
    onError: (error) => {
      toast.error("Failed to move candidate: " + error.message);
    },
  });

  const handleStatusChange = (status: AssessmentStatus) => {
    if (selectedAssessment) {
      updateStatusMutation.mutate({ id: selectedAssessment.id, status });
      setSelectedAssessment({ ...selectedAssessment, status });
    }
  };

  const formatSubmittedDate = (rawDate: string | null, createdAt: string) => {
    if (rawDate) {
      try {
        // Try to parse as ISO date first
        const date = parseISO(rawDate);
        if (!isNaN(date.getTime())) {
          return format(date, "MMM d, yyyy h:mm a");
        }
        // If it's a timestamp number
        const timestamp = parseInt(rawDate);
        if (!isNaN(timestamp)) {
          return format(new Date(timestamp * 1000), "MMM d, yyyy h:mm a");
        }
        return rawDate;
      } catch {
        return rawDate;
      }
    }
    return format(parseISO(createdAt), "MMM d, yyyy h:mm a");
  };

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <PageHeader title="Candidate Assessments" />
        <p className="text-muted-foreground -mt-4">
          Review and manage JotForm submissions from job applicants
        </p>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                Submissions
              </CardTitle>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as AssessmentStatus | "all")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="shortlisted">Shortlisted</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="hired">Hired</SelectItem>
                  <SelectItem value="moved_to_pipeline">In Pipeline</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : assessments && assessments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Role Applied</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => (
                    <TableRow
                      key={assessment.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedAssessment(assessment)}
                    >
                      <TableCell className="font-medium">
                        {assessment.full_name || "—"}
                      </TableCell>
                      <TableCell>{assessment.role_applied || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {assessment.email || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {assessment.phone || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[assessment.status]}>
                          {statusLabels[assessment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatSubmittedDate(assessment.submitted_at_raw, assessment.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No assessments found</p>
                <p className="text-sm mt-1">
                  {statusFilter === "new"
                    ? "New submissions will appear here"
                    : "No assessments match this filter"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Sheet */}
        <Sheet open={!!selectedAssessment} onOpenChange={() => setSelectedAssessment(null)}>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            {selectedAssessment && (
              <>
                <SheetHeader className="mb-6">
                  <SheetTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    {selectedAssessment.full_name || "Unknown Candidate"}
                  </SheetTitle>
                  <Badge className={`w-fit ${statusColors[selectedAssessment.status]}`}>
                    {statusLabels[selectedAssessment.status]}
                  </Badge>
                </SheetHeader>

                <div className="space-y-6">
                  {/* Contact Info */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Contact Information
                    </h3>
                    <div className="space-y-2">
                      {selectedAssessment.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${selectedAssessment.email}`} className="text-primary hover:underline">
                            {selectedAssessment.email}
                          </a>
                        </div>
                      )}
                      {selectedAssessment.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedAssessment.phone}</span>
                        </div>
                      )}
                      {selectedAssessment.role_applied && (
                        <div className="flex items-center gap-2 text-sm">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedAssessment.role_applied}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {formatSubmittedDate(
                            selectedAssessment.submitted_at_raw,
                            selectedAssessment.created_at
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Assessment Q&A Section */}
                  <AssessmentQASection 
                    prettyText={selectedAssessment.assessment_pretty_text}
                    payload={selectedAssessment.assessment_payload}
                  />

                  {/* Raw Payload */}
                  {selectedAssessment.assessment_payload && (
                    <Collapsible open={isPayloadOpen} onOpenChange={setIsPayloadOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between px-0">
                          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                            Raw Submission Data
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isPayloadOpen ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-x-auto max-h-64 overflow-y-auto">
                          {JSON.stringify(selectedAssessment.assessment_payload, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Status Control */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Update Status
                    </h3>
                    <Select
                      value={selectedAssessment.status}
                      onValueChange={(value) => handleStatusChange(value as AssessmentStatus)}
                      disabled={updateStatusMutation.isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="shortlisted">Shortlisted</SelectItem>
                        <SelectItem value="invited">Invited to Interview</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="hired">Hired</SelectItem>
                        <SelectItem value="moved_to_pipeline">In Pipeline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Quick Actions
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                        onClick={() => handleStatusChange("shortlisted")}
                        disabled={selectedAssessment.status === "shortlisted" || updateStatusMutation.isPending}
                      >
                        <Star className="h-4 w-4 mr-1" />
                        Shortlist Candidate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                        onClick={() => handleStatusChange("invited")}
                        disabled={selectedAssessment.status === "invited" || updateStatusMutation.isPending}
                      >
                        <Calendar className="h-4 w-4 mr-1" />
                        Invite to Interview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                        onClick={() => handleStatusChange("rejected")}
                        disabled={selectedAssessment.status === "rejected" || updateStatusMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject Candidate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                        onClick={() => moveToHiringMutation.mutate(selectedAssessment)}
                        disabled={
                          selectedAssessment.status === "moved_to_pipeline" || 
                          moveToHiringMutation.isPending
                        }
                      >
                        <ArrowRight className="h-4 w-4 mr-1" />
                        Move to Hiring Management
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </DashboardLayout>
  );
}
