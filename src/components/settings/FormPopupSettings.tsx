// Daily forms (rebuilt 15 Oct 2026 on the kit). Two forms, Start of day and
// End of day: on or off, who must fill it in, when the pop-up appears. The
// same two switches now also decide whether the section shows on the Forms
// page (useFormVisibility). Midday report retired: its form was never
// rendered and its noon notification is unscheduled by migration
// 20261015180000.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { ButtonV2, Chip, Panel, Pill } from "@/components/ui-v2";
import { StartOfDayModal } from "@/components/forms/StartOfDayModal";
import { EODSubmissionModal } from "@/components/operations/EODSubmissionModal";

const sb = supabase as unknown as SupabaseClient;

const ROLES = [
  { value: "setter", label: "Setters" },
  { value: "account_executive", label: "Account executives" },
  { value: "csm", label: "CSMs" },
  { value: "sdr_manager", label: "SDR managers" },
  { value: "gtm_engineer", label: "GTM engineers" },
];

type FormType = "sod" | "eod";
type SettingsRow = { id: string; enabled: boolean; target_roles: string[] | null; popup_time: string | null };

const META: Record<FormType, { table: "start_of_day_settings" | "eod_settings"; title: string; description: string; fallbackTime: string }> = {
  sod: { table: "start_of_day_settings", title: "Start of day", description: "Morning check-in: mood, plan for the day, priorities, blockers.", fallbackTime: "09:30" },
  eod: { table: "eod_settings", title: "End of day", description: "Evening reflection: mood, what went well, what was hard.", fallbackTime: "17:15" },
};

export function FormPopupSettings() {
  const { userRoles } = useAuth();
  if (!userRoles.includes("dev")) return null;
  return (
    <div className="space-y-6">
      <FormSection type="sod" />
      <FormSection type="eod" />
    </div>
  );
}

function FormSection({ type }: { type: FormType }) {
  const qc = useQueryClient();
  const meta = META[type];
  const [draft, setDraft] = useState<Partial<SettingsRow>>({});
  const [saving, setSaving] = useState(false);
  const [showTest, setShowTest] = useState(false);

  const { data: settings, isLoading } = useQuery<SettingsRow | null>({
    queryKey: ["form-popup-settings", meta.table],
    queryFn: async () => {
      const { data } = await sb.from(meta.table).select("id, enabled, target_roles, popup_time").limit(1).maybeSingle();
      return (data as SettingsRow | null) ?? null;
    },
  });

  const eff = {
    enabled: draft.enabled ?? settings?.enabled ?? false,
    roles: draft.target_roles ?? settings?.target_roles ?? [],
    time: (draft.popup_time ?? settings?.popup_time ?? meta.fallbackTime).slice(0, 5),
  };
  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { data: updated, error } = await sb
      .from(meta.table)
      .update({ enabled: eff.enabled, target_roles: eff.roles, popup_time: eff.time })
      .eq("id", settings.id)
      .select("id");
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (!updated || updated.length === 0) { toast.error("Save blocked: you do not have permission to change this."); return; }
    toast.success(`${meta.title} saved`);
    setDraft({});
    qc.invalidateQueries({ queryKey: ["form-popup-settings", meta.table] });
    qc.invalidateQueries({ queryKey: ["start-of-day-pending"] });
    qc.invalidateQueries({ queryKey: ["eod-pending"] });
    qc.invalidateQueries({ queryKey: ["forms-visibility"] });
  };

  const toggleRole = (role: string) =>
    setDraft((d) => ({ ...d, target_roles: eff.roles.includes(role) ? eff.roles.filter((r) => r !== role) : [...eff.roles, role] }));

  return (
    <Panel title={meta.title} meta={meta.description} aside={<Pill variant={eff.enabled ? "ok" : "default"}>{eff.enabled ? "On" : "Off"}</Pill>}>
      {isLoading ? <p className="py-4 text-[12px] text-[var(--dim)]">Loading…</p> : !settings ? (
        <p className="py-4 text-[12px] text-[var(--dim)]">No settings row found.</p>
      ) : (
        <div className="space-y-5 pt-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-semibold">Switched on</p>
              <p className="text-[12px] text-[var(--dim)]">When on, the people below see the pop-up at the time set and the section on their Forms page. When off, neither.</p>
            </div>
            <Switch checked={eff.enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
          </div>
          <div>
            <p className="text-[13px] font-semibold">Who must fill it in</p>
            <div className="mt-2 flex flex-wrap gap-[6px]">
              {ROLES.map((r) => (
                <Chip key={r.value} selected={eff.roles.includes(r.value)} onClick={() => toggleRole(r.value)}>{r.label}</Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold">Pop-up time (UK)</p>
            <input type="time" className="dc-input mt-2 w-[160px]" value={eff.time} onChange={(e) => setDraft((d) => ({ ...d, popup_time: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between border-t border-[var(--line)] pt-4">
            <ButtonV2 size="sm" onClick={() => setShowTest(true)}>Test the pop-up</ButtonV2>
            <ButtonV2 size="sm" variant="primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</ButtonV2>
          </div>
        </div>
      )}
      {showTest && type === "sod" && <StartOfDayModal isTest open={showTest} onOpenChange={setShowTest} />}
      {showTest && type === "eod" && <EODSubmissionModal isTest open={showTest} onOpenChange={setShowTest} onSuccess={() => setShowTest(false)} />}
    </Panel>
  );
}
