import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import {
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarDays,
  Palmtree,
  Thermometer,
  Heart,
  Send,
  FileUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function EmployeeLeaveForm() {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>("");
  const [leaveDaysAmount, setLeaveDaysAmount] = useState("");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [doctorNoteFile, setDoctorNoteFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["leave-form-profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["my-leave-requests", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("employee_leave_requests")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const layoutRole =
    userRole === "setter" ? "setter" : userRole === "client" ? "client" : "admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || !leaveDaysAmount || !leaveStartDate || !returnDate) {
      toast.error("Please fill out all required fields");
      return;
    }
    if (parseInt(leaveDaysAmount) < 1) {
      toast.error("Leave days must be at least 1");
      return;
    }
    setIsSubmitting(true);
    try {
      let doctorNotePath: string | null = null;
      if (doctorNoteFile && user?.id) {
        const fileExt = doctorNoteFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("doctor-notes")
          .upload(filePath, doctorNoteFile);
        if (uploadError) {
          toast.error("Failed to upload doctor's note: " + uploadError.message);
          setIsSubmitting(false);
          return;
        }
        doctorNotePath = filePath;
      }
      const { error } = await supabase.from("employee_leave_requests").insert({
        user_id: user!.id,
        full_name: profile?.full_name || "Unknown",
        email: profile?.email || user!.email || "",
        reason,
        leave_days_amount: parseInt(leaveDaysAmount),
        leave_start_date: leaveStartDate,
        return_date: returnDate,
        doctor_note_path: doctorNotePath,
      });
      if (error) throw error;
      toast.success("Leave request submitted successfully");
      setReason("");
      setLeaveDaysAmount("");
      setLeaveStartDate("");
      setReturnDate("");
      setDoctorNoteFile(null);
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] });
    } catch (error: any) {
      toast.error("Failed to submit leave request: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
            <XCircle className="h-3 w-3" /> Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        );
    }
  };

  const getReasonLabel = (r: string) => {
    switch (r) {
      case "sick": return "Sick Leave";
      case "holiday": return "Holiday";
      case "family_personal": return "Family / Personal";
      default: return r;
    }
  };

  const reasonOptions = [
    {
      value: "sick",
      label: "Sick Leave",
      description: "Unwell or medical appointment",
      icon: Thermometer,
      gradient: "from-red-500/20 to-red-600/5",
      border: "border-red-500/20",
      activeBorder: "border-red-500/60",
      iconColor: "text-red-400",
    },
    {
      value: "holiday",
      label: "Holiday",
      description: "Annual or planned leave",
      icon: Palmtree,
      gradient: "from-emerald-500/20 to-emerald-600/5",
      border: "border-emerald-500/20",
      activeBorder: "border-emerald-500/60",
      iconColor: "text-emerald-400",
    },
    {
      value: "family_personal",
      label: "Family / Personal",
      description: "Family matters or personal day",
      icon: Heart,
      gradient: "from-violet-500/20 to-violet-600/5",
      border: "border-violet-500/20",
      activeBorder: "border-violet-500/60",
      iconColor: "text-violet-400",
    },
  ];

  return (
    <DashboardLayout role={layoutRole}>
      <PageContainer>
        <PageHeader
          title="Employee Leave Form"
          subtitle="Submit and track your leave requests"
        />

        <div className="space-y-6">
          {/* Form Section */}
          <Card className="overflow-hidden">
            <div className="p-6 pb-2">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                  <CalendarDays className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">New Leave Request</h3>
                  <p className="text-xs text-muted-foreground">Fields marked with * are required</p>
                </div>
              </div>
            </div>
            <CardContent className="pt-2">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Identity Strip */}
                <div className="rounded-xl bg-muted/40 border border-border p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-3">Your Details</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Full Name</Label>
                      <div className="text-sm font-medium text-foreground">{profile?.full_name || "—"}</div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Work Email</Label>
                      <div className="text-sm font-medium text-foreground">{profile?.email || user?.email || "—"}</div>
                    </div>
                  </div>
                </div>

                {/* Reason Cards */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    Reason for Leave <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {reasonOptions.map((opt) => {
                      const isActive = reason === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setReason(opt.value)}
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200 cursor-pointer",
                            "hover:scale-[1.02] hover:shadow-md",
                            isActive
                              ? `bg-gradient-to-b ${opt.gradient} ${opt.activeBorder} shadow-sm`
                              : `bg-card/50 ${opt.border} hover:bg-muted/40`
                          )}
                        >
                          {isActive && (
                            <div className="absolute top-2 right-2">
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            </div>
                          )}
                          <div
                            className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                              isActive ? "bg-background/60" : "bg-muted/50"
                            )}
                          >
                            <opt.icon className={cn("h-5 w-5", opt.iconColor)} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{opt.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dates & Duration Row */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="start_date" className="text-sm">
                      Leave Start Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={leaveStartDate}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="return_date" className="text-sm">
                      Return Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="return_date"
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leave_days" className="text-sm">
                      Total Days <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="leave_days"
                      type="number"
                      min="1"
                      value={leaveDaysAmount}
                      onChange={(e) => setLeaveDaysAmount(e.target.value)}
                      placeholder="e.g. 3"
                      required
                    />
                  </div>
                </div>

                {/* Doctor's Note Upload */}
                <div className="space-y-2">
                  <Label className="text-sm">Doctor's Note <span className="text-muted-foreground text-xs font-normal">(Optional)</span></Label>
                  {!doctorNoteFile ? (
                    <label
                      htmlFor="doctor_note"
                      className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-muted/20 hover:bg-muted/30 cursor-pointer transition-all duration-200 group"
                    >
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                        <FileUp className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Upload Document</p>
                        <p className="text-[11px] text-muted-foreground">PDF, JPG, PNG, DOC – Max 10MB</p>
                      </div>
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileUp className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doctorNoteFile.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(doctorNoteFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDoctorNoteFile(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <input
                    id="doctor_note"
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => setDoctorNoteFile(e.target.files?.[0] || null)}
                  />
                </div>

                {/* Submit */}
                <Button type="submit" disabled={isSubmitting} className="w-full gap-2 h-11">
                  <Send className="h-4 w-4" />
                  {isSubmitting ? "Submitting..." : "Submit Leave Request"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Request History */}
          {leaveRequests.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground px-1">Previous Requests</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {leaveRequests.map((req: any) => (
                  <Card key={req.id} className="relative overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{getReasonLabel(req.reason)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(req.leave_start_date), "MMM dd")} – {format(new Date(req.return_date), "MMM dd, yyyy")}
                          </p>
                        </div>
                        {getStatusBadge(req.status)}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {req.leave_days_amount} day{req.leave_days_amount !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(req.created_at), "MMM dd")}
                        </span>
                      </div>
                      {req.admin_notes && (
                        <p className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 border border-border">
                          {req.admin_notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
