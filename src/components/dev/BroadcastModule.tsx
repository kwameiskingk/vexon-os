import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Megaphone, Trash2, Power } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MaintenanceModeCard } from "./MaintenanceModeCard";
import { VALID_ROLES } from "@/hooks/useDevRole";
import type { SystemBroadcast } from "@/hooks/useSystemBroadcasts";

const SEVERITIES = [
  { value: "info", label: "Info" },
  { value: "warn", label: "Warning" },
  { value: "critical", label: "Critical" },
];

export function BroadcastModule() {
  const [broadcasts, setBroadcasts] = useState<SystemBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("info");
  const [targetRoles, setTargetRoles] = useState<string[]>(
    VALID_ROLES.map((r) => r.value),
  );
  const [expiresHours, setExpiresHours] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("system_broadcasts")
      .select("*")
      .order("created_at", { ascending: false });
    setBroadcasts((data as SystemBroadcast[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("system_broadcasts_dev")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_broadcasts" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleRole = (role: string) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const submit = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const expires_at = expiresHours
      ? new Date(Date.now() + Number(expiresHours) * 3600 * 1000).toISOString()
      : null;
    const { error } = await supabase.from("system_broadcasts").insert({
      title: title.trim(),
      message: message.trim(),
      severity,
      target_roles: targetRoles,
      expires_at,
      active: true,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Broadcast sent");
    setTitle("");
    setMessage("");
    setExpiresHours("");
  };

  const toggleActive = async (b: SystemBroadcast) => {
    const { error } = await supabase
      .from("system_broadcasts")
      .update({ active: !b.active })
      .eq("id", b.id);
    if (error) toast.error(error.message);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this broadcast?")) return;
    const { error } = await supabase
      .from("system_broadcasts")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-4">
      <MaintenanceModeCard />

      <div className="dc-surface p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-[var(--dc-cyan)]" />
          <p className="text-sm text-[var(--dc-text)]">Send a broadcast</p>
        </div>
        <p className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
          Appears instantly at the top of every targeted user's screen. Users can dismiss it.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
          <input
            className="dc-input"
            placeholder="Title (e.g. Deploying in 5 minutes)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className="dc-input"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <textarea
          className="dc-textarea"
          rows={3}
          placeholder="Message body"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <div>
          <p className="dc-label mb-2">Target roles</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {VALID_ROLES.map((r) => {
              const on = targetRoles.includes(r.value);
              return (
                <label
                  key={r.value}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border ${
                    on
                      ? "border-[var(--dc-cyan)] bg-[#9e9e9e]/[0.10]"
                      : "border-[var(--dc-border)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleRole(r.value)}
                  />
                  <span className="dc-mono text-[11px] text-[var(--dc-text)]">
                    {r.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
            Auto-expire after
          </label>
          <input
            type="number"
            min={0}
            placeholder="hours"
            className="dc-input w-28"
            value={expiresHours}
            onChange={(e) => setExpiresHours(e.target.value)}
          />
          <span className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
            (leave blank for no expiry)
          </span>
          <div className="flex-1" />
          <button
            onClick={submit}
            disabled={saving}
            className="dc-btn dc-btn-primary"
          >
            {saving ? "Sending..." : "Send broadcast"}
          </button>
        </div>
      </div>

      <div className="dc-surface p-4">
        <p className="dc-mono text-[10px] tracking-[0.25em] text-[var(--dc-text-dim)] mb-3">
          [ BROADCAST HISTORY ]
        </p>
        {loading ? (
          <p className="dc-mono text-xs text-[var(--dc-text-dim)]">Loading...</p>
        ) : broadcasts.length === 0 ? (
          <p className="dc-mono text-xs text-[var(--dc-text-dim)]">No broadcasts yet.</p>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => (
              <div
                key={b.id}
                className="flex items-start gap-3 border-b border-[var(--dc-border)]/40 pb-2"
              >
                <span
                  className={`dc-pill ${
                    b.severity === "critical"
                      ? "dc-pill-err"
                      : b.severity === "warn"
                        ? "dc-pill-warn"
                        : "dc-pill-info"
                  }`}
                >
                  {b.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--dc-text)]">
                    {b.title}{" "}
                    {!b.active && (
                      <span className="dc-mono text-[10px] text-[var(--dc-text-dim)] ml-1">
                        [inactive]
                      </span>
                    )}
                  </p>
                  <p className="dc-mono text-[11px] text-[var(--dc-text-dim)] truncate">
                    {b.message}
                  </p>
                  <p className="dc-mono text-[10px] text-[var(--dc-text-dim)] mt-0.5">
                    {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                    {b.expires_at ? ` · expires ${new Date(b.expires_at).toLocaleString()}` : ""}
                    {b.target_roles?.length ? ` · ${b.target_roles.length} role(s)` : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(b)}
                  className="dc-btn"
                  title={b.active ? "Deactivate" : "Reactivate"}
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(b.id)}
                  className="dc-btn dc-btn-danger"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
