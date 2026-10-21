// Trial Day SANDBOX (15 Sep 2026; reworked 16 Oct 2026 for the booking
// window). The whole hand-off on in-memory state, through two lenses:
//
//   Trialist — the real portal view (TrialHomeView) with the live briefing
//              settings; "Log a meeting-ready lead" opens the real booking
//              window with fixture clients, free times and Close lookup, and
//              lands the lead in memory.
//   Elena   — the real TrialLeadCard as it shows in Ops Command > Trialist
//              leads: book it on the client's calendar (fixture times) or
//              mark it not a fit.
//
// Nothing is written. Sibling of /onboarding/sandbox, same role gate.
// Reached from Dev Centre → Trialist Access → "Run the flow (sandbox)".

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical, RotateCcw, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { TrialLeadCard } from "@/components/csm/TrialLeadCard";
import { BookTrialLeadDialog } from "@/components/csm/BookTrialLeadDialog";
import { celebrateFinish } from "@/components/onboarding-deck/celebrate";
import { TrialHomeView } from "./TrialHome";
import { TrialBookingDialog, type TrialSlotsResult } from "./TrialBookingDialog";
import {
  DEFAULT_TRIAL_DAY_SETTINGS,
  trialLeadStatusLabel,
  useTrialDaySettings,
  type ProposedTime,
  type SubmitTrialLeadInput,
  type TrialLead,
} from "@/hooks/useTrialDay";
import { callbackDays } from "../../../supabase/functions/_shared/callback.ts";

type Lens = "trialist" | "elena";

const LENSES: Array<{ key: Lens; label: string; who: string }> = [
  { key: "trialist", label: "Trialist", who: "Priya, on her trial day" },
  { key: "elena", label: "Elena", who: "Ops Command → Trialist leads" },
];

// What the trialist sees (trial names) and what Elena sees (real names).
const FIXTURE_CLIENTS = [
  { id: "client-northgate", company_name: "Northgate Recruitment", label: "B Recruitment" },
  { id: "client-winner", company_name: "Westbrook Recruitment", label: "W Recruitment" },
];

const TRIALIST = { id: "user-priya", full_name: "Priya Naidoo", email: "priya.naidoo@example.com" };
const OPS_LEAD = { id: "user-elena", full_name: "Elena Varga", email: "elena@meridiansales.example" };

/** What the fixture Close lookup returns, whatever link is pasted. */
const closeFixture = () => ({
  company_name: "Hays Construction",
  company_website: "hays-construction.co.uk",
  contact_name: "Tom Bradley",
  contact_title: "Head of Talent",
  contact_mobile: "+44 7700 900123",
  linkedin_url: "https://www.linkedin.com/in/tom-bradley-example",
});

/** A UK wall-clock time on a UK date, as an instant (BST or GMT). */
function zonedTimeToUtc(dateKey: string, hhmm: string): Date {
  const guess = new Date(`${dateKey}T${hhmm}:00Z`);
  const asLondon = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (asLondon.getTime() - asUtc.getTime()));
}

/** Fixture free times: every half hour (video) or quarter hour (callback),
 * 09:00 to 17:00 UK, on the next working days, from now. */
function fixtureSlots(kind: "video" | "phone"): TrialSlotsResult {
  const days = kind === "phone" ? callbackDays() : (() => {
    const out: string[] = [];
    for (let d = 0; out.length < 6 && d < 12; d++) {
      const day = new Date(Date.now() + d * 86_400_000);
      const key = day.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      const wd = new Date(`${key}T12:00:00Z`).getUTCDay();
      if (wd !== 0 && wd !== 6) out.push(key);
    }
    return out;
  })();
  const step = kind === "phone" ? 15 : 30;
  const slots: Array<{ starts_at: string; ends_at: string }> = [];
  for (const key of days) {
    for (let m = 9 * 60; m + step <= 17 * 60; m += step) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const start = zonedTimeToUtc(key, hhmm);
      if (start.getTime() < Date.now() + 30 * 60_000) continue;
      if ((m / step) % 5 === 3) continue; // a few busy gaps, like a real diary
      slots.push({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + step * 60_000).toISOString() });
    }
  }
  return { slots, duration_minutes: step === 15 ? 15 : 30, callback_available: true, calendar_checked: true };
}

let seq = 0;
const nowIso = () => new Date().toISOString();
const toProposed = (iso: string): ProposedTime => ({
  date: new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" }),
  time: new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }),
});

function leadFromInput(input: SubmitTrialLeadInput): TrialLead {
  seq += 1;
  const c = FIXTURE_CLIENTS.find((x) => x.id === input.client_profile_id) ?? null;
  return {
    id: `sandbox-lead-${seq}`,
    candidate_id: "sandbox-candidate",
    trialist_user_id: TRIALIST.id,
    client_profile_id: input.client_profile_id,
    close_lead_link: input.close_lead_link,
    company_name: input.company_name,
    company_website: input.company_website,
    contact_name: input.contact_name,
    contact_title: input.contact_title,
    contact_mobile: input.contact_mobile,
    contact_email: input.contact_email,
    linkedin_url: input.linkedin_url,
    currently_hiring: input.currently_hiring,
    job_roles: input.job_roles,
    job_spec_provided: input.job_spec_provided,
    open_to_receiving_cvs: input.open_to_receiving_cvs,
    cv_candidate_titles: input.cv_candidate_titles || null,
    cv_candidate_level: input.cv_candidate_level || null,
    other_decision_makers: input.other_decision_makers,
    decision_maker_status: input.decision_maker_status || null,
    decision_maker_email: input.decision_maker_email || null,
    push_through_reason: input.push_through_reason || null,
    proposed_times: input.chosen_times.map(toProposed),
    trialist_notes: input.trialist_notes || null,
    location_choice: input.location_choice,
    chosen_times: input.chosen_times,
    status: "submitted",
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    pushed_to_user_id: null,
    pushed_at: null,
    converted_meeting_id: null,
    converted_by: null,
    converted_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    trialist: TRIALIST,
    // Elena sees the real client.
    client: c ? { id: c.id, company_name: c.company_name } : null,
    pushed_to: null,
  };
}

