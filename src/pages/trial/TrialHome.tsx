// Trial Day (15 Sep 2026): the only page a trialist login can reach.
//
// One button — "Log a meeting-ready lead" — plus the trial-day pack (Marcus's
// list: how the day works, Meridian, Close, good calls, script, bad calls, how
// to qualify) as expandable cards driven by trial_day_settings, the briefing
// links, and the trialist's own leads with their status. Since 16 Oct 2026
// the button opens a booking page for the client they represent, under its
// trial name, on the client's real free times (TrialBookingDialog). Logging
// books nothing; Elena or Daniel book it from their Trialist leads tab.
//
// TrialHomeView is presentational: the sandbox (/trial/sandbox) renders it
// on in-memory state. The default export is the live container, contained
// by ProtectedRoute on profiles.in_trial_mode (useTrialMode).

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowUpRight, ChevronDown, ExternalLink, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ButtonV2, Pill } from "@/components/ui-v2";
import { BRAND } from "@/lib/departmentTheme";
import { cn } from "@/lib/utils";
import logoMark from "@/assets/vexon-mark.svg";
import {
  formatProposedTime,
  trialLeadStatusLabel,
  useMyTrialLeads,
  useTrialActiveClients,
  useTrialDaySettings,
  DEFAULT_TRIAL_DAY_SETTINGS,
  type TrialDaySettings,
  type TrialLead,
  type TrialLeadStatus,
} from "@/hooks/useTrialDay";
import { TrialBookingDialog } from "./TrialBookingDialog";
import { celebrateFinish } from "@/components/onboarding-deck/celebrate";

export const TRIAL_STATUS_CLASSES: Record<TrialLeadStatus, string> = {
  submitted: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30",
  pushed: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30",
  converted: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected: "bg-muted text-muted-foreground border-border",
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** Turn a YouTube / Loom share link into something an iframe can show. */
export const embedSrc = (url: string): string => {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("loom.com") && u.pathname.startsWith("/share/")) {
      return `https://www.loom.com/embed/${u.pathname.split("/")[2]}`;
    }
    return url;
  } catch {
    return url;
  }
};

const isVideoLink = (url: string) => /youtube\.com|youtu\.be|loom\.com|wistia\.com|vimeo\.com/.test(url);

export interface TrialHomeViewProps {
  firstName: string;
  displayName: string;
  settings: TrialDaySettings;
  leads: TrialLead[];
  leadsLoading?: boolean;
  /** client_profile_id → trial name ("B Recruitment"). Never a real name. */
  clientLabels?: Record<string, string>;
  onLog: () => void;
  onSignOut: () => void;
  /** Sandbox: replaces the header's right side. */
  headerRight?: React.ReactNode;
  /** Sandbox: a label under the wordmark. */
  headerLabel?: string;
}

