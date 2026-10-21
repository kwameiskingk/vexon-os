import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonV2, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * Employee Offboarding.
 *
 * One action, one flag: offboarding stamps `profiles.offboarded_at`, which is
 * what every roster, picker, leaderboard and metric surface across the platform
 * filters on. Nothing is deleted — the person's meetings, stats and
 * contributions are all retained and stay visible wherever a "former employee"
 * filter exists (performance reviews, Employee Hub, User Management, the CEO
 * historical filters, and the Former Employees list below).
 *
 * The old 7-stage kanban is gone: it tracked HR paperwork but never actually
 * removed anyone from the platform, which is the thing that kept going wrong.
 */

/** Roles allowed to undo an offboard — mirrors REINSTATE_ROLES in the edge fn. */
const REINSTATE_ROLES = ["admin", "dev"];

interface DirectoryUser {
  id: string;
  full_name: string | null;
  email: string | null;
  roles: string[];
  offboarded_at: string | null;
}

interface OffboardDirectory {
  users: DirectoryUser[];
  former: DirectoryUser[];
}

const displayName = (u: { full_name: string | null; email: string | null }) =>
  u.full_name || u.email || "Unknown";

const formatRole = (role: string) => role.replace(/_/g, " ");

export type OffboardingScope = { departments: Array<"fulfilment" | "acquisition"> };

/**
 * `scope` (14 Oct 2026, the owner): the SDR manager's door. With it set, only
 * setters in the manager's own department(s) are listed, current and former;
 * HR and the admin-level roles pass nothing and see everyone.
 */
