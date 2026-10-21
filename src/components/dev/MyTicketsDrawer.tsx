import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { ChevronDown, ChevronRight, Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  blocked: "bg-red-500/15 text-red-400 border-red-500/30",
  resolved: "bg-green-500/15 text-green-400 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

function TicketThread({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [reply, setReply] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["my-ticket-comments", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dev_ticket_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!user || !reply.trim()) return;
      const { error } = await supabase.from("dev_ticket_comments").insert({
        ticket_id: ticketId,
        author_id: user.id,
        body: reply.trim(),
        is_internal: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["my-ticket-comments", ticketId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Conversation</p>
      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No replies yet.</p>
      )}
      {comments.map((c: any) => {
        const mine = c.author_id === user?.id;
        return (
          <div
            key={c.id}
            className={`rounded-md p-2.5 text-xs ${
              mine ? "bg-muted/40 ml-4" : "bg-violet-500/10 border border-violet-500/20 mr-4"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                {mine ? "You" : c.author_name || "Dev team"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(c.created_at), "MMM d, HH:mm")}
              </span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{c.body}</p>
          </div>
        );
      })}
      <div className="flex gap-2 pt-1">
        <textarea
          className="flex-1 text-xs rounded-md border border-border bg-background p-2 resize-none"
          rows={2}
          placeholder="Reply to the dev team..."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <button
          onClick={() => send.mutate()}
          disabled={!reply.trim()}
          className="self-end px-3 py-2 rounded-md bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs hover:bg-violet-500/25 disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function MyTicketsDrawer({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: tickets = [] } = useQuery({
    queryKey: ["my-tickets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("dev_tickets")
        .select("id, title, description, status, priority, category, created_at, resolution_note")
        .eq("reporter_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user && open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>My tickets</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          {tickets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              You haven't reported any issues yet.
            </p>
          )}
          {tickets.map((t: any) => {
            const expanded = expandedId === t.id;
            return (
              <div key={t.id} className="border border-border rounded-lg p-3">
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      )}
                      <h4 className="text-sm font-medium leading-tight">{t.title}</h4>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[t.status] || ""}`}>
                      {t.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 ml-6">
                    <span className="capitalize">{t.category.replace("_", " ")}</span>
                    <span>•</span>
                    <span className="capitalize">{t.priority}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                  </div>
                </button>
                {expanded && (
                  <div className="mt-3 ml-6 space-y-2">
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded p-2">
                      {t.description}
                    </div>
                    {t.resolution_note && (
                      <p className="text-xs italic border-l-2 border-green-500/40 pl-2 text-muted-foreground">
                        Resolution: {t.resolution_note}
                      </p>
                    )}
                    <TicketThread ticketId={t.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