export default function TrialSandbox() {
  const navigate = useNavigate();
  const { data: settings = DEFAULT_TRIAL_DAY_SETTINGS } = useTrialDaySettings();
  const [lens, setLens] = useState<Lens>("trialist");
  const [leads, setLeads] = useState<TrialLead[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [bookLead, setBookLead] = useState<TrialLead | null>(null);

  const update = (id: string, patch: Partial<TrialLead>) =>
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch, updated_at: nowIso() } : l)));

  const open = useMemo(() => leads.filter((l) => l.status === "submitted"), [leads]);
  const counts: Record<Lens, number> = { trialist: leads.length, elena: open.length };

  const exit = () => {
    if (window.history.length > 1) navigate(-1);
    else window.close();
  };

  const headerRight = (
    <SandboxBar lens={lens} setLens={setLens} counts={counts} onReset={() => setLeads([])} onExit={exit} />
  );

  if (lens === "trialist") {
    return (
      <>
        <TrialHomeView
          firstName="Priya"
          displayName={TRIALIST.full_name}
          settings={settings}
          leads={leads}
          clientLabels={Object.fromEntries(FIXTURE_CLIENTS.map((c) => [c.id, c.label]))}
          onLog={() => setLogOpen(true)}
          onSignOut={exit}
          headerRight={headerRight}
          headerLabel="Sandbox · Priya's trial day"
        />
        <TrialBookingDialog
          open={logOpen}
          onOpenChange={setLogOpen}
          onLogged={celebrateFinish}
          clientsOverride={FIXTURE_CLIENTS.map(({ id, label }) => ({ id, label }))}
          slotsOverride={(_clientId, kind) => fixtureSlots(kind)}
          closeLookupOverride={() => closeFixture()}
          onSubmitOverride={(input) => { setLeads((ls) => [leadFromInput(input), ...ls]); }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Trial Day sandbox</span>
          <div className="flex-1" />
          {headerRight}
        </div>
      </div>
      <PageContainer>
        <PageHeader
          title="Trialist leads"
          subtitle="Elena's view, as it renders in Ops Command > Trialist leads (Daniel sees the same on his Appointments page)"
          eyebrow="Ops Command"
        />
        <div className="space-y-4">
          {open.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              No trialist leads waiting. Switch to the Trialist lens and log one.
            </div>
          ) : (
            <div className="divide-y divide-border/50 rounded-xl border border-border/60">
              {open.map((l) => (
                <TrialLeadCard
                  key={l.id}
                  lead={l}
                  onBook={setBookLead}
                  onRejectOverride={(lead, reason) =>
                    update(lead.id, { status: "rejected", review_notes: reason || null, reviewed_by: OPS_LEAD.id, reviewed_at: nowIso() })
                  }
                />
              ))}
            </div>
          )}
          {leads.some((l) => l.status === "converted" || l.status === "rejected") && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium uppercase tracking-wide">Closed</p>
              {leads
                .filter((l) => l.status === "converted" || l.status === "rejected")
                .map((l) => (
                  <p key={l.id}>
                    {l.company_name} · {trialLeadStatusLabel[l.status]}
                    {l.review_notes ? ` · ${l.review_notes}` : ""}
                  </p>
                ))}
            </div>
          )}
        </div>
      </PageContainer>

      <BookTrialLeadDialog
        lead={bookLead}
        open={!!bookLead}
        onOpenChange={(o) => !o && setBookLead(null)}
        slotsOverride={(lead) => fixtureSlots(lead.location_choice === "phone" ? "phone" : "video").slots}
        onBookOverride={(lead) => {
          update(lead.id, { status: "converted", converted_meeting_id: `sandbox-meeting-${lead.id}`, converted_at: nowIso(), converted_by: OPS_LEAD.id });
        }}
      />
    </div>
  );
}

function SandboxBar({ lens, setLens, counts, onReset, onExit }: { lens: Lens; setLens: (l: Lens) => void; counts: Record<Lens, number>; onReset: () => void; onExit: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Sandbox · nothing is saved
      </span>
      <div className="flex rounded-full border border-border bg-background p-0.5">
        {LENSES.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setLens(l.key)}
            title={l.who}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              lens === l.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <UserRound className="h-3 w-3" /> {l.label}
            {counts[l.key] > 0 && (
              <span className={cn("rounded-full px-1.5 text-[10px] font-bold", lens === l.key ? "bg-white/25" : "bg-primary/15 text-primary")}>{counts[l.key]}</span>
            )}
          </button>
        ))}
      </div>
      <Button variant="outline" size="sm" className="gap-1" onClick={onReset}>
        <RotateCcw className="h-3.5 w-3.5" /> Reset
      </Button>
      <Button variant="ghost" size="sm" className="gap-1" onClick={onExit}>
        <X className="h-3.5 w-3.5" /> Exit
      </Button>
    </div>
  );
}
