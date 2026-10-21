import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { VALID_ROLES } from "@/hooks/useDevRole";

const RESTRICTABLE_ROLES = VALID_ROLES.filter((r) => r.value !== "dev");

export function MaintenanceModeCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [restrictedRoles, setRestrictedRoles] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("id, maintenance_mode, maintenance_message, maintenance_restricted_roles")
        .limit(1)
        .maybeSingle();
      if (data) {
        setId(data.id);
        setEnabled(!!data.maintenance_mode);
        setMessage(data.maintenance_message || "");
        setRestrictedRoles(
          (data as any).maintenance_restricted_roles ??
            RESTRICTABLE_ROLES.map((r) => r.value),
        );
      }
      setLoading(false);
    })();
  }, []);

  const save = async (patch: {
    enabled?: boolean;
    message?: string;
    restrictedRoles?: string[];
  }) => {
    if (!id) return;
    setSaving(true);
    const payload: Record<string, any> = {};
    if (patch.enabled !== undefined) payload.maintenance_mode = patch.enabled;
    if (patch.message !== undefined) payload.maintenance_message = patch.message;
    if (patch.restrictedRoles !== undefined)
      payload.maintenance_restricted_roles = patch.restrictedRoles;

    const { error } = await supabase
      .from("system_settings")
      .update(payload)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (patch.enabled !== undefined) {
      setEnabled(patch.enabled);
      toast.success(patch.enabled ? "Maintenance mode ON" : "Maintenance mode OFF");
    } else if (patch.restrictedRoles !== undefined) {
      toast.success("Restricted roles updated");
    }
  };

  const toggleRole = (role: string) => {
    const next = restrictedRoles.includes(role)
      ? restrictedRoles.filter((r) => r !== role)
      : [...restrictedRoles, role];
    setRestrictedRoles(next);
    save({ restrictedRoles: next });
  };

  if (loading) return <p className="dc-mono text-xs text-[var(--dc-text-dim)]">Loading...</p>;

  return (
    <div className="dc-surface p-4 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-5 w-5 mt-0.5 ${enabled ? "text-[var(--dc-amber)]" : "text-[var(--dc-text-dim)]"}`} />
        <div className="flex-1">
          <p className="text-sm text-[var(--dc-text)] mb-1">Maintenance mode</p>
          <p className="dc-mono text-[11px] text-[var(--dc-text-dim)]">
            When ON, users in the selected roles are locked out immediately (in real time). Dev users always keep access.
          </p>
        </div>
        <button
          onClick={() => save({ enabled: !enabled })}
          disabled={saving}
          className={`dc-btn ${enabled ? "dc-btn-danger" : "dc-btn-primary"}`}
        >
          {enabled ? "Turn OFF" : "Turn ON"}
        </button>
      </div>

      <div>
        <p className="dc-label">Message shown to users</p>
        <textarea
          className="dc-textarea mt-1"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => save({ message })}
          placeholder="Optional. Leave blank for default."
        />
      </div>

      <div>
        <p className="dc-label mb-2">Restrict these roles</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {RESTRICTABLE_ROLES.map((r) => {
            const on = restrictedRoles.includes(r.value);
            return (
              <label
                key={r.value}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border ${
                  on
                    ? "border-[var(--dc-amber)] bg-[#9e9e9e]/[0.10]"
                    : "border-[var(--dc-border)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleRole(r.value)}
                  disabled={saving}
                />
                <span className="dc-mono text-[11px] text-[var(--dc-text)]">
                  {r.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <p className="dc-mono text-[10px] text-[var(--dc-text-dim)]">
        [STATUS: <span className={enabled ? "text-[var(--dc-amber)]" : "text-[var(--dc-cyan)]"}>
          {enabled ? "OFFLINE" : "ONLINE"}
        </span>]
      </p>
    </div>
  );
}
