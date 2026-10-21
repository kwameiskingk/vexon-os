import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, FileText, Download, Trash2, Upload, Check, DollarSign, Calendar, PoundSterling, TrendingUp } from "lucide-react";
import { PayrollDetailsSection } from "./PayrollDetailsSection";
import { EmployeeCustomBonusesSection } from "./EmployeeCustomBonusesSection";
import { useAuth } from "@/contexts/AuthContext";
import { useCapability } from "@/hooks/useCapability";
import { getCommissionCycleDates } from "@/utils/commissionCycle";

interface EmployeePayrollTabProps {
  employee: any;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function EmployeePayrollTab({ employee }: EmployeePayrollTabProps) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    month: '',
    year: new Date().getFullYear().toString(),
    amount: ''
  });

  const isAE = employee?.role === 'account_executive';
  const isSetter = employee?.role === 'setter';
  const employeeUserId: string | undefined = employee?.id;

  const { start: cycleStart, end: cycleEnd } = getCommissionCycleDates();
  const cycleStartStr = format(cycleStart, "yyyy-MM-dd");
  const cycleEndStr = format(cycleEnd, "yyyy-MM-dd");

  // Current viewer role → can manage bonuses?
  const { data: viewerRoles } = useQuery({
    queryKey: ["viewer-roles", currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [] as string[];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", currentUser.id);
      return (data || []).map((r: any) => r.role);
    },
    enabled: !!currentUser?.id,
  });
  // 7 Oct: Ops Command holders manage bonuses too (is_admin_role covers
  // them in the database for csm; the capability covers the rest).
  const { has: hasOpsCommand } = useCapability("can_view_ops_command");
  const canManageBonuses = hasOpsCommand || (viewerRoles || []).some((r) =>
    ["admin", "dev", "ops", "hr", "finance", "accounting"].includes(r)
  );

  // Base salary source (varies by role)
  const { data: baseSalary = 0 } = useQuery({
    queryKey: ["employee-base-salary", employeeUserId, employee?.role],
    queryFn: async () => {
      if (!employeeUserId) return 0;
      if (isAE) {
        const { data } = await supabase.from("ae_compensation").select("base_salary").eq("user_id", employeeUserId).maybeSingle();
        return Number(data?.base_salary || 0);
      }
      if (isSetter) {
        return Number(employee?.setterProfile?.base_salary || 0);
      }
      const { data } = await (supabase.from("profiles").select("base_salary") as any).eq("id", employeeUserId).maybeSingle();
      return Number(data?.base_salary || 0);
    },
    enabled: !!employeeUserId,
  });

  // AE cycle commission
  const { data: aeCycleCommission = { cashCollected: 0, commission: 0, pct: 0 } } = useQuery({
    queryKey: ["ae-payroll-cycle", employeeUserId, cycleStartStr, cycleEndStr],
    queryFn: async () => {
      if (!employeeUserId || !isAE) return { cashCollected: 0, commission: 0, pct: 0 };
      const { data: comp } = await supabase.from("ae_compensation").select("commission_percentage").eq("user_id", employeeUserId).maybeSingle();
      const pct = Number(comp?.commission_percentage || 0);
      const { data: payments } = await (supabase.from("ae_deal_payments").select("amount, paid_on") as any)
        .eq("ae_user_id", employeeUserId)
        .gte("paid_on", cycleStartStr)
        .lte("paid_on", cycleEndStr);
      const cash = (payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      return { cashCollected: cash, commission: (cash * pct) / 100, pct };
    },
    enabled: !!employeeUserId,
  });

  // Setter cycle commission
  const setterCycleCommission = isSetter ? Number(employee?.setterProfile?.commission_earned || 0) : 0;

  // Custom bonuses for cycle
  const { data: cycleBonuses = [] } = useQuery({
    queryKey: ["employee-custom-bonuses", employeeUserId, cycleStartStr],
    queryFn: async () => {
      if (!employeeUserId) return [];
      const { data } = await (supabase.from("employee_custom_bonuses").select("amount") as any)
        .eq("user_id", employeeUserId)
        .eq("cycle_start", cycleStartStr);
      return data || [];
    },
    enabled: !!employeeUserId,
  });
  const bonusesTotal = (cycleBonuses as any[]).reduce((s, b) => s + Number(b.amount || 0), 0);

  const variableTotal = isAE ? aeCycleCommission.commission : isSetter ? setterCycleCommission : 0;
  const cycleTotal = Number(baseSalary) + variableTotal + bonusesTotal;

  // Fetch payslips (only when employee has setterId — legacy)
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['employee-payslips', employee?.setterId],
    queryFn: async () => {
      if (!employee?.setterId) return [];
      const { data, error } = await supabase
        .from('employee_payslips')
        .select('*')
        .eq('employee_id', employee.setterId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.setterId,
  });

  const ytdSummary = payslips
    .filter((p: any) => p.year === new Date().getFullYear() && p.amount)
    .reduce((acc: any, p: any) => ({
      total: acc.total + (p.amount || 0),
      count: acc.count + 1
    }), { total: 0, count: 0 });

  const lastPayslip = payslips[0];

  const uploadPayslip = useMutation({
    mutationFn: async (data: any) => {
      let filePath = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}_payslip_${data.month}_${data.year}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('payslips').upload(fileName, selectedFile);
        if (uploadError) throw uploadError;
        filePath = uploadData.path;
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from('employee_payslips').insert({
        employee_id: employee.setterId,
        month: parseInt(data.month),
        year: parseInt(data.year),
        amount: data.amount ? parseFloat(data.amount) : null,
        file_path: filePath,
        created_by: user.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-payslips', employee?.setterId] });
      toast.success('Payslip uploaded successfully');
      setUploadModalOpen(false);
      resetForm();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to upload payslip'),
  });

  const markAsSent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employee_payslips').update({ sent_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-payslips', employee?.setterId] });
      toast.success('Marked as sent');
    }
  });

  const deletePayslip = useMutation({
    mutationFn: async (payslip: any) => {
      if (payslip.file_path) await supabase.storage.from('payslips').remove([payslip.file_path]);
      const { error } = await supabase.from('employee_payslips').delete().eq('id', payslip.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-payslips', employee?.setterId] });
      toast.success('Payslip deleted');
    }
  });

  const handleDownload = async (payslip: any) => {
    if (!payslip.file_path) { toast.error('No file attached'); return; }
    const { data, error } = await supabase.storage.from('payslips').download(payslip.file_path);
    if (error) { toast.error('Failed to download file'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslip_${MONTHS[payslip.month - 1]}_${payslip.year}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setFormData({ month: '', year: new Date().getFullYear().toString(), amount: '' });
    setSelectedFile(null);
  };

  const cycleLabel = `${format(cycleStart, "d MMM")} – ${format(cycleEnd, "d MMM yyyy")}`;
  const fmt = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!employeeUserId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No employee context.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cycle Summary Hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Cycle Total ({cycleLabel})</p>
              <p className="text-4xl font-bold tracking-tight text-primary">{fmt(cycleTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Base {fmt(Number(baseSalary))}
                {(isAE || isSetter) && ` + variable ${fmt(variableTotal)}`}
                {bonusesTotal > 0 && ` + bonuses ${fmt(bonusesTotal)}`}
              </p>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Base Salary</p>
                <p className="text-lg font-semibold">{fmt(Number(baseSalary))}</p>
              </div>
              {isAE && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Cash Collected × {aeCycleCommission.pct}%</p>
                  <p className="text-lg font-semibold">{fmt(aeCycleCommission.commission)}</p>
                </div>
              )}
              {isSetter && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Meeting Commissions</p>
                  <p className="text-lg font-semibold">{fmt(setterCycleCommission)}</p>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Bonuses</p>
                <p className="text-lg font-semibold">{fmt(bonusesTotal)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Base salary quick display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Base Salary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-1">Monthly base salary for this employee</p>
              <p className="text-2xl font-bold">{fmt(Number(baseSalary))}</p>
              {isAE && (
                <p className="text-xs text-muted-foreground mt-1">
                  + {aeCycleCommission.pct}% commission on all new-deal cash collected
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Edit via Edit Profile above</p>
          </div>
        </CardContent>
      </Card>

      {/* AE cycle cash breakdown */}
      {isAE && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <PoundSterling className="h-4 w-4 text-primary" />
              Commission (this cycle)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground">Cash Collected</p>
                <p className="text-xl font-bold mt-1">{fmt(aeCycleCommission.cashCollected)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-xs text-muted-foreground">Commission %</p>
                <p className="text-xl font-bold mt-1">{aeCycleCommission.pct}%</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10">
                <p className="text-xs text-muted-foreground">Commission Earned</p>
                <p className="text-xl font-bold mt-1 text-primary">{fmt(aeCycleCommission.commission)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Bonuses for every role */}
      <EmployeeCustomBonusesSection employeeUserId={employeeUserId} canManage={canManageBonuses} />

      {/* Payroll banking / address details (legacy — only when setterId exists) */}
      {employee?.setterId && <PayrollDetailsSection employee={employee} />}

      {/* Legacy payslip management (setterId only) */}
      {employee?.setterId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">YTD Total</p>
                    <p className="text-xl font-bold">£{ytdSummary.total.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <FileText className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payslips This Year</p>
                    <p className="text-xl font-bold">{ytdSummary.count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Calendar className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Payslip</p>
                    <p className="text-xl font-bold">
                      {lastPayslip ? `${MONTHS[lastPayslip.month - 1]} ${lastPayslip.year}` : '—'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setUploadModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Upload Payslip
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading payslips...</div>
              ) : payslips.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No payslips uploaded yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslips.map((payslip: any) => (
                      <TableRow key={payslip.id}>
                        <TableCell className="font-medium">{MONTHS[payslip.month - 1]} {payslip.year}</TableCell>
                        <TableCell>{payslip.amount ? `£${payslip.amount.toLocaleString()}` : '—'}</TableCell>
                        <TableCell>
                          {payslip.sent_date ? (
                            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                              {format(new Date(payslip.sent_date), 'dd MMM')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Not sent</Badge>
                          )}
                        </TableCell>
                        <TableCell>{format(new Date(payslip.created_at), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {payslip.file_path && (
                              <Button size="sm" variant="ghost" onClick={() => handleDownload(payslip)}>
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                            {!payslip.sent_date && (
                              <Button size="sm" variant="ghost" onClick={() => markAsSent.mutate(payslip.id)}>
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deletePayslip.mutate(payslip)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Payslip for {employee.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Month *</Label>
                <Select value={formData.month} onValueChange={(value) => setFormData({ ...formData, month: value })}>
                  <SelectTrigger><SelectValue placeholder="Select month..." /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month, index) => (
                      <SelectItem key={index} value={(index + 1).toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year *</Label>
                <Input type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Amount (£)</Label>
              <Input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <Label>Payslip PDF</Label>
              <Input type="file" accept=".pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadModalOpen(false)}>Cancel</Button>
            <Button onClick={() => uploadPayslip.mutate(formData)} disabled={!formData.month || !formData.year}>
              <Upload className="w-4 h-4 mr-2" /> Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
