import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchActiveAeUserIds } from "@/lib/aeRoster";

interface AECompensation {
  id: string;
  user_id: string;
  commission_percentage: number;
  commission_per_deal: number;
  base_salary: number;
  profile?: {
    email: string;
    full_name: string;
  };
}

export function AECompensationManagement() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAE, setSelectedAE] = useState<AECompensation | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    password: "",
    commission_percentage: "5",
    commission_per_deal: "500",
    base_salary: "0",
  });

  // Fetch AEs with compensation
  const { data: aeCompensations, isLoading } = useQuery({
    queryKey: ["ae-compensations"],
    queryFn: async () => {
      // Shared roster: role-holders + acting AEs (Marcus), minus offboarded.
      const userIds = await fetchActiveAeUserIds();
      if (userIds.length === 0) return [];

      // Get profiles
      const { data: profiles } = await supabase.from("profiles").select("id, email, full_name").in("id", userIds);

      // Get compensations
      const { data: compensations } = await supabase.from("ae_compensation").select("*").in("user_id", userIds);

      const compensationMap = new Map(compensations?.map((c) => [c.user_id, c]) || []);

      return profiles?.map((p) => {
        const comp = compensationMap.get(p.id);
        return {
          id: comp?.id || "",
          user_id: p.id,
          commission_percentage: comp?.commission_percentage || 0,
          commission_per_deal: comp?.commission_per_deal || 0,
          base_salary: comp?.base_salary || 0,
          profile: { email: p.email, full_name: p.full_name },
        };
      }) || [];
    },
  });

  // Create new AE
  const createAEMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Create user via edge function
      const { data: result, error } = await supabase.functions.invoke("admin-users", {
        body: {
          action: "create",
          email: data.email,
          full_name: data.full_name,
          password: data.password,
          role: "account_executive",
        },
      });

      if (error) throw error;
      if (!result?.user_id) throw new Error("Failed to create user");

      // Create compensation record
      const { error: compError } = await supabase.from("ae_compensation").upsert(
        {
          user_id: result.user_id,
          commission_percentage: parseFloat(data.commission_percentage),
          commission_per_deal: parseFloat(data.commission_per_deal),
          base_salary: parseFloat(data.base_salary),
        },
        { onConflict: "user_id" }
      );

      if (compError) throw compError;

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ae-compensations"] });
      toast.success("Account Executive created successfully");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create Account Executive");
    },
  });

  // Update compensation
  const updateCompensationMutation = useMutation({
    mutationFn: async (data: { user_id: string; commission_percentage: number; commission_per_deal: number; base_salary: number }) => {
      const { error } = await supabase.from("ae_compensation").upsert(
        {
          user_id: data.user_id,
          commission_percentage: data.commission_percentage,
          commission_per_deal: data.commission_per_deal,
          base_salary: data.base_salary,
        },
        { onConflict: "user_id" }
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ae-compensations"] });
      toast.success("Compensation updated successfully");
      setIsEditDialogOpen(false);
      setSelectedAE(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update compensation");
    },
  });

  const resetForm = () => {
    setFormData({
      email: "",
      full_name: "",
      password: "",
      commission_percentage: "5",
      commission_per_deal: "500",
      base_salary: "0",
    });
  };

  const handleEdit = (ae: AECompensation) => {
    setSelectedAE(ae);
    setFormData({
      ...formData,
      commission_percentage: ae.commission_percentage.toString(),
      commission_per_deal: ae.commission_per_deal.toString(),
      base_salary: ae.base_salary.toString(),
    });
    setIsEditDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <CardTitle>Account Executive Compensation</CardTitle>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account Executive
          </Button>
        </div>
        <CardDescription>Manage AE accounts and commission settings</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !aeCompensations || aeCompensations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No Account Executives found</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsAddDialogOpen(true)}>
              Add your first AE
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Commission %</TableHead>
                <TableHead>Per-Deal Bonus</TableHead>
                <TableHead>Base Salary</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aeCompensations.map((ae) => (
                <TableRow key={ae.user_id}>
                  <TableCell className="font-medium">{ae.profile?.full_name || "—"}</TableCell>
                  <TableCell>{ae.profile?.email || "—"}</TableCell>
                  <TableCell>{ae.commission_percentage}%</TableCell>
                  <TableCell>{formatCurrency(ae.commission_per_deal)}</TableCell>
                  <TableCell>{formatCurrency(ae.base_salary)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(ae)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add AE Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account Executive</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 6 characters"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  value={formData.commission_percentage}
                  onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Per-Deal (£)</Label>
                <Input
                  type="number"
                  value={formData.commission_per_deal}
                  onChange={(e) => setFormData({ ...formData, commission_per_deal: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Base Salary (£)</Label>
                <Input
                  type="number"
                  value={formData.base_salary}
                  onChange={(e) => setFormData({ ...formData, base_salary: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createAEMutation.mutate(formData)}
              disabled={createAEMutation.isPending || !formData.email || !formData.full_name || !formData.password}
            >
              {createAEMutation.isPending ? "Creating..." : "Create Account Executive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Compensation Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Compensation</DialogTitle>
          </DialogHeader>
          {selectedAE && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Editing compensation for <strong>{selectedAE.profile?.full_name}</strong>
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Commission %</Label>
                  <Input
                    type="number"
                    value={formData.commission_percentage}
                    onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Per-Deal (£)</Label>
                  <Input
                    type="number"
                    value={formData.commission_per_deal}
                    onChange={(e) => setFormData({ ...formData, commission_per_deal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Base Salary (£)</Label>
                  <Input
                    type="number"
                    value={formData.base_salary}
                    onChange={(e) => setFormData({ ...formData, base_salary: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                selectedAE &&
                updateCompensationMutation.mutate({
                  user_id: selectedAE.user_id,
                  commission_percentage: parseFloat(formData.commission_percentage),
                  commission_per_deal: parseFloat(formData.commission_per_deal),
                  base_salary: parseFloat(formData.base_salary),
                })
              }
              disabled={updateCompensationMutation.isPending}
            >
              {updateCompensationMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
