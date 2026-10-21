import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DepartmentAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string | null;
  onSuccess: () => void;
}

// Tab definitions per department. IDs MUST match AppSidebar's nav entries —
// flat-entry `id`s and children `id`s, or a group's `key` to hide the whole
// group (e.g. 'hr-hiring'). The 2026-07-06 audit found this map had drifted
// so several restrictions matched nothing; keep it in lockstep with
// AppSidebar when nav items change.
const DEPARTMENT_TABS = {
  operations: [
    { id: 'dashboard', label: 'Overview' },
    { id: 'ops-clients', label: 'Clients (whole section)' },
    { id: 'onboarding', label: 'Clients · Onboarding' },
    { id: 'offboarding', label: 'Clients · Offboarding' },
    { id: 'ops-setters', label: 'Setter Management (whole section)' },
    { id: 'meetings', label: 'Setters · Appointments' },
    { id: 'warm-leads', label: 'Setters · Warm Leads' },
    { id: 'resources', label: 'Resources' },
    { id: 'forms', label: 'Forms' },
  ],
  sales: [
    { id: 'overview', label: 'Overview' },
    { id: 'setters', label: 'Setters' },
    { id: 'meetings', label: 'Appointments' },
    { id: 'sales-tools', label: 'Sales Tools' },
  ],
  accounting: [
    { id: 'overview', label: 'Overview' },
    { id: 'accounting-payments', label: 'Payments (whole section)' },
    { id: 'payments', label: 'Payments · Payment Tracker' },
    { id: 'accounting-invoices', label: 'Invoices (whole section)' },
    { id: 'costs', label: 'Invoices · Operating Costs' },
    { id: 'invoice-submissions', label: 'Invoices · Invoice Submissions' },
    { id: 'templates', label: 'Templates & Docs' },
  ],
  hr: [
    { id: 'overview', label: 'Overview' },
    { id: 'task-management', label: 'Task Management' },
    { id: 'attendance', label: 'Team Feedback' },
    { id: 'hr-hiring', label: 'Hiring Management (whole section)' },
    { id: 'employees', label: 'Hiring · Employee Hub' },
    { id: 'onboarding', label: 'Hiring · Employee Onboarding' },
    { id: 'offboarding', label: 'Hiring · Employee Offboarding' },
    { id: 'payslips', label: 'Hiring · Payslips' },
    { id: 'documents', label: 'Document Storage' },
    { id: 'user-management', label: 'User Management' },
  ],
} as const;

const DEPARTMENTS = [
  { id: 'operations', label: 'Operations', description: 'Clients, Onboarding, Setter Management, Appointments' },
  { id: 'sales', label: 'Sales', description: 'Setters, Appointments, Sales Tools' },
  { id: 'accounting', label: 'Accounting', description: 'Overview, Payments, Invoices, Costs, Cashflow' },
  { id: 'hr', label: 'Human Resources', description: 'Employee Hub, Attendance, Documents, Payroll' },
] as const;

type DepartmentId = typeof DEPARTMENTS[number]['id'];

