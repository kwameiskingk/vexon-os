import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, format } from "date-fns";
import { ExternalLink, Send, Paperclip } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["open", "in_progress", "blocked", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

const STATUS_STYLE: Record<string, string> = {
  open: "dc-pill-info",
  in_progress: "dc-pill-warn",
  blocked: "dc-pill-err",
  resolved: "dc-pill-ok",
  closed: "dc-pill-dim",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "dc-pill-dim",
  medium: "dc-pill-info",
  high: "dc-pill-warn",
  urgent: "dc-pill-err",
};

export function TicketsConsole() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["dev-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dev_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const filtered = useMemo(
    () => (statusFilter === "all" ? tickets : tickets.filter((t: any) => t.status === statusFilter)),
    [tickets, statusFilter]
  );

  const selected: any = useMemo(
    () => tickets.find((t: any) => t.id === selectedId) || filtered[0],
    [tickets, filtered, selectedId]
  );

  const { data: comments = [] } = useQuery({
    queryKey: ["dev-ticket-comments", selected?.id],
    queryFn: async () => {
      if (!selected) return [];
      const { data } = await supabase
        .from("dev_ticket_comments")
        .select("*")
        .eq("ticket_id", selected.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!selected,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["dev-ticket-attachments", selected?.id],
    queryFn: async () => {
      if (!selected) return [];
      const { data } = await supabase
        .from("dev_ticket_attachments")
        .select("*")
        .eq("ticket_id", selected.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!selected,
  });

  const updateTicket = useMutation({
    mutationFn: async (patch: Partial<any>) => {
      if (!selected) return;
      const { error } = await supabase.from("dev_tickets").update(patch).eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dev-tickets"] });
      toast.success("Ticket updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!selected || !user || !reply.trim()) return;
      const { error } = await supabase.from("dev_ticket_comments").insert({
        ticket_id: selected.id,
        author_id: user.id,
        body: reply.trim(),
        is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["dev-ticket-comments", selected?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAttachment = async (path: string) => {
    const { data } = await supabase.storage.from("ticket-attachments").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="grid grid-cols-[380px_1fr] gap-4 h-[calc(100vh-180px)]">
      {/* Left list */}
      <div className="dc-surface flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[var(--dc-border)] flex gap-1 flex-wrap">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`dc-pill ${statusFilter === s ? "dc-pill-info" : "dc-pill-dim"} cursor-pointer`}
            >
              {s.replace("_", " ")}{" "}
              {s !== "all" && `(${tickets.filter((t: any) => t.status === s).length})`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="dc-mono text-xs p-4 text-[var(--dc-text-dim)]">Loading<span className="dc-cursor"></span></p>}
          {filtered.map((t: any) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left p-3 border-b border-[var(--dc-border)]/60 hover:bg-[#9e9e9e]/[0.08] transition-colors ${
                selected?.id === t.id ? "bg-cyan-500/[0.04] border-l-2 border-l-cyan-500" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">
                  #{t.id.slice(0, 8)}
                </span>
                <span className={`dc-pill ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
              </div>
              <p className="text-sm text-[var(--dc-text)] line-clamp-2 mb-1">{t.title}</p>
              <div className="flex items-center justify-between">
                <span className={`dc-pill ${STATUS_STYLE[t.status]}`}>{t.status.replace("_", " ")}</span>
                <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">
                  {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && !isLoading && (
            <p className="dc-mono text-xs p-4 text-[var(--dc-text-dim)]">No tickets in this view.</p>
          )}
        </div>
      </div>

      {/* Right detail */}
      <div className="dc-surface overflow-y-auto">
        {!selected ? (
          <div className="p-8 text-center dc-mono text-xs text-[var(--dc-text-dim)]">
            [SELECT A TICKET<span className="dc-cursor"></span>]
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] mb-1">
                  #{selected.id.slice(0, 8)} · {format(new Date(selected.created_at), "yyyy-MM-dd HH:mm")}
                </p>
                <h2 className="text-xl text-[var(--dc-text)]">{selected.title}</h2>
              </div>
              {selected.url && (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="dc-btn"
                  title="Open captured URL"
                >
                  <ExternalLink className="h-3 w-3" />
                  Reproduce
                </a>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <select
                className="dc-select w-auto"
                value={selected.status}
                onChange={(e) => updateTicket.mutate({
                  status: e.target.value,
                  resolved_at: ["resolved", "closed"].includes(e.target.value) ? new Date().toISOString() : null,
                })}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
              <select
                className="dc-select w-auto"
                value={selected.priority}
                onChange={(e) => updateTicket.mutate({ priority: e.target.value })}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <span className={`dc-pill ${PRIORITY_STYLE[selected.priority]}`}>{selected.category}</span>
            </div>

            <div className="dc-surface-2 p-3">
              <p className="dc-label mb-2">Description</p>
              <p className="text-sm text-[var(--dc-text)] whitespace-pre-wrap">{selected.description}</p>
            </div>

            <div className="dc-surface-2 p-3 dc-mono text-[11px] space-y-1 text-[var(--dc-text-dim)]">
              <p>REPORTER · {selected.reporter_name || selected.reporter_email || selected.reporter_id.slice(0, 8)}</p>
              <p>ROLE · {selected.reporter_role || "—"}</p>
              <p>URL · <span className="text-[var(--dc-cyan)]">{selected.url || "—"}</span></p>
              <p>VIEWPORT · {selected.viewport || "—"}</p>
              <p>UA · {selected.user_agent || "—"}</p>
            </div>

            {attachments.length > 0 && (
              <div>
                <p className="dc-label">Attachments</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => openAttachment(a.storage_path)}
                      className="dc-btn"
                    >
                      <Paperclip className="h-3 w-3" />
                      {a.file_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="dc-label">Thread</p>
              <div className="space-y-2 mt-2">
                {comments.map((c: any) => (
                  <div key={c.id} className="dc-surface-2 p-3">
                    <div className="flex items-center justify-between dc-mono text-[10px] text-[var(--dc-text-dim)] mb-1">
                      <span>{c.author_name || c.author_id.slice(0, 8)}</span>
                      <span>{format(new Date(c.created_at), "MMM d, HH:mm")}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-[var(--dc-text)]">{c.body}</p>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="dc-mono text-[11px] text-[var(--dc-text-dim)]">No replies yet.</p>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <textarea
                  className="dc-textarea flex-1"
                  rows={2}
                  placeholder="Reply..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <button
                  className="dc-btn dc-btn-primary"
                  onClick={() => sendReply.mutate()}
                  disabled={!reply.trim()}
                >
                  <Send className="h-3 w-3" />
                  Send
                </button>
              </div>
            </div>

            <div>
              <p className="dc-label">Resolution note</p>
              <textarea
                className="dc-textarea mt-1"
                rows={2}
                defaultValue={selected.resolution_note || ""}
                onBlur={(e) => {
                  if (e.target.value !== (selected.resolution_note || "")) {
                    updateTicket.mutate({ resolution_note: e.target.value });
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
