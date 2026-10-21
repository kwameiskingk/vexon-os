// Trial day booking window (16 Oct 2026, the owner). "Log a meeting-ready lead"
// opens a booking page for the client the trialist represents, under its
// trial name ("B Recruitment"), on that client's real free times. The button
// books NOTHING: no calendar entry, no text, no email. The lead goes to
// submit_trial_lead and lands with Elena (Ops Command > Trialist leads) and
// Daniel, who book it on the client's calendar.
//
// Looks like the signed-in client booking page (src/pages/public/BookingPage
// staff board): event | details | calendar | times. Times come from
// booking-public action trial_slots, asked for by client id, so the slug and
// event name (which carry the real client name) never reach the trialist.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { invokeErrorMessage } from "@/lib/functionsError";
import logoMark from "@/assets/vexon-mark.svg";
import {
  EMPTY_TRIAL_QUALIFICATION,
  TRIAL_COPY,
  isGenerallyNotQualified,
  trialQualificationBlocker,
  trialQualificationColumns,
  type TrialQualificationState,
  type YesNo,
} from "@/lib/trialQualification";
import { useSubmitTrialLead, useTrialActiveClients, type JobRoleEntry, type SubmitTrialLeadInput } from "@/hooks/useTrialDay";
import { CALLBACK_TZ } from "../../../supabase/functions/_shared/callback.ts";

// The booking page's palette (BookingPage.tsx, 15 Oct UI pass).
const C = {
  ink: "#111113", soft: "#30343f", faint: "#66666e", line: "#e3e3e6", line2: "#d2d2d7",
  deep: "#3d5a80", lav: "#e8ecf1", surf2: "#f5f5f6",
  grad: "linear-gradient(135deg,#dedede,#9e9e9e,#6b7a90)",
};
const inputCls = "w-full border-0 border-b bg-transparent px-0 py-2 text-sm focus:outline-none focus:border-b-2";
const inputStyle: React.CSSProperties = { borderColor: C.line2, color: C.ink, borderRadius: 0 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSE_RE = /lead_[A-Za-z0-9]+/;
const MAX_TIMES = 3;

type Slot = { starts_at: string; ends_at: string };
export type TrialSlotsResult = {
  slots: Slot[];
  duration_minutes: number;
  callback_available: boolean;
  calendar_checked?: boolean;
};

const EMPTY_DETAILS = {
  close_lead_link: "", contact_name: "", contact_email: "", contact_mobile: "",
  contact_title: "", company_name: "", company_website: "", linkedin_url: "",
};

const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: CALLBACK_TZ });
const ukTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: CALLBACK_TZ, hour: "2-digit", minute: "2-digit" });
const ukLong = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: CALLBACK_TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a lead is logged (the page throws the confetti). */
  onLogged?: () => void;
  /** Sandbox: in-memory clients, slots, Close fixture and submit. */
  clientsOverride?: Array<{ id: string; label: string }>;
  slotsOverride?: (clientId: string, kind: "video" | "phone") => TrialSlotsResult;
  closeLookupOverride?: (link: string) => Partial<typeof EMPTY_DETAILS> | null;
  onSubmitOverride?: (input: SubmitTrialLeadInput) => Promise<void> | void;
}

