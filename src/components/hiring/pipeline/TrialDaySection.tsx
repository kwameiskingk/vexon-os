// Trial Day (15 Sep 2026): Elena's controls on the candidate card.
//
// Shown at the Trial Day stage (and afterwards while a trialist login is
// still linked): the trial date, the login, create / invite / end-access
// actions, and what the trialist has logged so far. The heavy lifting is the
// create-user trialist path, onboarding-invite with the trial flag, and the
// end_trial_access function — see src/hooks/useTrialDay.ts.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Building2, CalendarDays, Check, FlaskConical, KeyRound, Loader2, LogOut, MailCheck, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PipelineCandidateRow } from "@/hooks/useHiringPipeline";
import { HIRING_PIPELINE_QUERY_KEY } from "@/hooks/useHiringPipeline";
import {
  trialLeadStatusLabel,
  useAllTrialLeads,
  useCreateTrialistLogin,
  useEndTrialAccess,
  useSendTrialistInvite,
  useSetTrialAlias,
  useSetTrialClients,
  useTrialAssignableClients,
} from "@/hooks/useTrialDay";

interface Props {
  candidate: PipelineCandidateRow;
  canAct: boolean;
}

export function TrialDaySection({ candidate, canAct }: Props) {
  const qc = useQueryClient();
  const fullName = `${candidate.first_name} ${candidate.last_name}`.trim();
  const [createOpen, setCreateOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [email, setEmail] = useState(candidate.email ?? "");
  const [dateDraft, setDateDraft] = useState(candidate.trial_day_date ?? "");
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => setDateDraft(candidate.trial_day_date ?? ""), [candidate.trial_day_date]);

  const create = useCreateTrialistLogin();
  const invite = useSendTrialistInvite();
  const endAccess = useEndTrialAccess();

  // Which clients the trialist dials for. Order = alias order; the trialist
  // only ever sees "Client A / B / C" (18 Sep, the owner).
  const { data: assignable = [] } = useTrialAssignableClients(canAct);
  const setClients = useSetTrialClients();
  const assigned = candidate.trial_client_ids ?? [];
  const toggleClient = (id: string, on: boolean) => {
    const next = on ? [...assigned.filter((x) => x !== id), id] : assigned.filter((x) => x !== id);
    setClients.mutate(
      { candidateId: candidate.id, clientIds: next },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the client list") },
    );
  };

  const { data: profile } = useQuery({
    queryKey: ["trialist-profile", candidate.trialist_user_id],
    enabled: !!candidate.trialist_user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, in_trial_mode, in_onboarding_mode, offboarded_at" as never)
        .eq("id", candidate.trialist_user_id!)
        .maybeSingle();
      return (data as unknown as {
        id: string;
        email: string | null;
        full_name: string | null;
        in_trial_mode?: boolean;
        in_onboarding_mode?: boolean;
        offboarded_at: string | null;
      } | null) ?? null;
    },
  });

  const { data: allLeads = [] } = useAllTrialLeads(!!candidate.trialist_user_id);
  const leads = useMemo(() => allLeads.filter((l) => l.candidate_id === candidate.id), [allLeads, candidate.id]);

  const loginState = !candidate.trialist_user_id
    ? "none"
    : profile?.in_onboarding_mode
    ? "onboarding"
    : profile?.in_trial_mode
    ? "live"
    : "ended";

  const saveDate = async () => {
    setSavingDate(true);
    const { error } = await supabase
      .from("candidates")
      .update({ trial_day_date: dateDraft || null } as never)
      .eq("id", candidate.id);
    setSavingDate(false);
    if (error) {
      toast.error(`Couldn't save the date: ${error.message}`);
      return;
    }
    toast.success("Trial date saved");
    qc.invalidateQueries({ queryKey: HIRING_PIPELINE_QUERY_KEY });
  };

  const doCreate = async () => {
    try {
      await create.mutateAsync({ candidateId: candidate.id, email: email.trim(), displayName: fullName });
      setCreateOpen(false);
      try {
        await invite.mutateAsync({ email: email.trim(), fullName });
        toast.success(`Login created and invite sent to ${email.trim()}`);
      } catch (err) {
        toast.warning(`Login created, but the invite didn't send: ${err instanceof Error ? err.message : "unknown error"}. Use "Resend invite".`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the login");
    }
  };

  const resend = async () => {
    const to = profile?.email ?? candidate.email;
    try {
      await invite.mutateAsync({ email: to, fullName });
      toast.success(`Invite sent to ${to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    }
  };

  const doEnd = async () => {
    try {
      await endAccess.mutateAsync(candidate.id);
      setEndOpen(false);
      toast.success("Trial access ended");
      qc.invalidateQueries({ queryKey: ["trialist-profile", candidate.trialist_user_id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't end access");
    }
  };

  const busy = create.isPending || invite.isPending;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-sky-500/20 bg-sky-500/5 px-3.5 py-2">
        <span className="text-sky-600 dark:text-sky-400">
          <FlaskConical className="h-3.5 w-3.5" />
        </span>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">Trial Day</h4>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium",
            loginState === "live" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            loginState === "ended" && "bg-muted text-muted-foreground",
            loginState === "onboarding" && "bg-violet-500/15 text-violet-700 dark:text-violet-300",
            loginState === "none" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
        >
          {loginState === "live" ? "Login live" : loginState === "ended" ? "Access ended" : loginState === "onboarding" ? "In onboarding" : "No login yet"}
        </span>
      </header>

      <div className="space-y-4 px-3.5 py-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Trial date</Label>
            <div className="flex gap-2">
              <Input type="date" value={dateDraft} disabled={!canAct} onChange={(e) => setDateDraft(e.target.value)} className="h-8 text-sm" />
              {canAct && dateDraft !== (candidate.trial_day_date ?? "") && (
                <Button size="sm" className="h-8" disabled={savingDate} onClick={saveDate}>
                  {savingDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Trialist login</Label>
            <p className="flex h-8 items-center truncate rounded-md border border-border bg-muted/30 px-2.5 text-sm">
              {profile?.email ?? (candidate.trialist_user_id ? "…" : "Not created")}
            </p>
          </div>
        </div>

        {canAct && (
          <div className="flex flex-wrap gap-2">
            {loginState === "none" ? (
              <Button size="sm" className="gap-1.5" onClick={() => { setEmail(candidate.email ?? ""); setCreateOpen(true); }}>
                <KeyRound className="h-3.5 w-3.5" /> Create trialist login
              </Button>
            ) : loginState === "live" ? (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={invite.isPending} onClick={resend}>
                  {invite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailCheck className="h-3.5 w-3.5" />} Resend invite
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setEndOpen(true)}>
                  <LogOut className="h-3.5 w-3.5" /> End trial access
                </Button>
              </>
            ) : null}
          </div>
        )}

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" /> Clients they dial for
            {setClients.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          </p>
          <p className="text-[11px] text-muted-foreground">
            The trialist only ever sees the trial name on the right. Real names stay on our side. Click the pencil to rename one.
            {assigned.length === 0 && " Nothing ticked = every live client, still under trial names."}
          </p>
          {assignable.length === 0 ? (
            <p className="text-xs text-muted-foreground">{canAct ? "No active clients to pick from." : "—"}</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {assignable.map((c) => {
                const idx = assigned.indexOf(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      id={`trial-client-${candidate.id}-${c.id}`}
                      checked={idx >= 0}
                      disabled={!canAct || setClients.isPending}
                      onCheckedChange={(v) => toggleClient(c.id, v === true)}
                    />
                    <label htmlFor={`trial-client-${candidate.id}-${c.id}`} className="min-w-0 flex-1 cursor-pointer truncate">
                      {c.company_name}
                    </label>
                    <TrialAliasChip clientId={c.id} alias={c.trial_alias} picked={idx >= 0} canEdit={canAct} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Leads logged{" "}
            {leads.length > 0 && (
              <span className="text-foreground">
                · {leads.length} total · {leads.filter((l) => l.status === "converted").length} booked · {leads.filter((l) => l.status === "submitted").length} with Elena
              </span>
            )}
          </p>
          {leads.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing yet. What they log on the day shows here.</p>
          ) : (
            <ul className="space-y-1">
              {leads.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">
                    {l.company_name || "Unnamed"} {l.contact_name ? `· ${l.contact_name}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{trialLeadStatusLabel[l.status]}</span>
                  <span className="shrink-0 text-muted-foreground">{format(parseISO(l.created_at), "HH:mm")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => !busy && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create trialist login — {fullName}</DialogTitle>
            <DialogDescription>
              Makes a login that can only reach the trial portal, then emails a set-password link. Their personal address is
              fine: the same login carries into onboarding if they pass, and the address is changed later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="trialist-email">Email for the login *</Label>
            <Input id="trialist-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || busy} onClick={doCreate}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {invite.isPending ? "Sending invite…" : create.isPending ? "Creating…" : "Create & invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End trial access for {fullName}?</DialogTitle>
            <DialogDescription>
              They can no longer sign in. Everything they logged stays on record. If they passed, move them to Offer
              instead and keep the login for onboarding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={endAccess.isPending} onClick={doEnd}>
              {endAccess.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              End access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** A client's trial name ("B Recruitment"), renamable in place (Elena, 16 Oct 2026). */
function TrialAliasChip({ clientId, alias, picked, canEdit }: { clientId: string; alias: string | null; picked: boolean; canEdit: boolean }) {
  const rename = useSetTrialAlias();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias ?? "");
  const save = () => {
    const v = draft.trim();
    if (!v || v === alias) { setEditing(false); return; }
    rename.mutate(
      { clientId, alias: v },
      {
        onSuccess: () => { setEditing(false); toast.success(`Now shows as ${v}`); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't rename"),
      },
    );
  };
  if (editing) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Input
          autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-6 w-32 px-1.5 text-[11px]"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") setEditing(false); }}
        />
        <button type="button" aria-label="Save trial name" onClick={save} disabled={rename.isPending} className="text-emerald-600">
          {rename.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button type="button" aria-label="Cancel" onClick={() => setEditing(false)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
      </span>
    );
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <span className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        picked ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-muted text-muted-foreground",
      )}>
        {alias ?? "No trial name"}
      </span>
      {canEdit && (
        <button type="button" aria-label="Rename trial name" onClick={() => { setDraft(alias ?? ""); setEditing(true); }} className="text-muted-foreground hover:text-foreground">
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
