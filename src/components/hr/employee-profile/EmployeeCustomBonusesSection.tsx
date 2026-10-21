import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getCommissionCycleDates } from "@/utils/commissionCycle";

interface EmployeeCustomBonusesSectionProps {
  employeeUserId: string;
  canManage: boolean; // admin/hr/finance
}

export function EmployeeCustomBonusesSection({ employeeUserId, canManage }: EmployeeCustomBonusesSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { start: cycleStart, end: cycleEnd } = getCommissionCycleDates();
  const cycleStartStr = format(cycleStart, "yyyy-MM-dd");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", amount: "", note: "" });

  const { data: bonuses = [], isLoading } = useQuery({
    queryKey: ["employee-custom-bonuses", employeeUserId, cycleStartStr],
    queryFn: async () => {
      const { data, error } = await (supabase.from("employee_custom_bonuses").select("*") as any)
        .eq("user_id", employeeUserId)
        .eq("cycle_start", cycleStartStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeUserId,
  });

  const addBonus = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("employee_custom_bonuses").insert({
        user_id: employeeUserId,
        cycle_start: cycleStartStr,
        label: form.label.trim(),
        amount: parseFloat(form.amount || "0"),
        note: form.note.trim() || null,
        created_by: user?.id || null,
      }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-custom-bonuses", employeeUserId, cycleStartStr] });
      toast.success("Bonus added");
      setForm({ label: "", amount: "", note: "" });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to add bonus"),
  });

  const deleteBonus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("employee_custom_bonuses").delete() as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-custom-bonuses", employeeUserId, cycleStartStr] });
      toast.success("Bonus removed");
    },
  });

  const total = bonuses.reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);
  const cycleLabel = `${format(cycleStart, "d MMM")} – ${format(cycleEnd, "d MMM yyyy")}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Custom Bonuses
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Cycle: {cycleLabel}</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : bonuses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No custom bonuses this cycle.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canManage && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bonuses.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.label}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{b.note || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      £{Number(b.amount).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteBonus.mutate(b.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={canManage ? 2 : 2} className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    £{total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </TableCell>
                  {canManage && <TableCell />}
                </TableRow>
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Bonus</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Label *</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Video testimonial secured" />
            </div>
            <div>
              <Label>Amount (£) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="100" />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional context for accounting" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => addBonus.mutate()} disabled={!form.label.trim() || !form.amount || addBonus.isPending}>
              {addBonus.isPending ? "Adding..." : "Add Bonus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