function Pills<T extends string>({ value, options, onChange }: { value: T | ""; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([v, label]) => (
        <button
          key={v} type="button" onClick={() => onChange(v)}
          className="rounded-xl border px-3 py-2 text-sm font-medium transition-colors"
          style={value === v ? { borderColor: C.deep, background: C.lav, color: C.deep } : { borderColor: C.line, background: "#fff", color: C.soft }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const YES_NO = [["yes", "Yes"], ["no", "No"]] as const;
const KIND_OPTIONS: ReadonlyArray<readonly ["video" | "phone", string]> = [["video", "Video call"], ["phone", "Callback"]];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold" style={{ color: C.soft }}>{children}</label>;
}

export function TrialBookingDialog({ open, onOpenChange, onLogged, clientsOverride, slotsOverride, closeLookupOverride, onSubmitOverride }: Props) {
  const { data: liveClients = [] } = useTrialActiveClients(open && !clientsOverride);
  const clients = clientsOverride ?? liveClients;
  const [clientId, setClientId] = useState("");
  const [kind, setKind] = useState<"video" | "phone">("video");
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [closeState, setCloseState] = useState<"idle" | "looking" | "found" | "failed">("idle");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [q, setQ] = useState<TrialQualificationState>(EMPTY_TRIAL_QUALIFICATION);
  const [roleDraft, setRoleDraft] = useState<{ title: string; salary: string; currency: JobRoleEntry["currency"] }>({ title: "", salary: "", currency: "GBP" });
  const [notes, setNotes] = useState("");
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const submit = useSubmitTrialLead();

  // A fresh form every time it opens.
  useEffect(() => {
    if (!open) return;
    setKind("video"); setDetails(EMPTY_DETAILS); setCloseState("idle"); setCloseError(null);
    setQ(EMPTY_TRIAL_QUALIFICATION); setRoleDraft({ title: "", salary: "", currency: "GBP" });
    setNotes(""); setDayKey(null); setPicks([]);
  }, [open]);
  useEffect(() => {
    if (open && clients.length > 0 && !clients.some((c) => c.id === clientId)) setClientId(clients[0].id);
  }, [open, clients, clientId]);
  // Changing client or video/callback starts the times over.
  useEffect(() => { setDayKey(null); setPicks([]); }, [clientId, kind]);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const { data: avail, isLoading: slotsLoading, error: slotsError, refetch } = useQuery({
    queryKey: ["trial-slots", clientId, kind, !!slotsOverride],
    enabled: open && !!clientId,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<TrialSlotsResult> => {
      if (slotsOverride) return slotsOverride(clientId, kind);
      const { data, error } = await supabase.functions.invoke("booking-public", {
        body: { action: "trial_slots", client_profile_id: clientId, location_choice: kind },
      });
      const fail = await invokeErrorMessage(error, data);
      if (fail) throw new Error(fail);
      return data as TrialSlotsResult;
    },
  });
  const callbackAvailable = avail?.callback_available !== false;
  const duration = avail?.duration_minutes ?? (kind === "phone" ? 15 : 30);

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of avail?.slots || []) {
      const k = ukDay(s.starts_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [avail]);
  // Open the first day with times, and its month.
  useEffect(() => {
    if (dayKey || byDay.size === 0) return;
    const first = [...byDay.keys()][0];
    setDayKey(first);
    const [y, mo] = first.split("-").map(Number);
    setMonth(new Date(y, mo - 1, 1));
  }, [byDay, dayKey]);

  const grid = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      return { key: d.toLocaleDateString("en-CA"), dom: d.getDate(), inMonth: d.getMonth() === month.getMonth() };
    });
  }, [month]);
  const daySlots = dayKey ? byDay.get(dayKey) ?? [] : [];

  const togglePick = (iso: string) => {
    setPicks((p) => (p.includes(iso) ? p.filter((x) => x !== iso) : p.length >= MAX_TIMES ? p : [...p, iso]));
  };

  const lookupClose = async () => {
    const link = details.close_lead_link.trim();
    if (!link) return;
    if (!CLOSE_RE.test(link)) { setCloseError("That doesn't look like a Close lead link."); setCloseState("failed"); return; }
    setCloseState("looking"); setCloseError(null);
    if (closeLookupOverride) {
      const f = closeLookupOverride(link);
      if (!f) { setCloseError("Couldn't find that lead"); setCloseState("failed"); return; }
      setDetails((d) => ({ ...d, ...f })); setCloseState("found"); return;
    }
    const { data, error } = await supabase.functions.invoke("booking-public", { body: { action: "close_lead", close_lead_link: link } });
    const fail = await invokeErrorMessage(error, data);
    if (fail) { setCloseError(fail); setCloseState("failed"); return; }
    // The email never comes from Close: the trialist types it and checks it.
    setDetails((d) => ({
      ...d,
      contact_name: data.contact_name || d.contact_name,
      contact_title: data.contact_title || d.contact_title,
      contact_mobile: data.mobile || d.contact_mobile,
      company_name: data.company_name || d.company_name,
      company_website: data.company_website || d.company_website,
      linkedin_url: data.linkedin_url || d.linkedin_url,
    }));
    setCloseState("found");
  };

  const notQualified = isGenerallyNotQualified(q);
  const blocker = useMemo((): string | null => {
    if (!clientId) return "Pick the client you are representing.";
    if (!CLOSE_RE.test(details.close_lead_link.trim())) return "Paste the Close lead link.";
    if (!details.contact_name.trim()) return "Add the prospect's name.";
    if (!EMAIL_RE.test(details.contact_email.trim())) return "Add the prospect's email and check the spelling.";
    if (kind === "phone" && !details.contact_mobile.trim()) return "A callback needs their mobile number.";
    if (!details.company_name.trim()) return "Add the company.";
    const qb = trialQualificationBlocker(q);
    if (qb) return qb;
    if (picks.length === 0) return "Pick the time they want, then at least one more.";
    if (picks.length === 1) return "Now pick at least one more time that works for them.";
    return null;
  }, [clientId, details, kind, q, picks]);

  const addRole = () => {
    const title = roleDraft.title.trim();
    if (!title) return;
    setQ((s) => ({ ...s, roles: [...s.roles, { title, salary: roleDraft.salary ? Number(roleDraft.salary) : null, currency: roleDraft.currency }] }));
    setRoleDraft({ title: "", salary: "", currency: roleDraft.currency });
  };

  const busy = submit.isPending;
  const doLog = async () => {
    if (blocker || busy) return;
    const input: SubmitTrialLeadInput = {
      client_profile_id: clientId,
      close_lead_link: details.close_lead_link.trim(),
      company_name: details.company_name.trim(),
      company_website: details.company_website.trim(),
      contact_name: details.contact_name.trim(),
      contact_title: details.contact_title.trim(),
      contact_mobile: details.contact_mobile.trim(),
      contact_email: details.contact_email.trim(),
      linkedin_url: details.linkedin_url.trim(),
      ...trialQualificationColumns(q),
      trialist_notes: notes.trim(),
      location_choice: kind,
      chosen_times: picks,
    };
    try {
      if (onSubmitOverride) await onSubmitOverride(input);
      else await submit.mutateAsync(input);
      onOpenChange(false);
      onLogged?.();
      toast.success("Logged. Elena has it. Nothing was booked or sent.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't log the lead");
    }
  };

  const set = (k: keyof typeof EMPTY_DETAILS) => (e: React.ChangeEvent<HTMLInputElement>) => setDetails((d) => ({ ...d, [k]: e.target.value }));
  const name = client?.label ?? "your client";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[94vh] w-[96vw] max-w-[1240px] overflow-y-auto border p-0 [&>button]:hidden" style={{ borderColor: C.line, background: "#fff" }}>
        <DialogTitle className="sr-only">Log a meeting-ready lead for {name}</DialogTitle>
        <DialogDescription className="sr-only">See {name}'s free times and log the lead. Nothing is booked from here.</DialogDescription>
        <button type="button" aria-label="Close" onClick={() => !busy && onOpenChange(false)} className="absolute right-3 top-3 z-10 rounded-full p-1" style={{ color: C.faint }}>
          <X className="h-5 w-5" />
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1.15fr_1.25fr_1fr]" style={{ color: C.ink }}>
          {/* ── The client ── */}
          <div className="border-b p-6 xl:border-b-0 xl:border-r" style={{ borderColor: C.line }}>
            <div className="mb-4 flex items-center gap-2.5">
              <span className="trial-mark-tile"><img src={logoMark} alt="" className="h-5 w-5" /></span>
              <span className="font-bold">{name}</span>
            </div>
            <h2 className="font-head text-[22px] font-medium leading-snug tracking-[-0.02em]">Log a meeting-ready lead</h2>
            {clients.length > 1 ? (
              <label className="mt-3 inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-bold" style={{ background: C.lav, color: C.deep }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] text-white" style={{ background: C.grad }}>{initial}</span>
                Booking for:
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="bg-transparent font-bold outline-none" aria-label="Client you are representing">
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            ) : (
              <span className="mt-3 inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-xs font-bold" style={{ background: C.lav, color: C.deep }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] text-white" style={{ background: C.grad }}>{initial}</span>
                Booking for: {name}
              </span>
            )}
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: C.soft }}>
              This is the booking page of the client you are representing. Use it to see when they are free and to log your meeting-ready leads.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: C.soft }}>
              Find out whether the prospect would rather have a video discovery call or a callback, then pick the times that suit them from the client's real availability. Nothing is booked from here: Elena reviews every lead and books the meeting with the client.
            </p>
            <div className="mt-5 space-y-2 text-sm" style={{ color: C.soft }}>
              <p>{duration} minutes</p>
              <p>{kind === "phone" ? "Callback: the client rings the prospect" : "Video call"}</p>
              <p>UK time (London)</p>
            </div>
          </div>

          {/* ── The prospect ── */}
          <div className="space-y-3.5 border-b p-6 xl:border-b-0 xl:border-r" style={{ borderColor: C.line }}>
            <h3 className="font-bold">The prospect</h3>
            <div>
              <Label>Close lead link</Label>
              <input className={inputCls} style={inputStyle} placeholder="https://app.close.com/lead/…" value={details.close_lead_link}
                onChange={(e) => { setDetails((d) => ({ ...d, close_lead_link: e.target.value })); setCloseState("idle"); }} onBlur={lookupClose} />
              <p className="mt-1 text-[11px]" style={{ color: closeState === "failed" ? "#be123c" : C.faint }}>
                {closeState === "looking" ? "Looking up the lead…"
                  : closeState === "found" ? "Filled in from Close. Type the email yourself and check it."
                  : closeState === "failed" ? `${closeError || "Couldn't find that lead"}. Fill it in by hand.`
                  : "Paste the Close link to fill in the prospect."}
              </p>
            </div>
            <div><Label>Name *</Label><input className={inputCls} style={inputStyle} value={details.contact_name} onChange={set("contact_name")} /></div>
            <div><Label>Email *</Label><input className={inputCls} style={inputStyle} type="email" placeholder="Type it and check the spelling" value={details.contact_email} onChange={set("contact_email")} /></div>
            <div>
              <Label>How would they like to meet? *</Label>
              <Pills<"video" | "phone"> value={kind} onChange={setKind}
                options={callbackAvailable ? KIND_OPTIONS : KIND_OPTIONS.slice(0, 1)} />
              <p className="mt-1 text-[11px]" style={{ color: C.faint }}>
                {kind === "phone"
                  ? "A 15-minute call from the client to the prospect's mobile, today or in the next two working days."
                  : "A video call with the client. The link goes out when the meeting is booked."}
              </p>
            </div>
            <div>
              <Label>Mobile <span style={{ color: kind === "phone" ? C.deep : C.faint }}>{kind === "phone" ? "(required, the client will call this number)" : "(for text reminders)"}</span></Label>
              <input className={inputCls} style={inputStyle} placeholder="+44…" value={details.contact_mobile} onChange={set("contact_mobile")} />
            </div>
            <div><Label>Their job title</Label><input className={inputCls} style={inputStyle} value={details.contact_title} onChange={set("contact_title")} /></div>
            <div><Label>Company *</Label><input className={inputCls} style={inputStyle} value={details.company_name} onChange={set("company_name")} /></div>
            <div><Label>Company website</Label><input className={inputCls} style={inputStyle} value={details.company_website} onChange={set("company_website")} /></div>
            <div><Label>LinkedIn</Label><input className={inputCls} style={inputStyle} value={details.linkedin_url} onChange={set("linkedin_url")} /></div>

            <div className="pt-2">
              <Label>{TRIAL_COPY.hiring} *</Label>
              <Pills value={q.hiring} options={YES_NO} onChange={(v: YesNo) => setQ((s) => ({ ...s, hiring: v, openCvs: "", cvTitles: "", cvLevel: "", continueReason: "" }))} />
            </div>
            {q.hiring === "yes" && (
              <div className="space-y-2 rounded-xl p-3" style={{ background: C.surf2 }}>
                <Label>{TRIAL_COPY.roles} ({q.roles.length} added)</Label>
                {q.roles.map((r, i) => (
                  <div key={`${r.title}-${i}`} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
                    <span className="flex-1 truncate font-medium">{r.title}</span>
                    {r.salary != null && <span style={{ color: C.faint }}>{r.currency} {r.salary.toLocaleString()}</span>}
                    <button type="button" aria-label="Remove role" onClick={() => setQ((s) => ({ ...s, roles: s.roles.filter((_, x) => x !== i) }))}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_90px_64px] gap-2">
                  <input className={inputCls} style={inputStyle} placeholder="Job title" value={roleDraft.title} onChange={(e) => setRoleDraft({ ...roleDraft, title: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }} />
                  <input className={inputCls} style={inputStyle} placeholder="Salary" inputMode="numeric" value={roleDraft.salary} onChange={(e) => setRoleDraft({ ...roleDraft, salary: e.target.value.replace(/[^\d]/g, "") })} />
                  <select className={inputCls} style={inputStyle} value={roleDraft.currency} onChange={(e) => setRoleDraft({ ...roleDraft, currency: e.target.value as JobRoleEntry["currency"] })}>
                    {(["GBP", "USD", "EUR", "ZAR"] as const).map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <button type="button" disabled={!roleDraft.title.trim()} onClick={addRole} className="text-xs font-semibold disabled:opacity-40" style={{ color: C.deep }}>
                  + {q.roles.length ? "Add another role" : "Add role"}
                </button>
                <div><Label>{TRIAL_COPY.jobSpec} *</Label><Pills value={q.jobSpec} options={YES_NO} onChange={(v: YesNo) => setQ((s) => ({ ...s, jobSpec: v }))} /></div>
              </div>
            )}
            {q.hiring === "no" && (
              <div><Label>{TRIAL_COPY.openCvs} *</Label><Pills value={q.openCvs} options={YES_NO} onChange={(v: YesNo) => setQ((s) => ({ ...s, openCvs: v, continueReason: "" }))} /></div>
            )}
            {q.hiring === "no" && q.openCvs === "yes" && (
              <>
                <div><Label>{TRIAL_COPY.cvTitles} *</Label><input className={inputCls} style={inputStyle} value={q.cvTitles} onChange={(e) => setQ((s) => ({ ...s, cvTitles: e.target.value }))} /></div>
                <div><Label>{TRIAL_COPY.cvLevel} *</Label><input className={inputCls} style={inputStyle} placeholder="junior, mid, senior, head of…" value={q.cvLevel} onChange={(e) => setQ((s) => ({ ...s, cvLevel: e.target.value }))} /></div>
              </>
            )}
            {notQualified && (
              <div className="space-y-2 rounded-xl p-3 text-xs" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239" }}>
                <p className="font-semibold">{TRIAL_COPY.notQualifiedTitle}</p>
                <p>{TRIAL_COPY.notQualifiedBody}</p>
                <textarea className={inputCls} style={{ ...inputStyle, background: "#fff" }} rows={2} placeholder={TRIAL_COPY.continuePlaceholder} value={q.continueReason} onChange={(e) => setQ((s) => ({ ...s, continueReason: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>{TRIAL_COPY.otherDms} *</Label>
              <Pills value={q.otherDms} options={YES_NO} onChange={(v: YesNo) => setQ((s) => ({ ...s, otherDms: v, dmStatus: "", dmEmail: "" }))} />
            </div>
            {q.otherDms === "yes" && (
              <div className="space-y-1.5 text-sm">
                {TRIAL_COPY.dmOptions.map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="trial-dm" checked={q.dmStatus === value} onChange={() => setQ((s) => ({ ...s, dmStatus: value }))} />
                    {label}
                  </label>
                ))}
                {q.dmStatus === "joining" && (
                  <input className={inputCls} style={inputStyle} type="email" placeholder="Decision maker's email" value={q.dmEmail} onChange={(e) => setQ((s) => ({ ...s, dmEmail: e.target.value }))} />
                )}
              </div>
            )}
            <div>
              <Label>Notes for Elena</Label>
              <textarea className={inputCls} style={inputStyle} rows={2} placeholder="Tone, objections, what they asked for" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {/* ── Calendar ── */}
          <div className="border-b p-6 xl:border-b-0 xl:border-r" style={{ borderColor: C.line }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-bold">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
              <div className="flex gap-1">
                <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: C.line }}><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: C.line }}><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="mb-2 text-xs" style={{ color: C.faint }}>
              {kind === "phone" ? "Callbacks: today and the next two working days" : "Days the client has free times"}
            </p>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wider" style={{ color: C.faint }}>
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <span key={d}>{d}</span>)}
            </div>
            {slotsLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: C.soft }}><Loader2 className="h-4 w-4 animate-spin" /> Checking the client's calendar…</div>
            ) : slotsError ? (
              <div className="py-12 text-center text-sm" style={{ color: C.soft }}>
                <p className="font-semibold" style={{ color: C.ink }}>Couldn't load the client's times</p>
                <p className="text-xs">{(slotsError as Error).message}</p>
                <button type="button" onClick={() => refetch()} className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: C.line }}>Try again</button>
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {grid.map((c, i) => {
                  const has = byDay.has(c.key);
                  return (
                    <button key={i} type="button" disabled={!has || !c.inMonth} onClick={() => setDayKey(c.key)}
                      className="flex aspect-square items-center justify-center rounded-[6px] text-sm tabular-nums"
                      style={!c.inMonth ? { color: "transparent" }
                        : c.key === dayKey ? { background: C.grad, color: "#0f0f11", fontWeight: 700 }
                        : has ? { background: C.lav, color: C.deep, fontWeight: 600 }
                        : { color: C.faint }}>
                      {c.dom}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-4 border-t pt-3 text-xs" style={{ borderColor: C.line, color: C.soft }}>Times shown in UK time (London)</p>
          </div>

          {/* ── Times ── */}
          <div className="flex flex-col p-6">
            {!dayKey ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-center">
                <p className="text-sm font-semibold">Pick a day</p>
                <p className="text-xs" style={{ color: C.faint }}>{name}'s free times appear here.</p>
              </div>
            ) : (
              <div>
                <h3 className="font-head text-[17px] font-medium">{new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h3>
                <p className="mb-3 text-xs" style={{ color: C.soft }}>{daySlots.length} free times · {duration} min · UK time</p>
                <div className={cn(kind === "phone" ? "grid grid-cols-3 gap-1.5" : "space-y-2")}>
                  {daySlots.map((s) => {
                    const i = picks.indexOf(s.starts_at);
                    return (
                      <button key={s.starts_at} type="button" onClick={() => togglePick(s.starts_at)}
                        className="w-full rounded-[6px] py-2 text-sm font-semibold tabular-nums"
                        style={i === 0 ? { border: "1.5px solid transparent", background: `linear-gradient(#fff,#fff) padding-box, ${C.grad} border-box` }
                          : i > 0 ? { border: "1px solid #c7d0f5", background: "#eef1fd", color: C.deep }
                          : { border: `1px solid ${C.line2}`, background: "#fff" }}>
                        {ukTime(s.starts_at)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {picks.length > 0 && (
              <div className="mt-4 border-t pt-3" style={{ borderColor: C.line }}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: C.faint }}>Times that work for them</p>
                <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px]">
                  {picks.map((p, i) => (
                    <li key={p}>{ukLong(p)}{i === 0 && <b> (first choice)</b>}
                      <button type="button" aria-label="Remove time" onClick={() => togglePick(p)} className="ml-1 align-middle" style={{ color: C.faint }}><X className="inline h-3 w-3" /></button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="mt-4 space-y-2">
              <p className="text-[11px]" style={{ color: C.faint }}>{blocker ?? "Ready. Nothing is booked yet: this goes to Elena."}</p>
              <button type="button" disabled={!!blocker || busy} onClick={doLog}
                className="w-full rounded-[6px] py-3 font-bold transition-opacity disabled:opacity-40" style={{ background: C.grad, color: "#0f0f11" }}>
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Log meeting-ready lead"}
              </button>
              <p className="flex items-center gap-1 text-[11px]" style={{ color: C.faint }}><CheckCircle2 className="h-3 w-3" /> Up to {MAX_TIMES} times. The first one you pick is their first choice.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
