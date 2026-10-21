import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target as TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { canEditSetterTargets } from "@/hooks/useSetterTargets";
import {
  resolveSetterTargets,
  type TargetMetric,
  type TargetPeriod,
} from "@/lib/targets/resolveTargets";
import {
  fetchIndividualTargetRows,
  upsertIndividualTargets,
  type IndividualTargetInput,
} from "@/lib/targets/individualTargets";
import type { useSetterProfile } from "@/hooks/useSetterProfile";

interface Props {
  setter: NonNullable<ReturnType<typeof useSetterProfile>["setter"]>;
  updateTargets: ReturnType<typeof useSetterProfile>["updateTargets"];
}

/**
 * THE place per-setter targets are edited. Fields write to individual_targets
 * — the resolver's layer-2 override that the RAG reads — never to the legacy
 * setter_targets store. RLS scopes writes: admin/dev/ops anywhere,
 * sdr_manager only for their assigned setters. An explicit 0 = "no target for
 * this metric" (the setter shows neutral, not red). Per-meeting bonus is a
 * commission setting, not a RAG target — it keeps the legacy CEO-only path.
 */
// Grain split (A1 ruling): dials + talk are DAILY (accrue per worked day);
// booked + sat are WEEKLY (paced by the team curve). There is deliberately
// no daily booked field — booked is weekly-only.
type FieldKey = "dials_day" | "talk_day" | "booked_week" | "sat_week";

const FIELD_DEF: Record<FieldKey, { metric: TargetMetric; period: TargetPeriod; label: string }> = {
  dials_day: { metric: "dials", period: "day", label: "Daily Dials" },
  talk_day: { metric: "talk_minutes", period: "day", label: "Daily Talk Time (min)" },
  booked_week: { metric: "booked", period: "week", label: "Weekly Meetings" },
  sat_week: { metric: "sat", period: "week", label: "Weekly Sat Meetings" },
};

