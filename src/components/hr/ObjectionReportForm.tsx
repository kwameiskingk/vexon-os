import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Plus, Send, Trash2, AlertTriangle } from "lucide-react";

const PREDEFINED_OBJECTIONS = [
  "Happy with current recruitment agencies / not looking to change",
  "Not hiring / not in a hiring position (next 3-6 months)",
  "Have an internal recruitment team (no issues with them)",
  "Don't use external recruiters / never plan to",
  "Not interested (immediate rejection / flat no)",
  "Happy with current internal process",
  "Can't justify recruitment fees / won't pay for recruitment",
  "Company is too small for recruitment services",
  "Calling recycled/old leads (already spoken to before)",
  "Take me off your list / remove from call list",
  "This is my personal number",
  "Hang up immediately after introduction",
  "I don't take cold calls",
  "Language barrier",
  "Your colleague already called me and I said no",
  "Need to contact HR department / wrong person",
  "Not the decision maker",
  "GDPR objections",
  "Call screening tools blocking calls",
  "Prospect doesn't deal with our candidate type (lack of research)",
  "No time to talk",
  "Company policy to not work with external agencies",
  "Don't have graduates / not relevant to their hiring",
  "Have direct university connections for graduate hiring",
  "We have never needed a backup plan",
  "Calling after working hours",
  "Low connect rate / can't reach prospects",
  "UK company wanting to hire in SA (geographic mismatch)",
];

interface ObjectionEntry {
  objection: string;
  frequency: number;
  isCustom: boolean;
}

export function ObjectionReportForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<ObjectionEntry[]>([]);
  const [selectedObjection, setSelectedObjection] = useState("");
  const [customObjection, setCustomObjection] = useState("");
  const [frequency, setFrequency] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: todaysReports = [] } = useQuery({
    queryKey: ["my-objection-reports", user?.id, today],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("objection_reports")
        .select("*")
        .eq("setter_id", user.id)
        .eq("report_date", today)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const addEntry = () => {
    const objText = selectedObjection === "__other__" ? customObjection.trim() : selectedObjection;
    if (!objText) { toast.error("Please select or enter an objection"); return; }
    if (!frequency || parseInt(frequency) < 1) { toast.error("Please enter a valid frequency (at least 1)"); return; }
    if (entries.some(e => e.objection === objText)) { toast.error("This objection is already added"); return; }

    setEntries([...entries, {
      objection: objText,
      frequency: parseInt(frequency),
      isCustom: selectedObjection === "__other__",
    }]);
    setSelectedObjection("");
    setCustomObjection("");
    setFrequency("");
  };

  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (entries.length === 0) { toast.error("Please add at least one objection"); return; }
    if (!user?.id) return;

    setIsSubmitting(true);
    const rows = entries.map(e => ({
      setter_id: user.id,
      objection_text: e.objection,
      frequency: e.frequency,
      report_date: today,
    }));

    const { error } = await supabase.from("objection_reports").insert(rows);
    if (error) {
      toast.error("Failed to submit objections report");
      console.error(error);
    } else {
      toast.success("Objections report submitted!");
      setEntries([]);
      queryClient.invalidateQueries({ queryKey: ["my-objection-reports"] });
    }
    setIsSubmitting(false);
  };

  if (todaysReports.length > 0) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <AlertTriangle className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            Objections report submitted for today ({todaysReports.length} objection{todaysReports.length !== 1 ? "s" : ""})
          </span>
        </div>
        <div className="space-y-2">
          {todaysReports.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <span className="text-sm">{r.objection_text}</span>
              <Badge variant="secondary">{r.frequency}×</Badge>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <p className="text-sm text-muted-foreground">
        Log the objections you encountered today and how many times each was mentioned.
      </p>

      {/* Add objection form */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
        <div className="space-y-2">
          <Label>Objection</Label>
          <Select value={selectedObjection} onValueChange={setSelectedObjection}>
            <SelectTrigger>
              <SelectValue placeholder="Select an objection..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {PREDEFINED_OBJECTIONS.map((obj) => (
                <SelectItem key={obj} value={obj} className="text-xs">
                  {obj}
                </SelectItem>
              ))}
              <SelectItem value="__other__" className="font-medium text-primary">
                Other (custom)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedObjection === "__other__" && (
          <div className="space-y-2">
            <Label>Custom Objection</Label>
            <Input
              value={customObjection}
              onChange={(e) => setCustomObjection(e.target.value)}
              placeholder="Describe the objection..."
              maxLength={200}
            />
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="space-y-2 flex-1">
            <Label>Times Mentioned</Label>
            <Input
              type="number"
              min="1"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="e.g. 3"
            />
          </div>
          <Button type="button" variant="outline" onClick={addEntry} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Objections to submit ({entries.length})</Label>
          {entries.map((entry, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
                  <span className="text-sm truncate">{entry.objection}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{entry.frequency}×</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEntry(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button onClick={handleSubmit} disabled={isSubmitting || entries.length === 0} className="w-full gap-2">
        <Send className="h-4 w-4" />
        {isSubmitting ? "Submitting..." : "Submit Objections Report"}
      </Button>
    </div>
  );
}