export function DepartmentAccessModal({
  open,
  onOpenChange,
  userId,
  userName,
  userRole,
  onSuccess,
}: DepartmentAccessModalProps) {
  const [selectedDepartments, setSelectedDepartments] = useState<Set<DepartmentId>>(new Set());
  const [hiddenTabs, setHiddenTabs] = useState<Record<DepartmentId, Set<string>>>({
    operations: new Set(),
    sales: new Set(),
    accounting: new Set(),
    hr: new Set(),
  });
  const [expandedDepartments, setExpandedDepartments] = useState<Set<DepartmentId>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && userId) {
      loadCurrentAccess();
    }
  }, [open, userId]);

  const loadCurrentAccess = async () => {
    setLoading(true);
    try {
      // Load department access
      const { data: deptData, error: deptError } = await supabase
        .from('user_department_access')
        .select('department')
        .eq('user_id', userId);

      if (deptError) throw deptError;

      if (deptData && deptData.length > 0) {
        setSelectedDepartments(new Set(deptData.map(d => d.department as DepartmentId)));
      } else {
        const defaults = getDefaultDepartmentsForRole(userRole);
        setSelectedDepartments(new Set(defaults));
      }

      // Load tab restrictions
      const { data: tabData, error: tabError } = await supabase
        .from('user_tab_restrictions')
        .select('department, hidden_tabs')
        .eq('user_id', userId);

      if (tabError) throw tabError;

      const newHiddenTabs: Record<DepartmentId, Set<string>> = {
        operations: new Set(),
        sales: new Set(),
        accounting: new Set(),
        hr: new Set(),
      };

      tabData?.forEach(row => {
        const dept = row.department as DepartmentId;
        if (newHiddenTabs[dept]) {
          newHiddenTabs[dept] = new Set(row.hidden_tabs || []);
        }
      });

      setHiddenTabs(newHiddenTabs);
    } catch (error: any) {
      toast.error("Failed to load access settings");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultDepartmentsForRole = (role: string | null): DepartmentId[] => {
    switch (role) {
      case 'admin':
      case 'dev':
      case 'ops':
        return ['operations', 'sales', 'accounting', 'hr'];
      case 'csm':
        return ['operations'];
      case 'account_executive':
        return ['sales'];
      case 'finance':
      case 'accounting':
        return ['accounting'];
      case 'hr':
        return ['hr'];
      case 'setter':
        return ['operations'];
      default:
        return ['operations'];
    }
  };

  const handleToggleDepartment = (deptId: DepartmentId) => {
    const newSet = new Set(selectedDepartments);
    if (newSet.has(deptId)) {
      if (newSet.size > 1) {
        newSet.delete(deptId);
        // Also collapse it
        const newExpanded = new Set(expandedDepartments);
        newExpanded.delete(deptId);
        setExpandedDepartments(newExpanded);
      } else {
        toast.error("User must have access to at least one department");
        return;
      }
    } else {
      newSet.add(deptId);
      // Auto-expand when adding
      const newExpanded = new Set(expandedDepartments);
      newExpanded.add(deptId);
      setExpandedDepartments(newExpanded);
    }
    setSelectedDepartments(newSet);
  };

  const handleToggleTab = (deptId: DepartmentId, tabId: string) => {
    const newHiddenTabs = { ...hiddenTabs };
    const deptHidden = new Set(newHiddenTabs[deptId]);
    
    if (deptHidden.has(tabId)) {
      deptHidden.delete(tabId);
    } else {
      // Don't allow hiding all tabs
      const totalTabs = DEPARTMENT_TABS[deptId].length;
      if (deptHidden.size >= totalTabs - 1) {
        toast.error("User must have at least one visible tab");
        return;
      }
      deptHidden.add(tabId);
    }
    
    newHiddenTabs[deptId] = deptHidden;
    setHiddenTabs(newHiddenTabs);
  };

  const toggleDepartmentExpanded = (deptId: DepartmentId) => {
    const newExpanded = new Set(expandedDepartments);
    if (newExpanded.has(deptId)) {
      newExpanded.delete(deptId);
    } else {
      newExpanded.add(deptId);
    }
    setExpandedDepartments(newExpanded);
  };

  const handleSave = async () => {
    if (selectedDepartments.size === 0) {
      toast.error("Please select at least one department");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Delete existing department access entries
      const { error: deleteError } = await supabase
        .from('user_department_access')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insert new department access entries
      const accessEntries = Array.from(selectedDepartments).map(dept => ({
        user_id: userId,
        department: dept,
        granted_by: user?.id,
      }));

      const { error: insertError } = await supabase
        .from('user_department_access')
        .insert(accessEntries);

      if (insertError) throw insertError;

      // Delete existing tab restrictions
      const { error: deleteTabError } = await supabase
        .from('user_tab_restrictions')
        .delete()
        .eq('user_id', userId);

      if (deleteTabError) throw deleteTabError;

      // Insert new tab restrictions (only for departments with hidden tabs)
      const tabEntries = Array.from(selectedDepartments)
        .filter(dept => hiddenTabs[dept].size > 0)
        .map(dept => ({
          user_id: userId,
          department: dept,
          hidden_tabs: Array.from(hiddenTabs[dept]),
          granted_by: user?.id,
        }));

      if (tabEntries.length > 0) {
        const { error: insertTabError } = await supabase
          .from('user_tab_restrictions')
          .insert(tabEntries);

        if (insertTabError) throw insertTabError;
      }

      // If this is a setter and we're changing their department access, update their setter profile
      // and remove any stale manager assignments from the old department.
      if (userRole === 'setter') {
        const hasSales = selectedDepartments.has('sales');
        const hasOperations = selectedDepartments.has('operations');
        
        let newDepartment: 'fulfilment' | 'acquisition' | null = null;
        if (hasSales && !hasOperations) {
          newDepartment = 'acquisition';
        } else if (hasOperations && !hasSales) {
          newDepartment = 'fulfilment';
        }

        if (newDepartment) {
          const { data: setterProfile } = await supabase
            .from('setters_profiles')
            .update({ department: newDepartment })
            .eq('user_id', userId)
            .select('id')
            .maybeSingle();

          if (setterProfile?.id) {
            await supabase
              .from('sdr_manager_assignments')
              .delete()
              .eq('setter_profile_id', setterProfile.id)
              .neq('department', newDepartment);
          }
        }
      }

      // Log the action
      await supabase.from('admin_activity_log').insert({
        action: 'department_tab_access_change',
        details: {
          target_user_id: userId,
          target_user_name: userName,
          departments: Array.from(selectedDepartments),
          hidden_tabs: Object.fromEntries(
            Array.from(selectedDepartments).map(dept => [dept, Array.from(hiddenTabs[dept])])
          ),
        }
      });

      toast.success("Access settings updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update access settings");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Access Settings</DialogTitle>
          <DialogDescription>
            Configure department and tab visibility for{" "}
            <span className="font-medium text-foreground">{userName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-muted-foreground">Current Role:</span>
          <Badge variant="secondary">
            {userRole === 'account_executive' ? 'Account Executive' : 
             userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'No role'}
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-2 py-2">
              {DEPARTMENTS.map((dept) => {
                const isSelected = selectedDepartments.has(dept.id);
                const isExpanded = expandedDepartments.has(dept.id);
                const tabs = DEPARTMENT_TABS[dept.id];
                const hiddenCount = hiddenTabs[dept.id].size;

                return (
                  <div
                    key={dept.id}
                    className={`rounded-lg border transition-colors ${
                      isSelected ? 'border-primary/50 bg-primary/5' : 'border-border'
                    }`}
                  >
                    {/* Department Header */}
                    <div className="flex items-start space-x-3 p-3">
                      <Checkbox
                        id={`dept-${dept.id}`}
                        checked={isSelected}
                        onCheckedChange={() => handleToggleDepartment(dept.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor={`dept-${dept.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {dept.label}
                          </Label>
                          {isSelected && (
                            <button
                              type="button"
                              onClick={() => toggleDepartmentExpanded(dept.id)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {hiddenCount > 0 && (
                                <span className="text-amber-500">{hiddenCount} hidden</span>
                              )}
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {dept.description}
                        </p>
                      </div>
                    </div>

                    {/* Tab Selection - only show when department is selected and expanded */}
                    {isSelected && isExpanded && (
                      <div className="border-t border-border px-3 py-3 bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-2 font-medium">
                          Visible Tabs (uncheck to hide):
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {tabs.map((tab) => {
                            const isHidden = hiddenTabs[dept.id].has(tab.id);
                            return (
                              <div
                                key={tab.id}
                                className="flex items-center space-x-2"
                              >
                                <Checkbox
                                  id={`tab-${dept.id}-${tab.id}`}
                                  checked={!isHidden}
                                  onCheckedChange={() => handleToggleTab(dept.id, tab.id)}
                                />
                                <Label
                                  htmlFor={`tab-${dept.id}-${tab.id}`}
                                  className={`text-xs cursor-pointer ${
                                    isHidden ? 'text-muted-foreground line-through' : ''
                                  }`}
                                >
                                  {tab.label}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
