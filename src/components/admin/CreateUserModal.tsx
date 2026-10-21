import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { UserPlus, Copy, Check } from "lucide-react";
import { createUserFormSchema } from "@/lib/validation";
import { Alert, AlertDescription } from "@/components/ui/alert";

type UserRole = "dev" | "admin" | "ops" | "finance" | "csm" | "account_executive" | "setter" | "client" | "hr" | "accounting" | "sdr_manager" | "partner" | "talent_acquisition";
type SetterDepartment = "fulfilment" | "acquisition";
type SDRManagerScope = "fulfilment" | "acquisition" | "all";

const DEPARTMENT_OPTIONS = [
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'accounting', label: 'Accounting' },
  { value: 'hr', label: 'HR' },
];

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "setter", label: "Setter (SDR)" },
  { value: "account_executive", label: "Account Executive" },
  { value: "sdr_manager", label: "SDR Manager" },
  { value: "csm", label: "Customer Success Manager" },
  { value: "ops", label: "Operations" },
  { value: "hr", label: "Human Resources" },
  { value: "accounting", label: "Accounting" },
  { value: "finance", label: "Finance" },
  { value: "admin", label: "Admin" },
  { value: "dev", label: "Developer" },
  { value: "client", label: "Client" },
  { value: "partner", label: "Partner" },
];

interface CreateUserModalProps {
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultRole?: UserRole;
  defaultDepartment?: SetterDepartment;
}

