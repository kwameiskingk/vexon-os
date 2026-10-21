import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  TARGET_DEFAULTS,
  canEditSetterTargets,
  fetchSetterTargets,
  upsertSetterTargets,
} from "@/hooks/useSetterTargets";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Mail,
  Phone,
  Target,
  TrendingUp,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { ClientAssignmentSection } from "./ClientAssignmentSection";

interface SetterProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  department: string;
  active: boolean;
  notes: string | null;
  created_at: string;
}

interface PerformanceData {
  dials_made: number;
  meetings_booked: number;
  conversations: number;
  talk_time: number;
}

interface SetterDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setter: SetterProfile | null;
  onUpdate: () => void;
}

type LoadedSnapshot = {
  notes: string;
  dailyDialsTarget: number;
  dailyMeetingsTarget: number;
  dailyTalkTimeTarget: number;
  weeklyMeetingsTarget: number;
  perMeetingBonus: number;
  commissionEarned: number;
  meetingsSat: number;
  autoCalculateCommission: boolean;
};

export function SetterDetailDrawer({ open, onOpenChange, setter, onUpdate }: SetterDetailDrawerProps) {
  const { user, userRoles } = useAuth();
  const canEditTargets = canEditSetterTargets(userRoles);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const loadedSnapshotRef = useRef<LoadedSnapshot | null>(null);

  const [recentPerformance, setRecentPerformance] = useState<PerformanceData | null>(null);
  const [thisMonthMeetings, setThisMonthMeetings] = useState(0);

  // Compensation & Targets state
  const [dailyDialsTarget, setDailyDialsTarget] = useState(TARGET_DEFAULTS.fulfilment.daily_dials_target);
  const [dailyMeetingsTarget, setDailyMeetingsTarget] = useState(TARGET_DEFAULTS.fulfilment.daily_meetings_target);
  const [dailyTalkTimeTarget, setDailyTalkTimeTarget] = useState(TARGET_DEFAULTS.fulfilment.daily_talk_time_target);
  const [weeklyMeetingsTarget, setWeeklyMeetingsTarget] = useState(TARGET_DEFAULTS.fulfilment.weekly_meetings_target);
  const [perMeetingBonus, setPerMeetingBonus] = useState(25);

  // Dashboard metrics state
  const [commissionEarned, setCommissionEarned] = useState(0);
  const [meetingsSat, setMeetingsSat] = useState(0);
  const [autoCalculateCommission, setAutoCalculateCommission] = useState(true);

  const markDirty = () => setIsDirty(true);

  useEffect(() => {
    if (!setter) return;

    // Set immediate UI values from the list row while we fetch authoritative DB values.
    setNotes(setter.notes || "");

    void loadPerformanceData();
    void loadSetterSettings();
  }, [setter]);

  const loadSetterSettings = async () => {
    if (!setter) return;

    const [{ data, error }, targets] = await Promise.all([
      supabase
        .from("setters_profiles")
        .select("notes, commission_earned, meetings_sat, per_meeting_bonus")
        .eq("id", setter.id)
        .single(),
      fetchSetterTargets(setter.id),
    ]);

    if (error) {
      console.error("Error loading setter settings:", error);
      return;
    }

    if (!data) return;

    const loadedCommission = Number(data.commission_earned ?? 0);
    const loadedMeetingsSat = Number(data.meetings_sat ?? 0);
    const loadedPerMeetingBonus = Number(data.per_meeting_bonus ?? 50);
    const loadedWeeklyMeetingsTarget = targets.weekly_meetings_target;
    const loadedDailyDialsTarget = targets.daily_dials_target;
    const loadedDailyMeetingsTarget = targets.daily_meetings_target;
    const loadedDailyTalkTimeTarget = targets.daily_talk_time_target;

    // If commission matches calculated value, we're in auto mode
    const calculatedCommission = loadedMeetingsSat * loadedPerMeetingBonus;
    const auto = Math.abs(loadedCommission - calculatedCommission) < 0.01;

    setNotes(data.notes || "");
    setCommissionEarned(loadedCommission);
    setMeetingsSat(loadedMeetingsSat);
    setPerMeetingBonus(loadedPerMeetingBonus);
    setWeeklyMeetingsTarget(loadedWeeklyMeetingsTarget);
    setDailyDialsTarget(loadedDailyDialsTarget);
    setDailyMeetingsTarget(loadedDailyMeetingsTarget);
    setDailyTalkTimeTarget(loadedDailyTalkTimeTarget);
    setAutoCalculateCommission(auto);

    loadedSnapshotRef.current = {
      notes: data.notes || "",
      commissionEarned: loadedCommission,
      meetingsSat: loadedMeetingsSat,
      perMeetingBonus: loadedPerMeetingBonus,
      weeklyMeetingsTarget: loadedWeeklyMeetingsTarget,
      dailyDialsTarget: loadedDailyDialsTarget,
      dailyMeetingsTarget: loadedDailyMeetingsTarget,
      dailyTalkTimeTarget: loadedDailyTalkTimeTarget,
      autoCalculateCommission: auto,
    };

    setIsDirty(false);
  };

  const loadPerformanceData = async () => {
    if (!setter) return;

    try {
      // Get recent performance (last 7 days)
      const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const { data: perfData } = await supabase
        .from("performance")
        .select("dials_made, meetings_booked, conversations, talk_time")
        .eq("email", setter.email)
        .gte("date", sevenDaysAgo);

      if (perfData && perfData.length > 0) {
        const totals = perfData.reduce(
          (acc, day) => ({
            dials_made: acc.dials_made + (day.dials_made || 0),
            meetings_booked: acc.meetings_booked + (day.meetings_booked || 0),
            conversations: acc.conversations + (day.conversations || 0),
            talk_time: acc.talk_time + (day.talk_time || 0),
          }),
          { dials_made: 0, meetings_booked: 0, conversations: 0, talk_time: 0 }
        );

        setRecentPerformance(totals);
      }

      // Get this month's meetings
      const startOfMonth = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
      const { data: monthData } = await supabase
        .from("performance")
        .select("meetings_booked")
        .eq("email", setter.email)
        .gte("date", startOfMonth);

      if (monthData) {
        const total = monthData.reduce((sum, day) => sum + (day.meetings_booked || 0), 0);
        setThisMonthMeetings(total);
      }
    } catch (error) {
      console.error("Error loading performance data:", error);
    }
  };

  const handleSave = async (opts?: { suppressToast?: boolean }) => {
    if (!setter) return;

    setIsSaving(true);
    try {
      // Calculate commission if auto mode
      const finalCommission = autoCalculateCommission ? meetingsSat * perMeetingBonus : commissionEarned;

      const { data, error } = await supabase
        .from("setters_profiles")
        .update({
          notes,
          commission_earned: finalCommission,
          meetings_sat: meetingsSat,
          per_meeting_bonus: perMeetingBonus,
        })
        .eq("id", setter.id)
        // IMPORTANT: .select() ensures we can detect no-op updates and sync UI to persisted values.
        .select("notes, commission_earned, meetings_sat, per_meeting_bonus")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Update returned no row. (Setter ID mismatch or RLS.)");

      // Targets are written to setter_targets (admin/dev only — inputs are
      // gated, so skip the upsert entirely for read-only roles).
      if (canEditTargets) {
        await upsertSetterTargets(
          setter.id,
          {
            daily_dials_target: dailyDialsTarget,
            daily_meetings_target: dailyMeetingsTarget,
            daily_talk_time_target: dailyTalkTimeTarget,
            weekly_meetings_target: weeklyMeetingsTarget,
          },
          user?.id
        );
      }

      const persistedCommission = Number(data.commission_earned ?? 0);
      const persistedMeetingsSat = Number(data.meetings_sat ?? 0);
      const persistedPerMeetingBonus = Number(data.per_meeting_bonus ?? 50);
      const persistedWeeklyMeetingsTarget = weeklyMeetingsTarget;
      const persistedDailyDialsTarget = dailyDialsTarget;
      const persistedDailyMeetingsTarget = dailyMeetingsTarget;
      const persistedDailyTalkTimeTarget = dailyTalkTimeTarget;

      setNotes(data.notes || "");
      setCommissionEarned(persistedCommission);
      setMeetingsSat(persistedMeetingsSat);
      setPerMeetingBonus(persistedPerMeetingBonus);
      setWeeklyMeetingsTarget(persistedWeeklyMeetingsTarget);
      setDailyDialsTarget(persistedDailyDialsTarget);
      setDailyMeetingsTarget(persistedDailyMeetingsTarget);
      setDailyTalkTimeTarget(persistedDailyTalkTimeTarget);

      // Keep auto/manual selection as the admin chose.
      loadedSnapshotRef.current = {
        notes: data.notes || "",
        commissionEarned: persistedCommission,
        meetingsSat: persistedMeetingsSat,
        perMeetingBonus: persistedPerMeetingBonus,
        weeklyMeetingsTarget: persistedWeeklyMeetingsTarget,
        dailyDialsTarget: persistedDailyDialsTarget,
        dailyMeetingsTarget: persistedDailyMeetingsTarget,
        dailyTalkTimeTarget: persistedDailyTalkTimeTarget,
        autoCalculateCommission,
      };

      setIsDirty(false);
      onUpdate();

      if (!opts?.suppressToast) toast.success("Setter targets saved");
    } catch (error) {
      console.error("Error saving setter profile:", error);
      toast.error("Failed to save targets");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDrawerOpenChange = async (nextOpen: boolean) => {
    // If admin closes the drawer with unsaved edits, auto-save.
    if (!nextOpen && isDirty && !isSaving) {
      await handleSave({ suppressToast: true });
    }
    onOpenChange(nextOpen);
  };

  const formatTalkTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (!setter) return null;

  return (
    <Sheet open={open} onOpenChange={handleDrawerOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-xl">{setter.full_name || setter.email}</SheetTitle>
              <p className="text-sm text-muted-foreground">{setter.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={setter.active ? "default" : "secondary"}>
                  {setter.active ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {setter.department}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className={`w-full mb-4 grid ${setter.department === "fulfilment" ? "grid-cols-4" : "grid-cols-3"}`}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {setter.department === "fulfilment" && <TabsTrigger value="client">Client</TabsTrigger>}
            <TabsTrigger value="compensation">Compensation</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">This Month</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-primary/10">
                  <p className="text-2xl font-bold text-primary">{thisMonthMeetings}</p>
                  <p className="text-xs text-muted-foreground">Meetings Booked</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/30">
                  <p className="text-2xl font-bold">{recentPerformance?.dials_made || 0}</p>
                  <p className="text-xs text-muted-foreground">Dials (7 days)</p>
                </div>
              </div>
            </Card>

            {recentPerformance && (
              <Card className="glass-card p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Last 7 Days
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dials</span>
                    <span className="font-medium">{recentPerformance.dials_made}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Meetings</span>
                    <span className="font-medium">{recentPerformance.meetings_booked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversations</span>
                    <span className="font-medium">{recentPerformance.conversations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Talk Time</span>
                    <span className="font-medium">{formatTalkTime(recentPerformance.talk_time)}</span>
                  </div>
                </div>
              </Card>
            )}

            <Card className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Contact</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{setter.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Joined {format(new Date(setter.created_at), "MMM d, yyyy")}</span>
                </div>
              </div>
            </Card>
          </TabsContent>

          {setter.department === "fulfilment" && (
            <TabsContent value="client" className="space-y-4">
              <ClientAssignmentSection
                setterId={setter.id}
                setterUserId={setter.user_id}
                department={setter.department}
                onUpdate={onUpdate}
              />
            </TabsContent>
          )}

          <TabsContent value="compensation" className="space-y-4">
            <Card className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Daily Targets
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                These targets power the achievement system and progress tracking.
                {!canEditTargets && " Targets are set by the CEO."}
              </p>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs flex items-center gap-2">
                    <Phone className="h-3 w-3" />
                    Daily Dials Target
                  </Label>
                  <Input
                    type="number"
                    value={dailyDialsTarget}
                    onChange={(e) => {
                      setDailyDialsTarget(Number(e.target.value));
                      markDirty();
                    }}
                    className="mt-1"
                    min={0}
                    disabled={!canEditTargets}
                  />
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    Daily Meetings Target
                  </Label>
                  <Input
                    type="number"
                    value={dailyMeetingsTarget}
                    onChange={(e) => {
                      setDailyMeetingsTarget(Number(e.target.value));
                      markDirty();
                    }}
                    className="mt-1"
                    min={0}
                    disabled={!canEditTargets}
                  />
                </div>

                <div>
                  <Label className="text-xs flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    Daily Talk Time Target (minutes)
                  </Label>
                  <Input
                    type="number"
                    value={dailyTalkTimeTarget}
                    onChange={(e) => {
                      setDailyTalkTimeTarget(Number(e.target.value));
                      markDirty();
                    }}
                    className="mt-1"
                    min={0}
                    disabled={!canEditTargets}
                  />
                </div>
              </div>
            </Card>

            <Card className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Weekly Target & Bonus
              </h3>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Weekly Meetings Target</Label>
                  <Input
                    type="number"
                    value={weeklyMeetingsTarget}
                    onChange={(e) => {
                      setWeeklyMeetingsTarget(Number(e.target.value));
                      markDirty();
                    }}
                    className="mt-1"
                    min={0}
                    disabled={!canEditTargets}
                  />
                  {!canEditTargets && (
                    <p className="text-xs text-muted-foreground mt-1">Targets are set by the CEO</p>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Per-Meeting Bonus ($)</Label>
                  <Input
                    type="number"
                    value={perMeetingBonus}
                    onChange={(e) => {
                      setPerMeetingBonus(Number(e.target.value));
                      markDirty();
                    }}
                    className="mt-1"
                    min={0}
                  />
                </div>
              </div>
            </Card>

            <Card className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Dashboard Metrics
              </h3>
              <p className="text-xs text-muted-foreground mb-4">These values are displayed on the setter's dashboard.</p>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Commission Earned This Month ($)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {autoCalculateCommission ? "Auto-calculated from meetings × bonus" : "Manually set"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Auto</span>
                    <Switch
                      checked={autoCalculateCommission}
                      onCheckedChange={(checked) => {
                        setAutoCalculateCommission(checked);
                        if (checked) {
                          setCommissionEarned(meetingsSat * perMeetingBonus);
                        }
                        markDirty();
                      }}
                    />
                  </div>
                </div>

                <Input
                  type="number"
                  value={autoCalculateCommission ? meetingsSat * perMeetingBonus : commissionEarned}
                  onChange={(e) => {
                    setCommissionEarned(Number(e.target.value));
                    markDirty();
                  }}
                  disabled={autoCalculateCommission}
                  className={autoCalculateCommission ? "bg-muted/30" : ""}
                />

                <div>
                  <Label className="text-xs">Meetings Sat</Label>
                  <Input
                    type="number"
                    value={meetingsSat}
                    onChange={(e) => {
                      const newVal = Number(e.target.value);
                      setMeetingsSat(newVal);
                      if (autoCalculateCommission) {
                        setCommissionEarned(newVal * perMeetingBonus);
                      }
                      markDirty();
                    }}
                    className="mt-1"
                    min={0}
                  />
                </div>
              </div>
            </Card>

            <Button onClick={() => handleSave()} disabled={isSaving} className="w-full">
              {isSaving ? "Saving..." : "Save All Changes"}
            </Button>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <Card className="glass-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Admin Notes
              </h3>
              <Textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  markDirty();
                }}
                placeholder="Add notes about this setter..."
                className="min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground mt-2">Notes are only visible to admins and management.</p>
            </Card>

            <Button onClick={() => handleSave()} disabled={isSaving} className="w-full">
              {isSaving ? "Saving..." : "Save Notes"}
            </Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
