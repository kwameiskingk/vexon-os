import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format, addMonths, differenceInDays, parseISO } from "date-fns";
import { getTitleLabel, getTitleBadgeClasses } from "@/lib/setterTitles";
import {
  Mail,
  Phone,
  Calendar,
  Building2,
  FileText,
  DollarSign,
  Clock,
  Save,
  AlertCircle,
  Cake,
  ShieldAlert,
  Timer,
} from "lucide-react";


interface EmployeeOverviewTabProps {
  employee: any;
}

export function EmployeeOverviewTab({ employee }: EmployeeOverviewTabProps) {
  const queryClient = useQueryClient();
  const [hrNotes, setHrNotes] = useState(employee.setterProfile?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [birthday, setBirthday] = useState<string>(employee.birthday || '');
  const sp = employee.setterProfile;
  const [onProbation, setOnProbation] = useState<boolean>(sp?.on_probation ?? true);
  const [probationStart, setProbationStart] = useState<string>(
    sp?.probation_start_date || sp?.start_date || ''
  );
  const [hourlyFormEnabled, setHourlyFormEnabled] = useState<boolean>(!!sp?.hourly_form_enabled);

  useEffect(() => {
    setBirthday(employee.birthday || '');
    setOnProbation(sp?.on_probation ?? true);
    setProbationStart(sp?.probation_start_date || sp?.start_date || '');
    setHourlyFormEnabled(!!sp?.hourly_form_enabled);
  }, [employee.id, employee.birthday, sp?.on_probation, sp?.probation_start_date, sp?.start_date, sp?.hourly_form_enabled]);

  // Fetch quick stats
  const { data: stats } = useQuery({
    queryKey: ['employee-quick-stats', employee.id, employee.setterId],

    queryFn: async () => {
      const stats = {
        documentsExpiringCount: 0,
        pendingPayslipsCount: 0,
        attendanceThisMonth: { present: 0, late: 0, absent: 0, total: 0 }
      };

      if (employee.setterId) {
        // Count expiring documents (within 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        const { count: expiringCount } = await supabase
          .from('employee_documents')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employee.setterId)
          .not('expiry_date', 'is', null)
          .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0]);
        
        stats.documentsExpiringCount = expiringCount || 0;

        // Count unsent payslips
        const { count: pendingCount } = await supabase
          .from('employee_payslips')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', employee.setterId)
          .is('sent_date', null);
        
        stats.pendingPayslipsCount = pendingCount || 0;

        // Get attendance this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const { data: attendanceData } = await supabase
          .from('employee_attendance')
          .select('status')
          .eq('employee_id', employee.setterId)
          .gte('date', startOfMonth.toISOString().split('T')[0]);
        
        if (attendanceData) {
          stats.attendanceThisMonth = {
            present: attendanceData.filter(a => a.status === 'present').length,
            late: attendanceData.filter(a => a.status === 'late').length,
            absent: attendanceData.filter(a => a.status === 'absent').length,
            total: attendanceData.length
          };
        }
      }

      return stats;
    }
  });

  // Fetch onboarding progress
  const { data: onboarding } = useQuery({
    queryKey: ['employee-onboarding', employee.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('employee_onboarding')
        .select('*')
        .eq('user_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return data;
    }
  });

  // Save HR notes mutation
  const saveNotes = useMutation({
    mutationFn: async (notes: string) => {
      if (!employee.setterId) {
        throw new Error('No setter profile to update');
      }
      
      const { error } = await supabase
        .from('setters_profiles')
        .update({ notes })
        .eq('id', employee.setterId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-profile', employee.id] });
      toast.success('Notes saved');
      setIsSaving(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save notes');
      setIsSaving(false);
    }
  });

  const handleSaveNotes = () => {
    setIsSaving(true);
    saveNotes.mutate(hrNotes);
  };

  const saveBirthday = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ birthday: value || null })
        .eq('id', employee.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-profile', employee.id] });
      toast.success('Birthday saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save birthday'),
  });

  const saveSetterFields = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (!employee.setterId) throw new Error('Not a setter profile');
      const { error } = await supabase
        .from('setters_profiles')
        .update(patch)
        .eq('id', employee.setterId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-profile', employee.id] });
      toast.success('Saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save'),
  });

  const probationEnd = probationStart
    ? addMonths(parseISO(probationStart), 3)
    : null;
  const daysLeft = probationEnd ? differenceInDays(probationEnd, new Date()) : null;

  const displayDate = (value?: string | null) => {
    if (!value) return '—';
    return format(parseISO(value), 'dd MMM yyyy');
  };


  const onboardingStages: Record<string, { label: string; order: number }> = {
    offer_accepted: { label: 'Offer Accepted', order: 1 },
    documents_pending: { label: 'Documents Pending', order: 2 },
    training: { label: 'Training', order: 3 },
    shadowing: { label: 'Shadowing', order: 4 },
    active: { label: 'Active', order: 5 }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Contact & Employment Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Employment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{employee.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{employee.phone || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p className="font-medium">{displayDate(employee.start_date || employee.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Birthday</p>
              <p className="font-medium">{displayDate(employee.birthday)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium capitalize">{employee.role?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Department</p>
              <p className="font-medium capitalize">{employee.department}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge 
                className={employee.active 
                  ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' 
                  : 'bg-gray-500/15 text-gray-500 border-gray-500/30'
                }
              >
                {employee.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {employee.role === 'setter' && employee.setterProfile && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Level</p>
                  <Badge className={getTitleBadgeClasses(employee.setterProfile.title)}>
                    {getTitleLabel(employee.setterProfile.title)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Per Meeting Bonus</p>
                  <p className="font-medium">${employee.setterProfile.per_meeting_bonus || 50}</p>
                </div>
              </>
            )}
            {employee.setterProfile && (
              <div>
                <p className="text-sm text-muted-foreground">Probation</p>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const isCompleted = onProbation && probationEnd && (daysLeft ?? 0) <= 0;
                    if (!onProbation) {
                      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Off Probation</Badge>;
                    }
                    if (isCompleted) {
                      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Completed</Badge>;
                    }
                    return (
                      <>
                        <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">On Probation</Badge>
                        {probationEnd && (
                          <span className="text-xs text-muted-foreground">until {format(probationEnd, 'dd MMM yyyy')}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-center gap-1 mb-1">
                <FileText className="h-4 w-4 text-amber-500" />
                {stats?.documentsExpiringCount > 0 && (
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                )}
              </div>
              <p className="text-2xl font-bold">{stats?.documentsExpiringCount || 0}</p>
              <p className="text-xs text-muted-foreground">Docs Expiring</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <DollarSign className="h-4 w-4 mx-auto mb-1 text-blue-500" />
              <p className="text-2xl font-bold">{stats?.pendingPayslipsCount || 0}</p>
              <p className="text-xs text-muted-foreground">Pending Payslips</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <Clock className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
              <p className="text-2xl font-bold">
                {stats?.attendanceThisMonth.present || 0}
                <span className="text-sm text-muted-foreground">/{stats?.attendanceThisMonth.total || 0}</span>
              </p>
              <p className="text-xs text-muted-foreground">Present This Month</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Onboarding Progress */}
      {onboarding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Onboarding Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Stage</span>
                <Badge variant="outline">{onboardingStages[onboarding.stage]?.label || onboarding.stage}</Badge>
              </div>
              <div className="flex gap-1">
                {Object.entries(onboardingStages).map(([key, { label, order }]) => {
                  const currentOrder = onboardingStages[onboarding.stage]?.order || 0;
                  const isComplete = order < currentOrder;
                  const isCurrent = order === currentOrder;
                  
                  return (
                    <div 
                      key={key}
                      className={`flex-1 h-2 rounded-full ${
                        isComplete ? 'bg-emerald-500' :
                        isCurrent ? 'bg-primary' :
                        'bg-muted'
                      }`}
                      title={label}
                    />
                  );
                })}
              </div>
              {onboarding.notes && (
                <p className="text-sm text-muted-foreground mt-2">{onboarding.notes}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* HR Notes */}
      <Card className={onboarding ? '' : 'lg:col-span-1'}>
        <CardHeader>
          <CardTitle className="text-lg">HR Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Textarea
              value={hrNotes}
              onChange={(e) => setHrNotes(e.target.value)}
              placeholder="Add notes about this employee..."
              className="min-h-[120px]"
            />
            <Button 
              size="sm" 
              onClick={handleSaveNotes}
              disabled={isSaving || !employee.setterId}
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Notes'}
            </Button>
            {!employee.setterId && (
              <p className="text-xs text-muted-foreground">Notes unavailable for non-setter roles</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Birthday + HR Settings (probation, hourly form) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            HR Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Birthday */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Cake className="h-4 w-4 text-pink-500" />Birthday</Label>
              <Input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Triggers a team-wide birthday notification on the day.</p>
            </div>
            <div>
              <Button size="sm" onClick={() => saveBirthday.mutate(birthday)} disabled={saveBirthday.isPending}>
                <Save className="h-4 w-4 mr-2" />Save Birthday
              </Button>
            </div>
          </div>

          {employee.setterId && (
            <>
              {/* Probation */}
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><Timer className="h-4 w-4 text-amber-500" />On Probation</Label>
                  <Switch
                    checked={onProbation}
                    onCheckedChange={(v) => {
                      setOnProbation(v);
                      saveSetterFields.mutate({ on_probation: v });
                    }}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <div className="space-y-2">
                    <Label>Probation Start Date</Label>
                    <Input
                      type="date"
                      value={probationStart}
                      onChange={(e) => setProbationStart(e.target.value)}
                      disabled={!onProbation}
                    />
                    <p className="text-xs text-muted-foreground">Defaults to employee start date. Probation is 3 months.</p>
                  </div>
                  <div className="space-y-1">
                    {onProbation && probationEnd ? (
                      <>
                        <p className="text-sm text-muted-foreground">Probation Ends</p>
                        <p className="font-medium">{format(probationEnd, 'dd MMM yyyy')}</p>
                        <Badge className={
                          daysLeft! < 0
                            ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                            : daysLeft! <= 14
                              ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                              : 'bg-blue-500/15 text-blue-500 border-blue-500/30'
                        }>
                          {daysLeft! < 0 ? 'Completed' : `${daysLeft} days left`}
                        </Badge>
                      </>
                    ) : (
                      <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Off Probation</Badge>
                    )}
                  </div>
                </div>
                {onProbation && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveSetterFields.mutate({ probation_start_date: probationStart || null })}
                    disabled={saveSetterFields.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />Save Probation Start
                  </Button>
                )}
              </div>

              {/* Hourly Form Toggle */}
              <div className="space-y-2 p-4 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-500" />Hourly Form Required</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      When on, this setter sees the hourly form in Forms and gets hourly task instances in Tasks &amp; Responsibilities — independent of PIP status.
                    </p>
                  </div>
                  <Switch
                    checked={hourlyFormEnabled}
                    onCheckedChange={(v) => {
                      setHourlyFormEnabled(v);
                      saveSetterFields.mutate({ hourly_form_enabled: v });
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