export const CreateUserModal = ({ 
  onSuccess, 
  open: controlledOpen, 
  onOpenChange,
  defaultRole,
  defaultDepartment 
}: CreateUserModalProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>(defaultRole || "setter");
  const [setterDepartment, setSetterDepartment] = useState<SetterDepartment>(defaultDepartment || "fulfilment");
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [sdrManagerScope, setSdrManagerScope] = useState<SDRManagerScope>("all");
  const [departmentAccess, setDepartmentAccess] = useState<string[]>([]);
  const [partnerCompanyName, setPartnerCompanyName] = useState("");
  const [errors, setErrors] = useState<{ email?: string; displayName?: string }>({});
  const [createdUser, setCreatedUser] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setEmail("");
    setDisplayName("");
    setRole(defaultRole || "setter");
    setSetterDepartment(defaultDepartment || "fulfilment");
    setSdrManagerScope("all");
    setDepartmentAccess([]);
    setPartnerCompanyName("");
    setErrors({});
    setCreatedUser(null);
    setCopied(false);
  };

  // Set default department access based on role
  useEffect(() => {
    switch (role) {
      case 'admin':
      case 'dev':
      case 'ops':
        setDepartmentAccess(['operations', 'sales', 'accounting', 'hr']);
        break;
      case 'csm':
        setDepartmentAccess(['operations']);
        break;
      case 'account_executive':
        setDepartmentAccess(['sales']);
        break;
      case 'finance':
      case 'accounting':
        setDepartmentAccess(['accounting']);
        break;
      case 'hr':
        setDepartmentAccess(['hr']);
        break;
      case 'setter':
        setDepartmentAccess([setterDepartment === 'fulfilment' ? 'operations' : 'sales']);
        break;
      case 'sdr_manager':
        if (sdrManagerScope === 'all') {
          setDepartmentAccess(['operations', 'sales']);
        } else {
          setDepartmentAccess([sdrManagerScope === 'fulfilment' ? 'operations' : 'sales']);
        }
        break;
      case 'partner':
        // External portal user — no internal department access
        setDepartmentAccess([]);
        break;
      default:
        setDepartmentAccess(['operations']);
    }
  }, [role, setterDepartment, sdrManagerScope]);

  const validateForm = () => {
    const result = createUserFormSchema.safeParse({
      email,
      displayName: displayName || undefined,
      role,
      department: role === "setter" ? setterDepartment : undefined,
    });

    if (!result.success) {
      const fieldErrors: { email?: string; displayName?: string } = {};
      let offFieldIssue: string | null = null;
      result.error.issues.forEach((err) => {
        if (err.path[0] === "email") fieldErrors.email = err.message;
        else if (err.path[0] === "displayName") fieldErrors.displayName = err.message;
        else offFieldIssue = `${String(err.path[0] ?? "form")}: ${err.message}`;
      });
      setErrors(fieldErrors);
      // Never fail silently: issues on fields without an inline error slot
      // surface as a toast — a role missing from the schema enum used to
      // make Create User do nothing at all.
      if (offFieldIssue && !fieldErrors.email && !fieldErrors.displayName) {
        toast.error(`Couldn't create the user — ${offFieldIssue}`);
      }
      return false;
    }
    
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be logged in to create users");
      }

      // Call the edge function to create user (preserves admin session)
      const response = await supabase.functions.invoke('create-user', {
        body: {
          email: email.trim(),
          displayName: displayName.trim(),
          role,
          // AE profile rows are always department 'sales' (locked, no picker)
          setterDepartment: role === 'setter' ? setterDepartment : role === 'account_executive' ? 'sales' : undefined,
          sdrManagerScope: role === 'sdr_manager' ? sdrManagerScope : undefined,
          departmentAccess,
          partnerCompanyName: role === 'partner' && partnerCompanyName.trim() ? partnerCompanyName.trim() : undefined,
          isTestAccount: role === 'setter' ? isTestAccount : undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create user');
      }

      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Show success with temporary password
      setCreatedUser({
        email: data.user.email,
        tempPassword: data.tempPassword,
      });

      toast.success(`${ROLE_OPTIONS.find(r => r.value === role)?.label || role} user created successfully!`);
      
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset everything when closing
    resetForm();
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    // Radix calls onOpenChange(true) when the trigger is clicked.
    // We should *not* reset/close in that case; only reset when closing.
    if (nextOpen) {
      setOpen(true);
      return;
    }

    handleClose();
  };

  const copyCredentials = () => {
    if (createdUser) {
      navigator.clipboard.writeText(`Email: ${createdUser.email}\nTemporary Password: ${createdUser.tempPassword}`);
      setCopied(true);
      toast.success("Credentials copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleDepartmentAccess = (dept: string) => {
    setDepartmentAccess(prev => 
      prev.includes(dept) 
        ? prev.filter(d => d !== dept)
        : [...prev, dept]
    );
  };

  // AEs never pick a department: their profile row is always 'sales'
  // (setters_profiles value — distinct from the user_department_access
  // 'sales' entry, which means acquisition sidebar access).
  const showSetterDepartment = role === "setter";
  const showSDRManagerScope = role === "sdr_manager";
  // The TA works one surface and needs no department access, same as the
  // other single-portal roles.
  const showDepartmentAccess = !['setter', 'account_executive', 'sdr_manager', 'client', 'partner', 'talent_acquisition'].includes(role);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{createdUser ? "User Created Successfully" : "Create New User"}</DialogTitle>
          <DialogDescription>
            {createdUser 
              ? "Share these credentials with the new user" 
              : "Add a new user to the system with assigned role and department access"
            }
          </DialogDescription>
        </DialogHeader>
        
        {createdUser ? (
          <div className="space-y-4 py-4">
            <Alert className="bg-green-500/10 border-green-500/30">
              <AlertDescription className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                  <p className="font-mono text-sm">{createdUser.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Temporary Password</p>
                  <p className="font-mono text-sm">{createdUser.tempPassword}</p>
                </div>
              </AlertDescription>
            </Alert>
            
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={copyCredentials}
                className="gap-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Credentials"}
              </Button>
              <Button type="button" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              className={errors.email ? "border-destructive" : ""}
              required
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              type="text"
              placeholder="John Doe"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (errors.displayName) setErrors((prev) => ({ ...prev, displayName: undefined }));
              }}
              className={errors.displayName ? "border-destructive" : ""}
              maxLength={100}
            />
            {errors.displayName && (
              <p className="text-sm text-destructive">{errors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select value={role} onValueChange={(value: UserRole) => setRole(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showSetterDepartment && (
            <div className="space-y-2">
              <Label htmlFor="setterDepartment">Setter Department *</Label>
              <Select value={setterDepartment} onValueChange={(value: SetterDepartment) => setSetterDepartment(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fulfilment">Operations (Fulfilment)</SelectItem>
                  <SelectItem value="acquisition">Sales (Acquisition)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines which department's clients/meetings this user works with
              </p>
              <label className="flex items-start gap-2 pt-1 text-sm">
                <Checkbox
                  checked={isTestAccount}
                  onCheckedChange={(v) => setIsTestAccount(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Test account
                  <span className="block text-xs text-muted-foreground">
                    Excluded from every leaderboard, metric and CEO tile —
                    use for trials, never for a real setter.
                  </span>
                </span>
              </label>
            </div>
          )}

          {role === "partner" && (
            <div className="space-y-2">
              <Label htmlFor="partnerCompanyName">Company Name (optional)</Label>
              <Input
                id="partnerCompanyName"
                type="text"
                placeholder="e.g. Recruitment"
                value={partnerCompanyName}
                onChange={(e) => setPartnerCompanyName(e.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                Shown alongside the partner's name on referrals. The partner logs in at /partnerships.
              </p>
            </div>
          )}

          {showSDRManagerScope && (
            <div className="space-y-2">
              <Label htmlFor="sdrManagerScope">Manages Setters In *</Label>
              <Select value={sdrManagerScope} onValueChange={(value: SDRManagerScope) => setSdrManagerScope(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fulfilment">Operations Only</SelectItem>
                  <SelectItem value="acquisition">Sales Only</SelectItem>
                  <SelectItem value="all">All Departments</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines which department's setters this manager can be assigned to oversee
              </p>
            </div>
          )}

          {showDepartmentAccess && (
            <div className="space-y-2">
              <Label>Department Access</Label>
              <div className="grid grid-cols-2 gap-2">
                {DEPARTMENT_OPTIONS.map((dept) => (
                  <div key={dept.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`dept-${dept.value}`}
                      checked={departmentAccess.includes(dept.value)}
                      onCheckedChange={() => toggleDepartmentAccess(dept.value)}
                    />
                    <label
                      htmlFor={`dept-${dept.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {dept.label}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Which departments this user can access in the sidebar
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