export function TrialHomeView({
  firstName,
  displayName,
  settings,
  leads,
  leadsLoading = false,
  clientLabels = {},
  onLog,
  onSignOut,
  headerRight,
  headerLabel,
}: TrialHomeViewProps) {
  const today = format(new Date(), "EEE d MMM");
  const embed = settings.embed_mode && settings.embed_video_url;
  const sections = settings.sections.filter((s) => s.title.trim());

  return (
    <div className="min-h-screen bg-[var(--bg)] text-foreground">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <img src={logoMark} alt="Vexon OS" className="h-7 w-7 rounded-[6px]" />
          <span className="font-head text-[15px] font-medium tracking-[-0.01em]">Meridian</span>
          <Pill variant="info">Trial day</Pill>
          {headerLabel && <span className="hidden text-xs text-muted-foreground md:inline">{headerLabel}</span>}
          <div className="flex-1" />
          {headerRight ?? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {displayName} · {today}
              </span>
              <ButtonV2 variant="ghost" size="sm" onClick={onSignOut}>Sign out</ButtonV2>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-9 px-5 py-10">
        <div className="space-y-1.5">
          <h1 className="font-head text-[28px] font-medium tracking-[-0.02em]">
            {greeting()}, {firstName}.
          </h1>
          {/* 16 Oct 2026 (the owner): what the day is, in one line. */}
          <p className="max-w-xl text-sm text-muted-foreground">
            Welcome to Meridian trial day. On this platform you will be logging meeting-ready leads on behalf of the
            client you are representing.
          </p>
        </div>

        {/* The one action. 16 Oct: no hint line and no scoreboard under it. */}
        <ButtonV2 variant="primary" onClick={onLog} className="h-12 w-full justify-center text-[14px]">
          Log a meeting-ready lead
        </ButtonV2>

        {/* Briefing — Dev Centre → Trialist access owns every word here. */}
        <div className="space-y-3">
        <p className="rr-eyebrow">Briefing</p>
        <section className="overflow-hidden rounded-[10px] bg-[var(--surf2)]">
          <div className="space-y-4 p-5">
            <h2 className="font-head text-[17px] font-medium tracking-[-0.01em]">{settings.intro_title || "How today works"}</h2>
            {settings.intro_body && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{settings.intro_body}</p>
            )}
            {embed && (
              <div className="space-y-2">
                {settings.embed_title && <p className="text-sm font-medium">{settings.embed_title}</p>}
                <div className="aspect-video overflow-hidden rounded-xl border border-border/70 bg-black">
                  <iframe
                    src={embedSrc(settings.embed_video_url!)}
                    title={settings.embed_title ?? "Trial-day briefing"}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
            {(settings.doc_url || settings.video_url) && (
              <div className="flex flex-wrap gap-2">
                {settings.doc_url && (
                  <a href={settings.doc_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--line2)] px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[var(--accent)]">
                    <ExternalLink className="h-3.5 w-3.5" /> {settings.doc_label || "Trial-day briefing"}
                  </a>
                )}
                {settings.video_url && (
                  <a href={settings.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--line2)] px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[var(--accent)]">
                    <PlayCircle className="h-3.5 w-3.5" /> {settings.video_label || "Close walkthrough"}
                  </a>
                )}
              </div>
            )}
          </div>
          {sections.length > 0 && (
            <div className="divide-y divide-border/60 border-t border-border/60">
              {sections.map((s, i) => (
                <PackSection key={`${s.title}-${i}`} index={i + 1} title={s.title} body={s.body} url={s.url} urlLabel={s.url_label} />
              ))}
            </div>
          )}
        </section>
        </div>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-head text-[17px] font-medium tracking-[-0.01em]">Your leads</h2>
            {leads.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {leads.length} logged · {leads.filter((l) => l.status === "converted").length} booked
              </span>
            )}
          </div>
          {leadsLoading ? (
            <div className="border-t border-[var(--line)] py-8 text-center text-[12px] text-[var(--dim)]">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="border-t border-[var(--line)] py-8 text-center text-[12px] text-[var(--dim)]">
              Nothing logged yet. Your first qualified lead goes here.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {leads.map((l) => (
                <LeadRow key={l.id} lead={l} clientLabel={l.client_profile_id ? clientLabels[l.client_profile_id] ?? null : null} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function PackSection({ index, title, body, url, urlLabel }: { index: number; title: string; body: string; url: string; urlLabel: string }) {
  const [open, setOpen] = useState(false);
  const hasBody = !!body.trim() || !!url.trim();
  return (
    <div>
      <button
        type="button"
        onClick={() => hasBody && setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors", hasBody ? "hover:bg-muted/40" : "cursor-default")}
        aria-expanded={open}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: BRAND.gradientDeep }}>
          {index}
        </span>
        <span className="flex-1 text-sm font-medium">{title}</span>
        {!hasBody && <span className="text-[11px] text-muted-foreground">Coming from Marcus</span>}
        {hasBody && <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />}
      </button>
      {open && hasBody && (
        <div className="space-y-3 px-5 pb-4 pl-14">
          {body.trim() && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{body}</p>}
          {url.trim() && isVideoLink(url) ? (
            <div className="aspect-video overflow-hidden rounded-xl border border-border/70 bg-black">
              <iframe src={embedSrc(url)} title={title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : url.trim() ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--line2)] px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[var(--accent)]">
              <ExternalLink className="h-3.5 w-3.5" /> {urlLabel || "Open"}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, clientLabel }: { lead: TrialLead; clientLabel?: string | null }) {
  const summary = [
    lead.currently_hiring === true
      ? `Hiring${lead.job_roles.length ? ` · ${lead.job_roles.map((r) => r.title).join(", ")}` : ""}`
      : lead.open_to_receiving_cvs === true
      ? `Open to CVs${lead.cv_candidate_level ? ` · ${lead.cv_candidate_level}` : ""}`
      : "Pushed through with a reason",
    // Trial name only ("B Recruitment"): the trialist never sees a real client name.
    clientLabel ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-center gap-3 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {lead.company_name || "Unnamed company"}
          {lead.contact_name ? <span className="text-muted-foreground"> · {lead.contact_name}</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{summary}</p>
        {/* 16 Sep (the owner): the proposed times were run together on the summary
            line — three date-times joined by commas reads as noise. One chip
            each, on their own row. */}
        {lead.proposed_times.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {lead.proposed_times.map((t, i) => (
              <li key={i} className="rounded-[4px] bg-[var(--surf2)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--ink2)]">
                {formatProposedTime(t)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Pill variant={lead.status === "converted" ? "ok" : lead.status === "submitted" || lead.status === "pushed" ? "info" : "default"}>
        {trialLeadStatusLabel[lead.status]}
      </Pill>
      <a href={lead.close_lead_link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" title="Open in Close">
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </li>
  );
}

/** The live container. */
export default function TrialHome() {
  const { user } = useAuth();
  const [logOpen, setLogOpen] = useState(false);
  const { data: settings = DEFAULT_TRIAL_DAY_SETTINGS } = useTrialDaySettings();
  const { data: leads = [], isLoading: leadsLoading } = useMyTrialLeads();
  const { data: trialClients = [] } = useTrialActiveClients();
  const clientLabels = useMemo(() => Object.fromEntries(trialClients.map((c) => [c.id, c.label])), [trialClients]);

  const { data: profile } = useQuery({
    queryKey: ["trial-profile", user?.id],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, email").eq("id", user!.id).maybeSingle();
      return (data as { full_name: string | null; email: string | null } | null) ?? null;
    },
  });

  const displayName = profile?.full_name || profile?.email || "";
  const firstName = useMemo(() => {
    const n = (profile?.full_name ?? "").trim();
    return n ? n.split(/\s+/)[0] : "there";
  }, [profile?.full_name]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.assign("/");
  };

  return (
    <>
      <TrialHomeView
        firstName={firstName}
        displayName={displayName}
        settings={settings}
        leads={leads}
        leadsLoading={leadsLoading}
        clientLabels={clientLabels}
        onLog={() => setLogOpen(true)}
        onSignOut={signOut}
      />
      <TrialBookingDialog open={logOpen} onOpenChange={setLogOpen} onLogged={celebrateFinish} />
    </>
  );
}
