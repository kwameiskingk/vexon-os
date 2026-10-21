import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Plus, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface ClientTermsVacanciesTabProps {
  clientId: string;
  onUpdate?: () => void;
}

interface MetricEntry {
  id: string;
  metric_type: string;
  value: number;
  entry_date: string;
  notes: string | null;
  created_at: string;
}

export const ClientTermsVacanciesTab = ({ clientId, onUpdate }: ClientTermsVacanciesTabProps) => {
  const [loading, setLoading] = useState(true);
  const [metricEntries, setMetricEntries] = useState<MetricEntry[]>([]);
  const [newEntryType, setNewEntryType] = useState("terms_sent");
  const [newEntryValue, setNewEntryValue] = useState(1);
  const [newEntryDate, setNewEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newEntryNotes, setNewEntryNotes] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    try {
      const { data: entries } = await supabase
        .from("client_metric_entries" as any)
        .select("*")
        .eq("client_profile_id", clientId)
        .order("entry_date", { ascending: false });

      setMetricEntries((entries as any[]) || []);
    } catch (error) {
      console.error("Failed to load entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async () => {
    setAddingEntry(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("client_metric_entries" as any)
        .insert({
          client_profile_id: clientId,
          metric_type: newEntryType,
          value: newEntryValue,
          entry_date: newEntryDate,
          notes: newEntryNotes || null,
          created_by: user?.id,
        } as any);

      if (error) throw error;

      const totalTerms = metricEntries.filter(e => e.metric_type === "terms_sent").reduce((s, e) => s + e.value, 0) + (newEntryType === "terms_sent" ? newEntryValue : 0);
      const totalVacancies = metricEntries.filter(e => e.metric_type === "vacancies_taken_on").reduce((s, e) => s + e.value, 0) + (newEntryType === "vacancies_taken_on" ? newEntryValue : 0);

      await supabase
        .from("client_profiles")
        .update({ terms_sent: totalTerms, vacancies_taken_on: totalVacancies, updated_at: new Date().toISOString() } as any)
        .eq("id", clientId);

      toast.success("Entry added");
      setNewEntryNotes("");
      setNewEntryValue(1);
      loadData();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add entry");
    } finally {
      setAddingEntry(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      const { error } = await supabase
        .from("client_metric_entries" as any)
        .delete()
        .eq("id", entryId);

      if (error) throw error;
      toast.success("Entry removed");
      loadData();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete entry");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalTerms = metricEntries.filter(e => e.metric_type === "terms_sent").reduce((s, e) => s + e.value, 0);
  const totalVacancies = metricEntries.filter(e => e.metric_type === "vacancies_taken_on").reduce((s, e) => s + e.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Terms Sent & Vacancies</h2>
        <p className="text-sm text-muted-foreground">
          Track terms sent and vacancies taken on.
          <span className="ml-2 font-medium">{totalTerms} terms, {totalVacancies} vacancies</span>
        </p>
      </div>

      <Card className="border-border shadow-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg bg-muted/30 border border-border">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={newEntryType} onValueChange={setNewEntryType}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="terms_sent">Terms Sent</SelectItem>
                  <SelectItem value="vacancies_taken_on">Vacancies Taken On</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Count</Label>
              <Input type="number" min={1} value={newEntryValue} onChange={(e) => setNewEntryValue(parseInt(e.target.value) || 1)} className="w-20" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newEntryDate} onChange={(e) => setNewEntryDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={newEntryNotes} onChange={(e) => setNewEntryNotes(e.target.value)} placeholder="e.g. Sent to CEO" />
            </div>
            <Button onClick={handleAddEntry} disabled={addingEntry} size="sm">
              {addingEntry ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add
            </Button>
          </div>

          {metricEntries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Count</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{format(new Date(entry.entry_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={entry.metric_type === "terms_sent" ? "border-blue-500/30 text-blue-500" : "border-emerald-500/30 text-emerald-500"}>
                        {entry.metric_type === "terms_sent" ? "Terms Sent" : "Vacancies"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{entry.value}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{entry.notes || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteEntry(entry.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No entries yet. Add terms sent or vacancies above.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