export default function TargetsTab({ setter }: Props) {
  const { user, userRoles } = useAuth();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<FieldKey, number | "">>({
    dials_day: "", talk_day: "", booked_week: "", sat_week: "",
  });
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [bonus, setBonus] = useState(50);
  const [savingBonus, setSavingBonus] = useState(false);

  const saveBonus = async () => {
    setSavingBonus(true);
    try {
      const { error } = await supabase
        .from("setters_profiles")
        .update({ per_meeting_bonus: bonus })
        .eq("id", setter.id);
      if (error) throw error;
      toast.success("Bonus updated");
    } catch (error: any) {
      console.error("Error saving bonus:", error);
      toast.error(`Couldn't save bonus: ${error?.message || "Unknown error"}`);
    } finally {
      setSavingBonus(false);
    }
  };

  const isTargetManagerRole = useMemo(
    () => (userRoles || []).some((r) => ["admin", "dev", "ops", "sdr_manager"].includes(r)),
    [userRoles],
  );
  const canEditBonus = canEditSetterTargets(userRoles);

  // sdr_manager may only edit assigned setters — mirror the RLS scope in the
  // UI so the form doesn't invite a save that RLS would reject.
  const { data: inScope } = useQuery({
    queryKey: ["targets-tab-scope", setter.id, user?.id],
    queryFn: async () => {
      const roles = userRoles || [];
      if (roles.some((r) => ["admin", "dev", "ops"].includes(r))) return true;
      if (!roles.includes("sdr_manager") || !user?.id) return false;
      const { data } = await supabase
        .from("sdr_manager_assignments")
        .select("setter_profile_id")
        .eq("manager_user_id", user.id)
        .eq("setter_profile_id", setter.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user?.id,
  });
  const canEdit = isTargetManagerRole && inScope === true;

  // Current state: individual overrides where set, resolved effective values
  // (role defaults / weekly-goal fallback) otherwise.
  const { data: current, isLoading } = useQuery({
    queryKey: ["targets-tab-values", setter.id],
    queryFn: async () => {
      const [effective, overrides] = await Promise.all([
        // The setter's OWN department — an acquisition setter's "default"
        // badges resolve acquisition role defaults (currently unseeded →
        // empty fields), never fulfilment numbers.
        resolveSetterTargets(
          { setterProfileId: setter.id, setterUserId: setter.user_id },
          setter.department || "fulfilment",
          new Date(),
        ),
        fetchIndividualTargetRows(setter.id),
      ]);
      const overrideFor = (metric: string, period: string) =>
        overrides.find((o) => o.metric === metric && o.period === period);
      const fieldValue = (key: FieldKey): { value: number | ""; isOverride: boolean } => {
        const def = FIELD_DEF[key];
        const o = overrideFor(def.metric, def.period);
        if (o) return { value: Number(o.target_value), isOverride: true };
        const eff = effective[def.metric];
        if (eff.kind === "target" && eff.period === def.period) {
          return { value: eff.value, isOverride: false };
        }
        return { value: "", isOverride: false };
      };
      return {
        dials_day: fieldValue("dials_day"),
        talk_day: fieldValue("talk_day"),
        booked_week: fieldValue("booked_week"),
        sat_week: fieldValue("sat_week"),
      };
    },
  });

  useEffect(() => {
    if (!current) return;
    setValues({
      dials_day: current.dials_day.value,
      talk_day: current.talk_day.value,
      booked_week: current.booked_week.value,
      sat_week: current.sat_week.value,
    });
    setTouched(new Set());
    setBonus(setter.per_meeting_bonus ?? 50);
  }, [current, setter.per_meeting_bonus]);

  const setField = (key: FieldKey, raw: string) => {
    setValues((v) => ({ ...v, [key]: raw === "" ? "" : Math.max(0, parseInt(raw) || 0) }));
    setTouched((t) => new Set(t).add(key));
  };

  const save = async () => {
    if (!user?.id) return;
    const changes: IndividualTargetInput[] = [];
    for (const key of touched) {
      const v = values[key];
      if (v === "") continue; // blank = leave unset, no override written
      const def = FIELD_DEF[key];
      changes.push({ metric: def.metric, period: def.period, value: v });
    }
    if (changes.length === 0) {
      toast.info("No target changes to save");
      return;
    }
    setSaving(true);
    try {
      await upsertIndividualTargets(setter.id, changes, user.id);
      queryClient.invalidateQueries({ queryKey: ["targets-tab-values", setter.id] });
      queryClient.invalidateQueries({ queryKey: ["fulfilment-rag-board"] });
      queryClient.invalidateQueries({ queryKey: ["own-setter-rag"] });
      toast.success(`Targets saved — the RAG board now paces ${setter.full_name} against them`);
    } catch (error: any) {
      console.error("Error saving individual targets:", error);
      toast.error(`Couldn't save targets: ${error?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const sourceBadge = (key: FieldKey) =>
    current?.[key]?.isOverride ? (
      <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/40">custom</Badge>
    ) : (
      <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">default</Badge>
    );

  const field = (key: FieldKey, id: string) => (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {FIELD_DEF[key].label} {sourceBadge(key)}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        value={values[key]}
        onChange={(e) => setField(key, e.target.value)}
        disabled={!canEdit || isLoading}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          {isTargetManagerRole
            ? "This setter is outside your assignment scope — targets are read-only."
            : "You don't have permission to edit targets."}
        </p>
      )}
      {canEdit && (
        <p className="text-xs text-muted-foreground">
          Overrides apply from today and drive the RAG pace. Setting a value to{" "}
          <span className="font-medium">0</span> means "no target for this metric" —
          the setter shows a neutral state for it, never red.
        </p>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TargetIcon className="h-4 w-4 text-primary" />
            Daily Performance Targets
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {field("dials_day", "dials")}
          {field("talk_day", "talktime")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Weekly Targets</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {field("booked_week", "weekly")}
          {field("sat_week", "weeklysat")}
          {/* FIX 6: identical Label-row structure to the target fields so the
              three columns align on one baseline — the note moved into the
              label row as a badge instead of sitting under the input. */}
          <div className="space-y-2">
            <Label htmlFor="bonus" className="flex items-center gap-1.5">
              Per-Meeting Bonus ($)
              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                CEO/dev
              </Badge>
            </Label>
            <Input
              id="bonus"
              type="number"
              min={0}
              value={bonus}
              onChange={(e) => setBonus(parseInt(e.target.value) || 0)}
              disabled={!canEditBonus}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {canEditBonus && (
          <Button variant="outline" size="sm" onClick={saveBonus} disabled={savingBonus}>
            {savingBonus && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save Bonus
          </Button>
        )}
        {canEdit && (
          <Button size="sm" onClick={save} disabled={saving || touched.size === 0}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save Targets
          </Button>
        )}
      </div>
    </div>
  );
}
