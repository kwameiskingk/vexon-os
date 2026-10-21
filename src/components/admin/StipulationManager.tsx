import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Plus, Check, X, Pencil, Trash2 } from "lucide-react";

interface Stipulation {
  id: string;
  date: string;
  issue: string;
  severity: "low" | "medium" | "high";
  resolved: boolean;
  resolved_at: string | null;
}

interface StipulationManagerProps {
  clientId: string;
}

export const StipulationManager = ({ clientId }: StipulationManagerProps) => {
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    issue: "",
    severity: "medium" as "low" | "medium" | "high",
  });

  useEffect(() => {
    loadStipulations();
  }, [clientId]);

  const loadStipulations = async () => {
    try {
      const { data, error } = await supabase
        .from("client_stipulations")
        .select("*")
        .eq("client_id", clientId)
        .order("date", { ascending: false });

      if (error) throw error;
      setStipulations((data as Stipulation[]) || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingId) {
        const { error } = await supabase
          .from("client_stipulations")
          .update({
            date: new Date(formData.date).toISOString(),
            issue: formData.issue,
            severity: formData.severity,
          })
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Stipulation updated");
      } else {
        const { error } = await supabase.from("client_stipulations").insert({
          client_id: clientId,
          date: new Date(formData.date).toISOString(),
          issue: formData.issue,
          severity: formData.severity,
        });

        if (error) throw error;
        toast.success("Stipulation added");
      }

      setDialogOpen(false);
      resetForm();
      loadStipulations();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleResolved = async (stipulation: Stipulation) => {
    try {
      const { error } = await supabase
        .from("client_stipulations")
        .update({
          resolved: !stipulation.resolved,
          resolved_at: !stipulation.resolved ? new Date().toISOString() : null,
        })
        .eq("id", stipulation.id);

      if (error) throw error;
      toast.success(
        stipulation.resolved ? "Marked as unresolved" : "Marked as resolved"
      );
      loadStipulations();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      const { error } = await supabase
        .from("client_stipulations")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;
      toast.success("Stipulation deleted");
      setDeleteId(null);
      loadStipulations();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const openEditDialog = (stipulation: Stipulation) => {
    setEditingId(stipulation.id);
    setFormData({
      date: new Date(stipulation.date).toISOString().split("T")[0],
      issue: stipulation.issue,
      severity: stipulation.severity,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      issue: "",
      severity: "medium",
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-destructive/10 text-destructive";
      case "medium":
        return "bg-warning/10 text-warning";
      case "low":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted";
    }
  };

  return (
    <Card className="border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Stipulations
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Stipulation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Edit Stipulation" : "Add Stipulation"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    className="[color-scheme:dark]"
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="issue">Issue / Description</Label>
                  <Textarea
                    id="issue"
                    value={formData.issue}
                    onChange={(e) =>
                      setFormData({ ...formData, issue: e.target.value })
                    }
                    placeholder="Describe the stipulation..."
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="severity">Severity</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value: "low" | "medium" | "high") =>
                      setFormData({ ...formData, severity: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleSubmit}
                  className="w-full"
                  disabled={!formData.issue.trim()}
                >
                  {editingId ? "Update" : "Add"} Stipulation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-center py-4">Loading...</p>
        ) : stipulations.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No stipulations recorded
          </p>
        ) : (
          <div className="space-y-3">
            {stipulations.map((stipulation) => (
              <div
                key={stipulation.id}
                className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                      {new Date(stipulation.date).toLocaleDateString()}
                    </span>
                    <Badge className={getSeverityColor(stipulation.severity)}>
                      {stipulation.severity}
                    </Badge>
                    {stipulation.resolved && (
                      <Badge className="bg-success/10 text-success">
                        <Check className="h-3 w-3 mr-1" />
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm">{stipulation.issue}</p>
                  {stipulation.resolved_at && (
                    <p className="text-xs text-muted-foreground">
                      Resolved on{" "}
                      {new Date(stipulation.resolved_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleToggleResolved(stipulation)}
                    title={stipulation.resolved ? "Mark unresolved" : "Mark resolved"}
                  >
                    {stipulation.resolved ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEditDialog(stipulation)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteId(stipulation.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Stipulation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this stipulation? This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
