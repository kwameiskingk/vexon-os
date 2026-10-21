import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";

export function ReleasesModule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ version: "", title: "", body: "" });

  const { data: entries = [] } = useQuery({
    queryKey: ["dev-changelog"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dev_changelog")
        .select("*")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("dev_changelog").insert({
        version: draft.version || null,
        title: draft.title,
        body: draft.body || null,
        author_id: user?.id,
        published: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dev-changelog"] });
      setOpen(false);
      setDraft({ version: "", title: "", body: "" });
      toast.success("Entry saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePub = useMutation({
    mutationFn: async (e: any) => {
      const { error } = await supabase
        .from("dev_changelog")
        .update({
          published: !e.published,
          published_at: !e.published ? new Date().toISOString() : null,
        })
        .eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dev-changelog"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dev_changelog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dev-changelog"] }),
  });

  return (
    <div className="space-y-4">
      {!open ? (
        <button className="dc-btn dc-btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-3 w-3" /> New entry
        </button>
      ) : (
        <div className="dc-surface p-4 space-y-2">
          <input
            className="dc-input"
            placeholder="Version (e.g. v1.4.2)"
            value={draft.version}
            onChange={(e) => setDraft({ ...draft, version: e.target.value })}
          />
          <input
            className="dc-input"
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <textarea
            className="dc-textarea"
            rows={4}
            placeholder="Notes (markdown welcome)"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <div className="flex gap-2 justify-end">
            <button className="dc-btn" onClick={() => setOpen(false)}>Cancel</button>
            <button className="dc-btn dc-btn-primary" onClick={() => create.mutate()}>Save</button>
          </div>
        </div>
      )}

      <div className="dc-surface">
        {entries.length === 0 && (
          <p className="dc-mono text-xs p-6 text-[var(--dc-text-dim)] text-center">No entries yet.</p>
        )}
        {entries.map((e: any) => (
          <div key={e.id} className="p-4 border-b border-[var(--dc-border)]/60 last:border-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <div className="flex items-center gap-2">
                  {e.version && <span className="dc-pill dc-pill-info">{e.version}</span>}
                  <h3 className="text-sm text-[var(--dc-text)]">{e.title}</h3>
                </div>
                <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] mt-1">
                  {format(new Date(e.created_at), "yyyy-MM-dd HH:mm")} · {e.published ? "PUBLISHED" : "DRAFT"}
                </p>
              </div>
              <div className="flex gap-1">
                <button className="dc-btn" onClick={() => togglePub.mutate(e)}>
                  {e.published ? "Unpublish" : "Publish"}
                </button>
                <button className="dc-btn dc-btn-danger" onClick={() => remove.mutate(e.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            {e.body && <p className="text-sm whitespace-pre-wrap text-[var(--dc-text-dim)] mt-2">{e.body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
