import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";

const CATEGORIES = [
  { value: 'software', label: 'Software' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'ads', label: 'Advertising' },
  { value: 'tools', label: 'Tools' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' }
];

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one-time', label: 'One-time' }
];

export default function AccountingCosts() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    amount: '',
    frequency: 'monthly',
    vendor: '',
    start_date: '',
    notes: ''
  });

  // Fetch operating costs
  const { data: costs = [], isLoading } = useQuery({
    queryKey: ['operating-costs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operating_costs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // Create cost mutation
  const createCost = useMutation({
    mutationFn: async (data: any) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('operating_costs').insert({
        name: data.name,
        category: data.category,
        amount: parseFloat(data.amount),
        frequency: data.frequency,
        vendor: data.vendor || null,
        start_date: data.start_date || null,
        notes: data.notes || null,
        created_by: user.user?.id
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operating-costs'] });
      toast.success('Cost added successfully');
      setCreateModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add cost');
    }
  });

  // Delete cost mutation
  const deleteCost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('operating_costs')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operating-costs'] });
      toast.success('Cost deleted');
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      amount: '',
      frequency: 'monthly',
      vendor: '',
      start_date: '',
      notes: ''
    });
  };

  // Calculate monthly total
  const monthlyTotal = costs.reduce((sum: number, cost: any) => {
    let monthlyAmount = cost.amount || 0;
    switch (cost.frequency) {
      case 'weekly':
        monthlyAmount *= 4;
        break;
      case 'quarterly':
        monthlyAmount /= 3;
        break;
      case 'yearly':
        monthlyAmount /= 12;
        break;
      case 'one-time':
        monthlyAmount = 0; // Don't include one-time in monthly
        break;
    }
    return sum + monthlyAmount;
  }, 0);

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      software: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
      contractor: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
      ads: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      tools: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
      office: 'bg-gray-500/15 text-gray-500 border-gray-500/30',
      other: 'bg-gray-500/15 text-gray-500 border-gray-500/30'
    };
    return <Badge className={styles[category] || styles.other}>{category}</Badge>;
  };

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader 
          title="Operating Costs"
          subtitle="Track recurring expenses and operational costs"
          actions={
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Cost
            </Button>
          }
        />
        
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Total</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">£{monthlyTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">Recurring monthly expenses</p>
            </CardContent>
          </Card>

          {/* Costs Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading costs...</div>
              ) : costs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No operating costs recorded yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((cost: any) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">{cost.name}</TableCell>
                        <TableCell>{getCategoryBadge(cost.category)}</TableCell>
                        <TableCell>£{cost.amount?.toLocaleString()}</TableCell>
                        <TableCell className="capitalize">{cost.frequency}</TableCell>
                        <TableCell>{cost.vendor || '—'}</TableCell>
                        <TableCell>
                          {cost.start_date ? format(new Date(cost.start_date), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-destructive"
                            onClick={() => deleteCost.mutate(cost.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create Cost Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Operating Cost</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Slack subscription"
                />
              </div>

              <div>
                <Label>Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Amount (£) *</Label>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label>Frequency *</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value) => setFormData({ ...formData, frequency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value}>
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Vendor</Label>
                <Input
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  placeholder="e.g., Slack Technologies"
                />
              </div>

              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="[color-scheme:dark]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCost.mutate(formData)}
                disabled={!formData.name || !formData.category || !formData.amount}
              >
                Add Cost
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  );
}
