// Dev Centre → Integrations (20 Sep 2026, the owner). The automations that
// replaced Zapier stay OFF until he flips them here: paid PandaDoc agreement
// → client onboarding + welcome email, and new booking → Kit sequence. The
// edge functions read these two flags on every event, so a flip takes effect
// immediately with no deploy. Below the switches: the last PandaDoc events,
// so he can see the webhook arriving even while the switch is off.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { FileSignature, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface Flags { id: string; pandadoc_paid_automation: boolean; kit_sequences_enabled: boolean }
interface AuditRow { id: string; created_at: string; event_type: string | null; status: string; message: string | null; source: string | null }

export function IntegrationsModule() {
  const qc = useQueryClient();
  const flags = useQuery({
    queryKey: ["integration-switches"],
    queryFn: async (): Promise<Flags | null> => {
      const { data, error } = await db.from("system_settings").select("id, pandadoc_paid_automation, kit_sequences_enabled").limit(1).maybeSingle();
      if (error) throw error;
      return data as Flags | null;
    },
  });
  const audit = useQuery({
    queryKey: ["pandadoc-audit-recent"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await db.from("onboarding_webhook_audit_log").select("id, created_at, event_type, status, message, source").order("created_at", { ascending: false }).limit(8);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
  const flip = useMutation({
    mutationFn: async (patch: Partial<Pick<Flags, "pandadoc_paid_automation" | "kit_sequences_enabled">>) => {
      if (!flags.data?.id) throw new Error("Settings row not found");
      const { error } = await db.from("system_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", flags.data.id);
      if (error) throw error;
    },
    onSuccess: (_d, patch) => { qc.invalidateQueries({ queryKey: ["integration-switches"] }); toast.success(Object.values(patch)[0] ? "Switched on. Live from the next event." : "Switched off. Events are still recorded, nothing is sent."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const f = flags.data;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--dc-border)] p-4">
        <p className="dc-mono text-[10px] tracking-[0.2em] text-[var(--dc-text-dim)]">[INTEGRATIONS · SWITCHES]</p>
        <p className="mt-1 text-sm text-[var(--dc-text)]">Each switch guards one automation that used to be a Zap. Off means the event is still received and logged, but nothing is sent to anyone. A flip takes effect on the next event, no deploy needed.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--dc-border)] p-4">
          <div className="flex items-start gap-3">
            <FileSignature className="mt-0.5 h-5 w-5 text-[#5a5a5a]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--dc-text)]">PandaDoc: paid agreement starts onboarding</p>
              <p className="mt-1 text-xs text-[var(--dc-text-dim)]">When PandaDoc reports an agreement as paid, Vexon OS creates the client's onboarding journey and sends the welcome email from Daniel with their login. Needs the PandaDoc webhook and the secret PANDADOC_WEBHOOK_SHARED_KEY.</p>
            </div>
            <Switch checked={f?.pandadoc_paid_automation === true} disabled={!f || flip.isPending} onCheckedChange={(v) => flip.mutate({ pandadoc_paid_automation: v })} />
          </div>
          <p className="mt-3 text-xs"><Badge variant={f?.pandadoc_paid_automation ? "default" : "secondary"}>{f?.pandadoc_paid_automation ? "On" : "Off"}</Badge></p>
        </div>
        <div className="rounded-xl border border-[var(--dc-border)] p-4">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 text-[#6b7a90]" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--dc-text)]">Kit: new bookings join the nurture sequence</p>
              <p className="mt-1 text-xs text-[var(--dc-text-dim)]">When someone books an event that has a Kit sequence ID (CEO → Event Bookings → Advanced), they are added to that sequence. Needs the secret KIT_API_KEY. Keep this off until Tom has written the emails.</p>
            </div>
            <Switch checked={f?.kit_sequences_enabled === true} disabled={!f || flip.isPending} onCheckedChange={(v) => flip.mutate({ kit_sequences_enabled: v })} />
          </div>
          <p className="mt-3 text-xs"><Badge variant={f?.kit_sequences_enabled ? "default" : "secondary"}>{f?.kit_sequences_enabled ? "On" : "Off"}</Badge></p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dc-border)]">
        <p className="border-b border-[var(--dc-border)] px-4 py-2 text-xs font-medium text-[var(--dc-text-dim)]">Last PandaDoc events received</p>
        {audit.isLoading ? <p className="p-4 text-sm text-[var(--dc-text-dim)]">Loading…</p> : (audit.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-[var(--dc-text-dim)]">Nothing yet. Mark a test document as paid in PandaDoc and it will appear here within a few seconds.</p>
        ) : (
          <ul className="divide-y divide-[var(--dc-border)] text-sm">
            {(audit.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <span className="w-32 shrink-0 text-xs text-[var(--dc-text-dim)]">{format(new Date(r.created_at), "d MMM HH:mm:ss")}</span>
                <Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge>
                <span className="text-xs text-[var(--dc-text-dim)]">{r.event_type ?? "?"}{r.source ? ` · ${r.source}` : ""}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--dc-text)]" title={r.message ?? ""}>{r.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