export default function HROffboarding({ scope }: { scope?: OffboardingScope } = {}) {
  const queryClient = useQueryClient();
  const { userRoles } = useAuth();
  const canReinstate = (userRoles || []).some((r) => REINSTATE_ROLES.includes(r));

  const [selectedUserId, setSelectedUserId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reinstateTarget, setReinstateTarget] = useState<DirectoryUser | null>(null);

  // Current staff (pickable) and former staff, both from the offboard-user
  // edge function so this page always agrees with the platform-wide flag.
  const {
    data: directory,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["offboarding-directory"],
    queryFn: async (): Promise<OffboardDirectory> => {
      const { data, error } = await supabase.functions.invoke("offboard-user", { method: "GET" });
      if (error) throw error;
      return {
        users: (data?.users ?? []) as DirectoryUser[],
        former: (data?.former ?? []) as DirectoryUser[],
      };
    },
  });

  // Department of every setter in the directory, only needed for a scoped view.
  const { data: setterDepartments } = useQuery({
    queryKey: ["offboarding-setter-departments"],
    enabled: !!scope,
    queryFn: async () => {
      const { data, error } = await supabase.from("setters_profiles").select("user_id, department");
      if (error) throw error;
      return new Map((data ?? []).map((s) => [s.user_id, s.department]));
    },
  });
  const inScope = (u: DirectoryUser) => {
    if (!scope) return true;
    if (!u.roles.includes("setter")) return false;
    const dept = setterDepartments?.get(u.id);
    return !!dept && (scope.departments as string[]).includes(dept);
  };

  const currentStaff = (directory?.users ?? []).filter(inScope);
  const formerStaff = (directory?.former ?? []).filter(inScope);

  // Departure reasons come from the offboarding history log — latest row wins.
  const { data: reasonByUserId } = useQuery({
    queryKey: ["offboarding-reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_offboarding")
        .select("employee_user_id, reason, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ employee_user_id: string | null; reason: string | null }>) {
        if (row.employee_user_id && row.reason && !map.has(row.employee_user_id)) {
          map.set(row.employee_user_id, row.reason);
        }
      }
      return map;
    },
  });

  const selectedUser = currentStaff.find((u) => u.id === selectedUserId) ?? null;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["offboarding-directory"] });
    queryClient.invalidateQueries({ queryKey: ["offboarding-reasons"] });
    // Every swept surface reads this shared set.
    queryClient.invalidateQueries({ queryKey: ["offboarded-users"] });
  };

  const offboardMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error("Pick an employee first");
      const { data, error } = await supabase.functions.invoke("offboard-user", {
        body: { userId: selectedUserId, reason: reason.trim() || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(
        `${selectedUser ? displayName(selectedUser) : "Employee"} has been offboarded. Their history is retained.`,
      );
      setSelectedUserId("");
      setReason("");
      setConfirmOpen(false);
      refreshAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not offboard this employee");
    },
  });

  const reinstateMutation = useMutation({
    mutationFn: async (user: DirectoryUser) => {
      const { data, error } = await supabase.functions.invoke("offboard-user", {
        body: { userId: user.id, action: "reinstate" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, user) => {
      toast.success(`${displayName(user)} has been reinstated and can log in again.`);
      setReinstateTarget(null);
      refreshAll();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not reinstate this employee");
    },
  });

  const formerColumns = canReinstate
    ? "minmax(0,1.4fr) minmax(0,1fr) 110px minmax(0,1.2fr) auto"
    : "minmax(0,1.4fr) minmax(0,1fr) 110px minmax(0,1.2fr)";
  const formerHead = canReinstate
    ? ["Name", "Role(s)", "Left on", "Reason", ""]
    : ["Name", "Role(s)", "Left on", "Reason"];

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader
          title={scope ? "Setter Offboarding" : "Employee Offboarding"}
          subtitle={scope
            ? `Remove a ${scope.departments.join(" or ")} setter who has left — their history stays`
            : "Remove a leaver from the platform — their history stays"}
          actions={
            <ButtonV2 size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </ButtonV2>
          }
        />

        <div className="space-y-7">
          {/* Section 1 — offboard an employee */}
          <Panel
            title="Offboard an employee"
            meta="Blocks their login and removes them from every live roster, picker and leaderboard. Everything they did is kept under Former-employee filters."
          >
            <div className="max-w-md space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="offboard-employee">Employee</Label>
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger id="offboard-employee">
                      <SelectValue placeholder="Select an employee..." />
                    </SelectTrigger>
                    <SelectContent>
                      {currentStaff.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {displayName(u)}
                          {u.email ? ` · ${u.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!isLoading && currentStaff.length === 0 && (
                  <p className="text-[11.5px] text-[var(--dim)]">No current employees to offboard.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="offboard-reason">Reason for departure (optional)</Label>
                <Textarea
                  id="offboard-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Resigned, moving to a new role"
                  rows={3}
                />
              </div>

              <ButtonV2
                className="border-[var(--bad)] text-[var(--bad)] hover:bg-[var(--bad-bg)]"
                disabled={!selectedUserId || offboardMutation.isPending}
                onClick={() => setConfirmOpen(true)}
              >
                Offboard employee
              </ButtonV2>
            </div>
          </Panel>

          {/* Section 2 — former employees */}
          <Panel
            title="Former employees"
            meta="Everyone who has left. Their meetings, stats and contributions are all retained."
            aside={<Pill>{formerStaff.length}</Pill>}
          >
            {isLoading ? (
              <div className="space-y-2 pt-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : formerStaff.length === 0 ? (
              <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No former employees recorded yet.</p>
            ) : (
              <RowList columns={formerColumns} head={formerHead} className="pt-3">
                {formerStaff.map((u) => (
                  <Row key={u.id}>
                    <RowName primary={displayName(u)} secondary={u.email || "—"} />
                    <div className="flex flex-wrap gap-1">
                      {(u.roles ?? []).length === 0 ? (
                        <span className="text-[12px] text-[var(--dim)]">—</span>
                      ) : (
                        (u.roles ?? []).map((role) => (
                          <Pill key={role}>{formatRole(role)}</Pill>
                        ))
                      )}
                    </div>
                    <RowNum className="text-[var(--ink2)]">
                      {u.offboarded_at ? format(new Date(u.offboarded_at), "dd MMM yyyy") : "—"}
                    </RowNum>
                    <div className="truncate text-[12px] text-[var(--dim)]" title={reasonByUserId?.get(u.id) || undefined}>
                      {reasonByUserId?.get(u.id) || "—"}
                    </div>
                    {canReinstate && (
                      <div className="text-right">
                        <ButtonV2
                          size="sm"
                          disabled={reinstateMutation.isPending}
                          onClick={() => setReinstateTarget(u)}
                        >
                          Reinstate
                        </ButtonV2>
                      </div>
                    )}
                  </Row>
                ))}
              </RowList>
            )}
          </Panel>
        </div>

        {/* Offboard confirmation — plain English about what actually happens */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Offboard {selectedUser ? displayName(selectedUser) : "this employee"}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>Straight away, this will:</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Block them from logging in.</li>
                    <li>
                      Hide them from every live roster, picker, leaderboard and metric across
                      the platform.
                    </li>
                  </ul>
                  <p>
                    <strong>Nothing is deleted.</strong> Every meeting they booked, every stat
                    they produced and every contribution they made is kept, and stays visible
                    wherever a Former-employee filter is offered — including monthly
                    performance reviews, which still include people who left part-way through
                    the month.
                  </p>
                  {canReinstate && <p>If this is a mistake, you can reinstate them below.</p>}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={offboardMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={offboardMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  offboardMutation.mutate();
                }}
              >
                {offboardMutation.isPending ? "Offboarding..." : "Offboard employee"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reinstate confirmation */}
        <AlertDialog
          open={!!reinstateTarget}
          onOpenChange={(open) => !open && setReinstateTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reinstate {reinstateTarget ? displayName(reinstateTarget) : "this employee"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                They will be able to log in again and will reappear on live rosters, pickers
                and leaderboards as a current employee.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reinstateMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={reinstateMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (reinstateTarget) reinstateMutation.mutate(reinstateTarget);
                }}
              >
                {reinstateMutation.isPending ? "Reinstating..." : "Reinstate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </DashboardLayout>
  );
}
