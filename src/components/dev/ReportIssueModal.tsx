import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bug, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const MAX_FILES = 5;
const MAX_SIZE = 10 * 1024 * 1024;

const CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature request" },
  { value: "data_issue", label: "Data issue" },
  { value: "access_issue", label: "Access issue" },
  { value: "ui_glitch", label: "UI glitch" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ReportIssueModal({ open, onOpenChange }: Props) {
  const { user, userRoles } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");
  const [priority, setPriority] = useState("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("bug");
    setPriority("medium");
    setFiles([]);
  };

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid = arr.filter((f) => {
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name} exceeds 10MB`);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (i: number) => setFiles((p) => p.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!user) return;
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description required");
      return;
    }
    setSubmitting(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      const { data: ticket, error } = await supabase
        .from("dev_tickets")
        .insert({
          reporter_id: user.id,
          reporter_name: profile?.full_name || null,
          reporter_email: profile?.email || user.email || null,
          reporter_role: userRoles.join(",") || null,
          title: title.trim().slice(0, 200),
          description: description.trim(),
          category,
          priority,
          status: "open",
          source: "user",
          url: window.location.href,
          user_agent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        })
        .select()
        .single();
      if (error) throw error;

      if (files.length) {
        for (const file of files) {
          const path = `${ticket.id}/${Date.now()}-${file.name}`;
          const { error: upErr } = await supabase.storage
            .from("ticket-attachments")
            .upload(path, file, { upsert: false });
          if (upErr) {
            console.error("Upload failed", upErr);
            continue;
          }
          await supabase.from("dev_ticket_attachments").insert({
            ticket_id: ticket.id,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            uploaded_by: user.id,
          });
        }
      }

      // Notify devs
      const { data: devUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "dev");
      if (devUsers?.length) {
        const notes = devUsers.map((d) => ({
          recipient_id: d.user_id,
          recipient_role: "dev" as const,
          category: "system" as const,
          title: `New ${priority} ticket`,
          message: title.trim().slice(0, 200),
          link_url: `/dev?ticket=${ticket.id}`,
        }));
        await supabase.from("notifications").insert(notes);
      }

      toast.success("Issue reported. Thanks!");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-violet-500" />
            Report an issue
          </DialogTitle>
          <DialogDescription>
            Send this directly to the dev team. Include as much context as you can.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="What happened? What did you expect? Steps to reproduce."
            />
          </div>

          <div>
            <Label>Attachments ({files.length}/{MAX_FILES})</Label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                dragging ? "border-violet-500 bg-violet-500/5" : "border-border"
              }`}
            >
              <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                Drag & drop or{" "}
                <label className="text-violet-500 cursor-pointer hover:underline">
                  browse
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && addFiles(e.target.files)}
                  />
                </label>
                . Max 10MB each, up to {MAX_FILES} files.
              </p>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1 text-xs">
                    <span className="truncate">{f.name}</span>
                    <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit ticket
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
