import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Clock, Video, Globe2, CheckCircle2, CalendarX2, ChevronLeft, ChevronRight, Link2,
  Copy, Check, LayoutGrid,
} from "lucide-react";
import bookingsLogo from "@/assets/vexon-mark-tile.svg";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import { tzDisplay, tzShort } from "@/lib/timezoneLabels";
import { CALLBACK_TZ, backupLabel } from "../../../supabase/functions/_shared/callback.ts";

/**
 * Public self-booking page — /bookings/<slug>.
 * v3 (Marcus's redesign, 2026-08-20): four panels visible at once —
 * event description | Close link + contact + qualification questions |
 * month calendar | times + confirm. Round-robin events hide the host picker
 * (a host is assigned at booking). lock_timezone pins the display timezone.
 * staff_mode + a signed-in Vexon OS session unlocks Close-lead autofill and
 * auto-logs the dashboard meeting. Anonymous visitors (ads) book normally.
 * v4 (the owner, 2026-09-14): public / embed mode. Prospects — the meridiansales.example
 * <iframe> (`?embed=1` or any framed load) and anyone not signed in — get a
 * Calendly-style flow: event details | calendar + times, then the form once
 * a time is picked. Embed strips the chrome, posts its height to the parent
 * and sends the redirect to the top window. Staff keep the four-panel board.
 */

type Question = {
  id: string; label: string;
  type: "short_text" | "long_text" | "yes_no" | "dropdown";
  required: boolean; options: string[];
};
type Slot = { starts_at: string; ends_at: string };
type EventPayload = {
  name: string; description: string | null; duration_minutes: number;
  booking_horizon_days?: number | null;
  offer_phone_choice?: boolean;
  questions: Question[]; hosts: Array<{ host_user_id: string; name: string }>;
  round_robin: boolean; staff_mode: boolean; lock_timezone: string | null;
  accepting_bookings: boolean;
  location_type?: "google_meet" | "phone";
  is_client_event?: boolean;
  event_purpose?: string | null;
  client?: { name: string; logo: string | null } | null;
  /** Client events: prospect-worded hiring questions on the signed-out page. */
  public_quals?: boolean;
  /** Signed-in setter on a client event: their tag for the public link. */
  my_ref?: string | null;
  /** Client events with the phone choice (16 Oct 2026): it is a Callback. */
  callback?: { minutes: number; max_backups: number } | null;
};

type Brand = { name: string; logo: string | null };

/** A client's logo, or its initial on the brand gradient when it has none. */
function BrandMark({ brand, size }: { brand: Brand; size: number }) {
  return brand.logo ? (
    <img src={brand.logo} alt="" className="rounded-xl object-contain bg-white shrink-0"
      style={{ width: size, height: size, border: `1px solid ${C.line}` }} />
  ) : (
    <span className="rounded-xl flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: C.gradDiag, fontSize: size / 2.4 }}>
      {brand.name.slice(0, 1)}
    </span>
  );
}

const TIMEZONES = [
  "Europe/London", "Africa/Johannesburg", "Europe/Dublin", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Asia/Dubai", "Australia/Sydney", "UTC",
];
const detectTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"; }
  catch { return "Europe/London"; }
};

// Consumer email providers — staff-mode bookings warn on these and require a
// push-through reason (Marcus, 21 Aug). Keep in sync with the server list in
// supabase/functions/booking-public/index.ts, which enforces the same rule.
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "outlook.co.uk", "live.com", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "proton.me", "gmx.com", "gmx.co.uk",
  "mail.com", "btinternet.com", "sky.com", "talktalk.net", "virginmedia.com",
]);

// 15 Oct 2026 (UI pass): the page speaks the Vexon OS design system, light
// by default: paper ground, ink, hairlines, indigo accent, the brand
// gradient only on the selected day, the selected slot's border and the
// Confirm button. Values are the light tokens from DESIGN_SPEC.
const C = {
  ink: "#111113", soft: "#30343f", faint: "#66666e", line: "#e3e3e6", line2: "#d2d2d7",
  purple: "#3d5a80", deep: "#3d5a80", pink: "#dedede",
  lav: "#e8ecf1",
  bg: "#ffffff", surf2: "#f5f5f6",
  grad: "linear-gradient(135deg,#dedede,#9e9e9e,#6b7a90)",
  gradDiag: "linear-gradient(135deg,#dedede,#9e9e9e,#6b7a90)",
};

const inputCls =
  "w-full border-0 border-b bg-transparent px-0 py-2 text-sm focus:outline-none focus:border-b-2";
const inputStyle = {
  borderColor: C.line2, color: C.ink, borderRadius: 0,
} as React.CSSProperties;
const labelStyle = { color: C.soft } as React.CSSProperties;

/** `accepting: null` hides the status pill entirely — used while loading and on
 * the error screen, where there is no event to describe. It used to default to
 * true there, so an unavailable link still showed a green "Accepting bookings"
 * badge above "This booking link isn't available" (the owner, 26 Aug). */
function Shell({
  children, accepting = true, embed = false, innerRef, brand = null, actions = null,
}: {
  children: React.ReactNode; accepting?: boolean | null; embed?: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
  /** Client events (8 Oct): the client's name and logo replace Kronos by Meridian. */
  brand?: Brand | null;
  /** Staff tools pinned top right (copy public link, switch client). */
  actions?: React.ReactNode;
}) {
  // Embed mode (meridiansales.example iframe): no hero gradient, no header strip, no
  // page margins — the marketing page supplies all of that. The card fills
  // the iframe and the parent sizes it from our height messages.
  if (embed) {
    return (
      <div ref={innerRef} data-light-surface className="px-0 py-0" style={{ colorScheme: "light", background: "transparent" }}>
        {children}
        <p className="text-center text-[10px] mt-2 mb-1" style={{ color: C.faint }}>
          Powered by <span className="font-semibold" style={{ color: C.soft }}>Vexon OS</span>
        </p>
      </div>
    );
  }
  return (
    <div
      ref={innerRef}
      data-light-surface
      className="min-h-screen px-4 py-8"
      style={{ colorScheme: "light", background: C.bg, color: C.ink }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          {brand ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandMark brand={brand} size={36} />
              <span className="text-sm font-bold truncate" style={{ color: C.ink }}>{brand.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <img src={logoGradient} alt="Vexon OS" className="h-[18px] w-auto" />
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: C.faint }}>Kronos</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
          {actions}
          {accepting !== null && (
            <span
              className="inline-flex items-center gap-2 rounded-[4px] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em]"
              style={{ background: accepting ? "#dcf3e4" : C.surf2, color: accepting ? "#1d7a3f" : C.faint }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: accepting ? "#1d7a3f" : "#8e8e96" }} />
              {accepting ? "Accepting bookings" : "Not currently accepting bookings"}
            </span>
          )}
          </div>
        </div>
        {children}
        <p className="text-center text-[11px] mt-6" style={{ color: C.faint }}>
          Powered by <span className="font-semibold" style={{ color: C.soft }}>Vexon OS</span>
        </p>
      </div>
    </div>
  );
}

/** True when this page is rendered inside another site's <iframe>. A
 * cross-origin parent throws on window.top access — that still means "framed". */
const inIframe = () => {
  try { return window.self !== window.top; } catch { return true; }
};

/** Dev-only layout mock (`?demo=1`, never in production builds): headless
 * screenshots can't reach the booking-public function, so this stands in an
 * event + a fortnight of slots. */
const DEMO_EVENT: EventPayload = {
  name: "Discovery call with Meridian Sales Partners",
  description:
    "A 30-minute call to understand your agency, where you're losing revenue and whether we can help. " +
    "No pitch deck — just questions and honest answers.\n\nIf you need to move it, reply to the confirmation email.",
  duration_minutes: 30,
  questions: [
    { id: "q1", label: "What does your agency specialise in?", type: "short_text" as const, required: true, options: [] },
    { id: "q2", label: "Roughly how many recruiters do you have?", type: "dropdown" as const, required: true, options: ["1-5", "6-15", "16-50", "50+"] },
    { id: "q3", label: "Anything you'd like us to prepare?", type: "long_text" as const, required: false, options: [] },
  ],
  hosts: [{ host_user_id: "demo-host", name: "Marcus Hale" }],
  round_robin: false, staff_mode: true, lock_timezone: null, accepting_bookings: true,
  location_type: "google_meet" as const, is_client_event: false, event_purpose: null, client: null,
};
const demoSlots = (): Slot[] => {
  const out: Slot[] = [];
  const now = new Date();
  for (let d = 1; d <= 20; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (const h of [9, 9.5, 10, 11, 11.5, 13, 14, 14.5, 15, 16]) {
      const start = new Date(day); start.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      out.push({ starts_at: start.toISOString(), ends_at: end.toISOString() });
    }
  }
  return out;
};

/** Browser tab: "Kronos by Meridian" on the public booking pages (the owner, 19 Sep). */
function useKronosTitle(suffix?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = suffix ? `${suffix} · Kronos by Meridian` : "Kronos by Meridian";
    return () => { document.title = prev; };
  }, [suffix]);
}

export default function BookingPage() {
  useKronosTitle();
  const { slug } = useParams<{ slug: string }>();
  // Tokenised follow-up link: the AE sends it, the prospect picks a time. The
  // token pins the AE's calendar and carries the prefill server-side.
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";
  // Client public links copied by a setter carry their tag, so a prospect who
  // books themselves is credited to that setter (8 Oct).
  const setterRef = searchParams.get("ref") || "";
  // A copied public link is always the prospect page, even when the person
  // opening it is signed in to Vexon OS (8 Oct: a setter testing their own
  // link got the staff page). Calls go out with the anon key so the server
  // treats the booking as the prospect's too.
  const publicView = !!setterRef || searchParams.get("view") === "public";
  const publicHeaders = publicView
    ? { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }
    : undefined;
  // Public / embed mode — the page is framed by meridiansales.example (or asked for it
  // explicitly). Staff-only UI is hidden, chrome is stripped and the layout is
  // the Calendly-style two-column flow. Prospects never see staff wording.
  const embed = searchParams.get("embed") === "1" || inIframe();
  const demo = import.meta.env.DEV && searchParams.get("demo") === "1";
  const [tz, setTz] = useState(detectTz);
  const [monthCursor, setMonthCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  // Prospect flow: the details step has been completed (15 Sep order).
  // 17 Sep (the owner): the website qualifies people itself and hands their
  // details over in the URL, so ?lite=1 opens straight on the calendar —
  // no details form, no questions. "Change" brings the form back.
  const lite = searchParams.get("lite") === "1"
    && !!(searchParams.get("name") || "").trim() && !!(searchParams.get("email") || "").trim();
  const [detailsDone, setDetailsDone] = useState(lite);
  const [done, setDone] = useState(false);
  const [meetingLogged, setMeetingLogged] = useState(false);
  const [prospect, setProspect] = useState({ name: "", email: "", mobile: "" });
  const [companyName, setCompanyName] = useState("");
  // Pulled from the Close lead alongside the name/mobile (Marcus, 25 Aug).
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [prospectLinkedin, setProspectLinkedin] = useState("");
  const [closeLink, setCloseLink] = useState("");
  const [closeStatus, setCloseStatus] = useState<"idle" | "looking" | "found" | "failed">("idle");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");
  // Follow-up pages: extra people to invite to the calendar event.
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState("");
  const [locationChoice, setLocationChoice] = useState<"video" | "phone">("video");
  // Callback backup times (16 Oct, the owner): other slots the prospect could do.
  const [backups, setBackups] = useState<string[]>([]);
  const [emailOverride, setEmailOverride] = useState(false);
  const [emailOverrideReason, setEmailOverrideReason] = useState("");
  // Fulfilment (client-event) qualification — Marcus's conditional tree.
  const [fqHiring, setFqHiring] = useState<"" | "yes" | "no">("");
  const [fqRoles, setFqRoles] = useState<Array<{ title: string; salary: string; currency: string }>>([]);
  const [fqRoleDraft, setFqRoleDraft] = useState({ title: "", salary: "", currency: "GBP" });
  const [fqJobSpec, setFqJobSpec] = useState<"" | "yes" | "no">("");
  const [fqOpenCvs, setFqOpenCvs] = useState<"" | "yes" | "no">("");
  const [fqCvTitles, setFqCvTitles] = useState("");
  const [fqCvLevel, setFqCvLevel] = useState("");
  const [fqDm, setFqDm] = useState<"" | "yes" | "no">("");
  const [fqDmStatus, setFqDmStatus] = useState<"" | "joining" | "briefed_by_prospect" | "email_pending">("");
  const [fqDmEmail, setFqDmEmail] = useState("");
  const [fqOverride, setFqOverride] = useState(false);
  const [fqOverrideReason, setFqOverrideReason] = useState("");
  // Acquisition (staff outbound) qualification — Marcus's tree, 25 Aug.
  const [aqRevenue, setAqRevenue] = useState("");
  const [aqPriceQualified, setAqPriceQualified] = useState<"" | "yes" | "no">("");
  const [aqPriceReason, setAqPriceReason] = useState("");
  // 22 Sep 2026 (Marcus): industry led vs candidate led, and three questions
  // that gather context without ever blocking a booking.
  const [aqLed, setAqLed] = useState("");
  const [aqVacanciesLastMonth, setAqVacanciesLastMonth] = useState("");
  const [aqBottleneck, setAqBottleneck] = useState("");
  const [aqJobTitles, setAqJobTitles] = useState("");
  const [aqOnlyDm, setAqOnlyDm] = useState<"" | "yes" | "no">("");
  const [aqDmName, setAqDmName] = useState("");
  const [aqDmStatus, setAqDmStatus] =
    useState<"" | "joining" | "attending_instead" | "briefed_by_prospect" | "email_pending">("");
  const [aqDmEmail, setAqDmEmail] = useState("");
  // 17 Sep (Marcus): capacity for 5–10 more vacancies per month — a hard gate.
  const [aqCapacity, setAqCapacity] = useState<"" | "yes" | "no">("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [staffSession, setStaffSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  // Inside the marketing site there is no such thing as a staff view — even a
  // signed-in team member browsing meridiansales.example gets the prospect page.
  const isStaff = staffSession && !embed && !publicView;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setStaffSession(!!data.session?.user))
      .finally(() => setSessionChecked(true));
  }, []);

  // Embed: the app shell paints a dark full-height body; inside an iframe the
  // page must sit flush and white/transparent so the host page shows through.
  useEffect(() => {
    if (!embed) return;
    const style = document.createElement("style");
    style.id = "vexon-embed-reset";
    style.textContent =
      "html,body{background:transparent!important;min-height:0!important}" +
      "body::before{display:none!important}";
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, [embed]);

  const { data: event, isLoading: eventLoading, error: eventError } = useQuery({
    queryKey: ["public-booking-event", slug, inviteToken, publicView],
    queryFn: async () => {
      if (demo) return DEMO_EVENT;
      const { data, error } = await supabase.functions.invoke("booking-public", {
        body: { action: "event", slug, invite: inviteToken || undefined },
        headers: publicHeaders,
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        // Carry the server's wording through so the unavailable screen can say
        // WHY (turned off vs needs a personal link vs expired token).
        const e = new Error(data.error) as Error & { reason?: string };
        e.reason = data.error;
        throw e;
      }
      return data as EventPayload;
    },
    enabled: !!slug,
    retry: 1,
  });

  // Locked timezone wins over auto-detection the moment the event loads.
  useEffect(() => {
    if (event?.lock_timezone) setTz(event.lock_timezone);
  }, [event?.lock_timezone]);

  const [hostUserId, setHostUserId] = useState<string | null>(null);
  // 16 Oct (the owner): on a client page the phone choice is a Callback — 15
  // minutes, today or the next two working days, always UK time.
  const isCallback = !!event?.callback && !!event?.offer_phone_choice && locationChoice === "phone";
  const { data: avail, isLoading: availLoading, error: availError, refetch: refetchAvail, isFetching: availFetching } = useQuery({
    queryKey: ["public-booking-availability", slug, hostUserId, event?.round_robin, inviteToken, event?.booking_horizon_days, isCallback],
    queryFn: async () => {
      if (demo) return { slots: demoSlots(), host_user_id: "demo-host" };
      const { data, error } = await supabase.functions.invoke("booking-public", {
        body: {
          action: "availability", slug, host_user_id: hostUserId, days: event?.booking_horizon_days ?? 31, invite: inviteToken || undefined,
          location_choice: isCallback ? "phone" : undefined,
        },
        headers: publicHeaders,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { slots: Slot[]; host_user_id: string | null };
    },
    enabled: !!slug && !!event && event.accepting_bookings !== false,
    staleTime: 30_000,
    retry: 1,
  });
  // A callback is always shown and booked in UK time; switching back to video
  // returns to the event's own timezone.
  useEffect(() => {
    if (isCallback) setTz(CALLBACK_TZ);
    else setTz(event?.lock_timezone || detectTz());
  }, [isCallback]); // eslint-disable-line react-hooks/exhaustive-deps
  // Changing between video and callback starts the time choice over.
  useEffect(() => {
    setSlot(null); setDayKey(null); setBackups([]);
  }, [isCallback]);
  // Only three days to choose from: open the first one with times straight away.
  useEffect(() => {
    if (!isCallback || dayKey || !avail?.slots?.length) return;
    const first = new Date(avail.slots[0].starts_at).toLocaleDateString("en-CA", { timeZone: CALLBACK_TZ });
    setDayKey(first);
    // On the 30th the first callback day can be next month: show that month.
    const [y, m] = first.split("-").map(Number);
    setMonthCursor(new Date(y, m - 1, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallback, avail]);
  const accepting = event?.accepting_bookings !== false;
  // Client events speak as the client (8 Oct): their name and logo, not Meridian.
  const brand: Brand | null = event?.is_client_event && event.client ? event.client : null;
  const brandName = brand?.name;
  const eventName = event?.name;
  useEffect(() => {
    if (!brandName || !eventName) return;
    const prev = document.title;
    document.title = `${eventName} · ${brandName}`;
    return () => { document.title = prev; };
  }, [brandName, eventName]);
  // Copy icon (staff, client events): the public link, tagged with the setter.
  const [copied, setCopied] = useState(false);
  const publicLink = slug
    ? `${window.location.origin}/bookings/${slug}?view=public${event?.my_ref ? `&ref=${event.my_ref}` : ""}`
    : "";

  // Dev-only screenshot helper: `?demo=1&pick=day` opens the first day's
  // times; `&pick=1` goes on to the details step.
  const demoPick = demo ? searchParams.get("pick") : null;
  useEffect(() => {
    if (!demoPick || !avail?.slots?.length || slot || dayKey) return;
    const first = avail.slots[0];
    setDayKey(new Date(first.starts_at).toLocaleDateString("en-CA", { timeZone: tz }));
    if (demoPick === "1") setSlot(first.starts_at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPick, avail]);

  // 17 Sep: the website decides where a booked prospect goes next (its own
  // confirmation pages, by qualification), so the embed announces completion.
  useEffect(() => {
    if (!done || !embed) return;
    try {
      window.parent.postMessage({ type: "vexon-booking-complete", starts_at: slot, email: prospect.email }, "*");
    } catch { /* no parent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, embed]);

  useEffect(() => {
    if (done && redirectUrl) {
      const t = setTimeout(() => {
        // Embedded: the confirmation page replaces the MARKETING page, not the
        // little iframe. A sandboxed frame may refuse; fall back to ourselves.
        if (embed) {
          try { window.top!.location.href = redirectUrl; return; } catch { /* fall through */ }
        }
        window.location.href = redirectUrl;
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [done, redirectUrl, embed]);

  // Embed: tell the host page how tall we are so it can size the iframe.
  // Contract: window.parent.postMessage({ type: "vexon-booking-height", height }, "*")
  // — sent on load, on every resize/step change, and after booking.
  useEffect(() => {
    if (!embed) return;
    let last = -1;
    const post = () => {
      const el = rootRef.current;
      const height = Math.ceil(el ? el.getBoundingClientRect().height : document.documentElement.scrollHeight);
      if (height === last || height === 0) return;
      last = height;
      try { window.parent.postMessage({ type: "vexon-booking-height", height }, "*"); } catch { /* no parent */ }
    };
    post();
    const el = rootRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(post) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", post);
    // Late fonts/images and the first availability paint settle within a second.
    const t = setTimeout(post, 600);
    return () => { ro?.disconnect(); window.removeEventListener("resize", post); clearTimeout(t); };
    // Re-attach whenever a different screen (loading/error/done/booking) mounts.
  }, [embed, eventLoading, !!eventError, done, accepting, slot, dayKey, sessionChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (iso: string) => {
    const d = new Date(iso);
    return {
      day: d.toLocaleDateString("en-CA", { timeZone: tz }),
      time: d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }),
      hour: Number(d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).slice(0, 2)),
      dayLong: d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }),
    };
  };

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of avail?.slots || []) {
      const k = local(s.starts_at).day;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [avail, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => {
    const first = new Date(monthCursor);
    const startOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(1 - startOffset);
    const cells: Array<{ key: string; dom: number; inMonth: boolean }> = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({
        key: d.toLocaleDateString("en-CA"),
        dom: d.getDate(),
        inMonth: d.getMonth() === monthCursor.getMonth(),
      });
    }
    return cells;
  }, [monthCursor]);

  const monthLabel = monthCursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const windowEnd = new Date(); windowEnd.setDate(windowEnd.getDate() + (event?.booking_horizon_days ?? 31));
  const maxMonth = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), 1);

  const activeDay = dayKey && byDay.has(dayKey) ? dayKey : null;
  const daySlots = activeDay ? byDay.get(activeDay)! : [];
  const morning = daySlots.filter((s) => local(s.starts_at).hour < 12);
  const afternoon = daySlots.filter((s) => local(s.starts_at).hour >= 12);
  const tzLabel = tzDisplay(tz);

  // Personal-email guard: outbound setter flow only (staff session on a
  // staff-mode event). Booking is blocked until the setter fixes the email or
  // explicitly pushes through with a reason. The server enforces this too.
  const emailDomain = prospect.email.trim().toLowerCase().split("@")[1] || "";
  // The prompt fires for outbound setter bookings, and for any event that asks
  // for it explicitly (an AE's own link, where the prospect books themselves).
  const warnPersonalEmail =
    (!!event?.staff_mode && isStaff) || !!(event as any)?.warn_personal_email;
  const personalEmail = warnPersonalEmail && PERSONAL_EMAIL_DOMAINS.has(emailDomain);
  // A setter must justify pushing one through — the AE reads that reason. A
  // prospect booking their own call just confirms the address is right.
  const selfServePersonalEmail = personalEmail && !isStaff;
  const personalEmailBlocked =
    personalEmail &&
    (!emailOverride || (!selfServePersonalEmail && !emailOverrideReason.trim()));

  // Where the meeting happens. Some client events let the prospect choose
  // video or phone per booking; the video platform is the client's own
  // (Google can only mint Meet links, so Teams/Zoom clients supply a room URL).
  const offerPhoneChoice = !!event?.offer_phone_choice;
  const isPhoneBooking =
    event?.location_type === "phone" || (offerPhoneChoice && locationChoice === "phone");
  // 11 Sep (the owner): the prospect is not told which video product the client
  // uses — "Video call" is enough; the link arrives with the invitation.
  const locationLabel = isCallback
    ? "Callback, we'll call you"
    : isPhoneBooking
    ? "Phone call — we'll call you"
    : "Video call — link sent on confirm";
  const durationMinutes = isCallback && event?.callback ? event.callback.minutes : event?.duration_minutes;

  // Fulfilment qualification completeness (Marcus's tree; server re-validates).
  const isClientEvent = !!event?.is_client_event;
  // Who answers the hiring questions: a signed-in setter always (Marcus's
  // tree, setter-voiced); a prospect on the public link only while the
  // event's Dev Centre switch is on, in the prospect's own voice (8 Oct).
  const askFulfilQuals = isClientEvent && (isStaff || event?.public_quals !== false);
  const prospectVoice = isClientEvent && !isStaff;
  // Follow-up pages (Marcus, 2 Sep): company/website/LinkedIn are irrelevant
  // — the relationship exists — so those boxes go; "add guests" appears
  // instead so colleagues can be pulled onto the invite.
  const isFollowUpEvent = event?.event_purpose === "follow_up";
  const fqDisqualified = isClientEvent && fqHiring === "no" && fqOpenCvs === "no";
  const fqDmOk =
    fqDm === "no" ||
    (fqDm === "yes" &&
      (fqDmStatus === "joining"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fqDmEmail.trim())
        : fqDmStatus !== ""));
  const fqComplete = !askFulfilQuals
    ? true
    : (fqHiring === "yes"
        ? fqRoles.length > 0 && fqJobSpec !== ""
        : fqHiring === "no"
        ? (fqOpenCvs === "yes"
            ? !!(fqCvTitles.trim() && fqCvLevel.trim())
            : fqOpenCvs === "no"
            // A prospect is never asked to justify themselves; the server
            // flags the meeting instead.
            ? prospectVoice || (fqOverride && !!fqOverrideReason.trim())
            : false)
        : false) && fqDmOk;

  // Acquisition qualification tree — shown to signed-in staff on the outbound
  // event; anonymous visitors keep the plain question list.
  // The Close lead field only exists on staff-booked events; the public link
  // has no Close lead behind it.
  const closeLookupAvailable = !!event?.staff_mode && isStaff;
  const isAcqStaffEvent = !!event?.staff_mode && isStaff && !isClientEvent;
  const aqUnder300k = aqRevenue === "Under £300,000";
  const aqDisqualified = isAcqStaffEvent && aqCapacity === "no";
  const aqDmOk =
    aqOnlyDm === "yes" ||
    (aqOnlyDm === "no" &&
      !!aqDmName.trim() &&
      aqDmStatus !== "" &&
      (aqDmStatus === "joining" || aqDmStatus === "attending_instead"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aqDmEmail.trim())
        : true));
  const aqComplete = !isAcqStaffEvent
    ? true
    : !!aqRevenue &&
      (!aqUnder300k || (aqPriceQualified !== "" && !!aqPriceReason.trim())) &&
      aqDmOk &&
      aqCapacity === "yes" &&
      !!aqLed;

  const detailsValid =
    prospect.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospect.email.trim()) &&
    !personalEmailBlocked &&
    // A phone booking is useless without a number to call.
    (!isPhoneBooking || !!prospect.mobile.trim()) &&
    fqComplete &&
    aqComplete &&
    (isClientEvent || isAcqStaffEvent ||
      (event?.questions || []).every((q) => !q.required || (answers[q.id] || "").trim()));
  const canConfirm = !!slot && detailsValid;

  // 17 Sep: the website's Typeform hands over with the answers it already
  // collected (?name=&email=&phone=&company=), so the prospect only confirms
  // a time. Visible in the URL by design — the invite flow below stays the
  // server-side path for anything held privately.
  useEffect(() => {
    const g = (k: string, n: number) => (searchParams.get(k) || "").trim().slice(0, n);
    const qn = g("name", 120), qe = g("email", 200), qp = g("phone", 40), qc = g("company", 200);
    if (!qn && !qe && !qp && !qc) return;
    setProspect((p) => ({ name: p.name || qn, email: p.email || qe, mobile: p.mobile || qp }));
    setCompanyName((c) => c || qc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Invite links arrive with the prospect's details already known, so they
  // only pick a time. Fields stay editable in case anything has changed.
  const invitePrefill = (event as any)?.invite || null;
  useEffect(() => {
    if (!invitePrefill) return;
    setProspect((p) => ({
      name: p.name || invitePrefill.prospect_name || "",
      email: p.email || invitePrefill.prospect_email || "",
      mobile: p.mobile || invitePrefill.prospect_mobile || "",
    }));
    setCompanyName((c) => c || invitePrefill.company_name || "");
    // Only seeds once per invite payload; the prospect can edit freely after.
  }, [invitePrefill?.prospect_email, invitePrefill?.prospect_name]);

  const lookupCloseLead = async () => {
    const link = closeLink.trim();
    if (!link || !isStaff) return;
    setCloseStatus("looking");
    setCloseError(null);
    const { data, error } = await supabase.functions.invoke("booking-public", {
      body: { action: "close_lead", close_lead_link: link },
    });
    if (error || data?.error) {
      setCloseError(data?.error || error?.message || null);
      setCloseStatus("failed");
      return;
    }
    // Email is never auto-filled — Close addresses are unreliable and the
    // invite depends on it, so the setter enters it by hand.
    setProspect((p) => ({
      name: data.contact_name || p.name,
      email: p.email,
      mobile: data.mobile || p.mobile,
    }));
    setCompanyName(data.company_name || "");
    setCompanyWebsite(data.company_website || "");
    setProspectLinkedin(data.linkedin_url || "");
    setCloseStatus("found");
  };

  const guestDraftValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestDraft.trim());
  const addGuest = () => {
    const g = guestDraft.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g)) return;
    setGuestEmails((prev) => (prev.includes(g) || prev.length >= 10 ? prev : [...prev, g]));
    setGuestDraft("");
  };

  const book = async () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true); setSubmitError(null);
    const { data, error } = await supabase.functions.invoke("booking-public", {
      headers: publicHeaders,
      body: {
        action: "book", slug, invite: inviteToken || undefined,
        host_user_id: avail?.host_user_id || hostUserId,
        starts_at: slot,
        prospect_name: prospect.name.trim(),
        prospect_email: prospect.email.trim(),
        prospect_mobile: prospect.mobile.trim(),
        company_name: companyName.trim(),
        company_website: companyWebsite.trim(),
        prospect_linkedin: prospectLinkedin.trim(),
        close_lead_link: closeLink.trim(),
        personal_email_reason: personalEmail && emailOverride
          ? (selfServePersonalEmail
              ? "Confirmed by the person booking"
              : emailOverrideReason.trim())
          : "",
        ref: !isStaff && setterRef ? setterRef : undefined,
        fulfilment_quals: askFulfilQuals
          ? {
              hiring: fqHiring === "yes",
              roles: fqRoles.map((r) => ({
                title: r.title,
                salary: r.salary === "" ? null : Number(r.salary),
                currency: r.currency,
              })),
              job_spec: fqJobSpec === "" ? null : fqJobSpec === "yes",
              open_to_cvs: fqHiring === "no" ? fqOpenCvs === "yes" : null,
              cv_titles: fqCvTitles.trim(),
              cv_level: fqCvLevel.trim(),
              dm_present: fqDm === "yes",
              dm_status: fqDm === "yes" ? fqDmStatus : null,
              dm_email: fqDmEmail.trim(),
              disqualify_reason: !prospectVoice && fqDisqualified && fqOverride ? fqOverrideReason.trim() : "",
            }
          : undefined,
        location_choice: offerPhoneChoice ? locationChoice : undefined,
        callback_backup_times: isCallback ? backups.filter(Boolean) : undefined,
        acquisition_quals: isAcqStaffEvent
          ? {
              revenue_band: aqRevenue,
              price_qualified: aqUnder300k ? aqPriceQualified === "yes" : null,
              price_qualified_reason: aqUnder300k ? aqPriceReason.trim() : "",

              only_dm: aqOnlyDm === "yes",
              dm_name: aqOnlyDm === "no" ? aqDmName.trim() : "",
              dm_status: aqOnlyDm === "no" ? aqDmStatus : null,
              dm_email: aqOnlyDm === "no" ? aqDmEmail.trim() : "",
              capacity_5_10: aqCapacity === "yes",
              agency_led: aqLed,
              vacancies_last_month: aqVacanciesLastMonth.trim(),
              bd_bottleneck: aqBottleneck.trim(),
              target_job_titles: aqJobTitles.trim(),
            }
          : undefined,
        // A typed-but-not-Added guest still counts — losing them silently
        // because the Add button wasn't pressed would be cruel.
        guest_emails: guestDraftValid
          ? [...new Set([...guestEmails, guestDraft.trim().toLowerCase()])]
          : guestEmails,
        answers, prospect_timezone: tz, website: honeypot,
      },
    });
    setSubmitting(false);
    // supabase-js turns any non-2xx into a FunctionsHttpError whose message is
    // the useless "Edge Function returned a non-2xx status code" — the real
    // reason ("Please answer: X", "That time is no longer available", …) is in
    // the response body. Read it, or a setter is left staring at a generic
    // failure with nothing to act on (live incident, 25-26 Aug).
    let failMsg: string | null = data?.error || null;
    if (error) {
      let serverMsg: string | null = null;
      try {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          serverMsg = (await ctx.clone().json())?.error ?? null;
        }
      } catch {
        // Body already read or not JSON — fall back to the generic message.
      }
      failMsg = serverMsg || failMsg || error.message;
    }
    if (failMsg) { setSubmitError(failMsg); return; }
    setRedirectUrl(data?.redirect_url || null);
    setMeetingLogged(!!data?.meeting_logged);
    setDone(true);
  };

  if (eventLoading || !sessionChecked) {
    return (
      <Shell accepting={null} embed={embed} innerRef={rootRef}>
        <div className="bg-white rounded-[10px] p-12 text-center" style={{ border: `1px solid ${C.line}`, color: C.soft }}>
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" style={{ color: C.purple }} /> Loading…
        </div>
      </Shell>
    );
  }
  if (eventError || !event) {
    return (
      <Shell accepting={null} embed={embed} innerRef={rootRef}>
        <div className="bg-white rounded-[10px] p-12 text-center space-y-2" style={{ border: `1px solid ${C.line}` }}>
          <CalendarX2 className="h-6 w-6 mx-auto" style={{ color: C.pink }} />
          <p className="font-semibold" style={{ color: C.ink }}>This booking link isn't available</p>
          <p className="text-sm" style={{ color: C.soft }}>
            {/* Say WHY where the server told us — "turned off" and "needs a
                personal link" are very different problems to chase. */}
            {(eventError as any)?.reason || "It may have been turned off — please contact the person who sent it to you."}
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell accepting={accepting} embed={embed} innerRef={rootRef} brand={brand}>
        <div className={`bg-white text-center space-y-3 mx-auto ${lite ? "rounded-[10px] p-10 max-w-none min-h-[420px] flex flex-col items-center justify-center" : "rounded-[10px] p-12 max-w-xl"}`}
          style={{ border: `1px solid ${C.line}` }}>
          <CheckCircle2 className="h-11 w-11 mx-auto" style={{ color: "#059669" }} />
          <h1 className="text-2xl font-bold" style={{ color: C.ink }}>{isCallback ? "Callback booked!" : "Booked in!"}</h1>
          {slot && (
            <p className="font-semibold text-lg" style={{ color: C.deep }}>
              {local(slot).dayLong} at {local(slot).time} ({tzLabel})
            </p>
          )}
          <p className="text-sm" style={{ color: C.soft }}>
            The calendar invitation{isPhoneBooking ? "" : " with the video link"} is on its way to {prospect.email}.
            {isCallback && backups.length > 0 && ` Backup ${backups.length === 1 ? "time" : "times"}: ${backups.map(backupLabel).join("; ")} (UK time).`}
          </p>
          {meetingLogged && isStaff && (
            <p className="text-sm font-semibold" style={{ color: "#059669" }}>
              ✓ Logged to the dashboard automatically
            </p>
          )}
          {(redirectUrl || lite) && <p className="text-xs" style={{ color: C.faint }}>Taking you to the next step…</p>}
          {!redirectUrl && !lite && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full px-6 py-2.5 text-sm font-semibold text-white"
              style={{ background: C.grad }}
            >
              {isStaff ? "Book another prospect" : "Book another call"}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (!accepting) {
    return (
      <Shell accepting={false} embed={embed} innerRef={rootRef} brand={brand}>
        <div className="bg-white rounded-[10px] p-12 text-center space-y-3 max-w-xl mx-auto"
          style={{ border: `1px solid ${C.line}` }}>
          <Clock className="h-8 w-8 mx-auto" style={{ color: C.faint }} />
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>{event.name}</h1>
          <p className="font-semibold" style={{ color: C.soft }}>Not currently accepting bookings</p>
          <p className="text-sm" style={{ color: C.soft }}>
            Please check back soon, or reply to the person who sent you this link.
          </p>
        </div>
      </Shell>
    );
  }

  const dayCellStyle = (key: string, inMonth: boolean): React.CSSProperties => {
    if (!inMonth) return { color: "transparent", pointerEvents: "none" };
    if (key === activeDay) return { background: C.gradDiag, color: "#0f0f11", fontWeight: 700 };
    if (byDay.has(key)) return { background: C.lav, color: C.deep, fontWeight: 600, cursor: "pointer" };
    return { color: C.faint };
  };

  // Layout choice. Signed-in staff keep Marcus's four-panel board (Close link,
  // details, calendar and times all visible at once — the setter's workflow).
  // Everyone else — the meridiansales.example iframe and prospects on a direct link —
  // gets the Calendly-style flow: event details on the left, calendar + times
  // on the right, and the form only once a time is picked (the owner, 14 Sep).
  const stepped = embed || !isStaff;
  // 15 Sep (the owner, after Marcus's call): prospects answer the questions FIRST,
  // then pick a time, then confirm — the Typeform order the ads funnel used.
  // Step 1 = details + questions (Continue when valid); step 2 = calendar +
  // times with the confirm button under the times. Staff keep the board.
  const step: "time" | "details" = stepped && !detailsDone ? "details" : "time";
  // The single named host (or the chosen one) is worth showing up front;
  // round-robin events assign a host at booking, so there is nobody to name.
  const hostName = !event.round_robin
    ? (event.hosts || []).find((h) => h.host_user_id === (hostUserId || avail?.host_user_id))?.name
      || (event.hosts?.length === 1 ? event.hosts[0].name : null)
    : null;
  const pad = embed ? "p-5" : "p-6";
  const staffActions = isStaff && isClientEvent ? (
    <>
      <a href="/bookings/fulfilment"
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
        style={{ background: "#ffffffcc", border: `1px solid ${C.line}`, color: C.soft }}>
        <LayoutGrid className="h-3.5 w-3.5" /> All clients
      </a>
      <button
        type="button"
        title="Copy the public booking link to send to the prospect"
        aria-label="Copy public booking link"
        onClick={() => {
          navigator.clipboard.writeText(publicLink).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
        style={{ background: "#ffffffcc", border: `1px solid ${C.line}`, color: copied ? "#059669" : C.deep }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Link copied" : "Copy public link"}
      </button>
    </>
  ) : null;

  const eventPanel = (
        <div className={`${pad} ${stepped ? "md:border-r" : "xl:border-r"} border-b ${stepped ? "md:border-b-0" : "xl:border-b-0"}`} style={{ borderColor: C.line }}>
          <div className="flex items-center gap-2.5 mb-4">
            {brand ? <BrandMark brand={brand} size={40} /> : <img src={logoGradient} alt="" className="h-[18px] w-auto" />}
            <div className="leading-tight">
              {brand && <span className="font-bold block" style={{ color: C.ink }}>{brand.name}</span>}
              {hostName && <span className="text-xs" style={{ color: C.soft }}>with {hostName}</span>}
            </div>
          </div>
          <h1 className="font-head text-[22px] font-medium leading-snug tracking-[-0.02em]" style={{ color: C.ink }}>{event.name}</h1>
          {isStaff && event.is_client_event && event.client && (
            <span className="inline-flex items-center gap-2 mt-3 rounded-full pl-1.5 pr-3.5 py-1.5 text-xs font-bold"
              style={{ background: C.lav, color: C.deep }}>
              {event.client.logo ? (
                <img src={event.client.logo} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
                  style={{ background: C.gradDiag, color: "#fff" }}>
                  {event.client.name.slice(0, 1)}
                </span>
              )}
              Booking for: {event.client.name}
            </span>
          )}
          {isStaff && event.client && (
            <p className="text-[11px] mt-2" style={{ color: C.faint }}>
              Bookmark this page to come straight back to {event.client.name} while you are on their roster.
            </p>
          )}
          {event.description && (
            <p className="text-[13px] mt-3 leading-relaxed whitespace-pre-line" style={{ color: C.soft }}>
              {event.description}
            </p>
          )}
          <div className="space-y-2.5 mt-5 text-sm" style={{ color: C.soft }}>
            <p className="flex items-center gap-2.5"><Clock className="h-4 w-4" style={{ color: C.purple }} /> {durationMinutes} minutes</p>
            <p className="flex items-center gap-2.5"><Video className="h-4 w-4" style={{ color: C.purple }} />
              {locationLabel}
            </p>
            <p className="flex items-center gap-2.5"><Globe2 className="h-4 w-4" style={{ color: C.purple }} /> {tzLabel}</p>
          </div>
          {!event.round_robin && (event.hosts?.length || 0) > 1 && (
            <div className="mt-5">
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>Who would you like to meet?</label>
              <select
                className={inputCls} style={inputStyle}
                value={hostUserId || avail?.host_user_id || event.hosts[0].host_user_id}
                onChange={(e) => { setHostUserId(e.target.value); setSlot(null); setDayKey(null); }}
              >
                {event.hosts.map((h) => <option key={h.host_user_id} value={h.host_user_id}>{h.name}</option>)}
              </select>
            </div>
          )}
          {!stepped && (
            <div className="flex items-center gap-4 mt-7 pt-4 text-[11px] flex-wrap" style={{ borderTop: `1px solid ${C.line}`, color: C.soft }}>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ background: C.lav }} /> Available</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ background: C.gradDiag }} /> Selected</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ background: "#f1f0f7" }} /> Unavailable</span>
            </div>
          )}
        </div>
  );

  // Wide items span both columns when the form is laid out in two (stepped).
  const wide = stepped ? "sm:col-span-2" : "";
  const detailsPanel = (
        <div
          className={stepped
            ? "grid grid-cols-1 sm:grid-cols-2 gap-3.5"
            : `${pad} xl:border-r border-b xl:border-b-0 space-y-3.5`}
          style={stepped ? undefined : { borderColor: C.line }}
        >
          <h2 className={`font-bold ${wide}`} style={{ color: C.ink }}>Your details</h2>
          {event.staff_mode && isStaff && (
            <div className={wide}>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                <Link2 className="h-3 w-3 inline mr-1" />Close lead link
              </label>
              <input
                className={inputCls} style={inputStyle}
                placeholder="https://app.close.com/lead/…"
                value={closeLink}
                onChange={(e) => { setCloseLink(e.target.value); setCloseStatus("idle"); }}
                onBlur={lookupCloseLead}
              />
              <p className="text-[11px] mt-1" style={{ color: closeStatus === "failed" ? "#be123c" : C.faint }}>
                {closeStatus === "looking" ? "Looking up the lead…"
                  : closeStatus === "found" ? `✓ ${companyName || "Lead"}${companyWebsite ? " · website" : ""}${prospectLinkedin ? " · LinkedIn" : ""} — filled in (type the email yourself)`
                  : closeStatus === "failed" ? `${closeError || "Couldn't find that lead"} — fill in manually`
                  : "Paste the Close link to auto-fill the prospect."}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1" style={labelStyle}>Name *</label>
            <input className={inputCls} style={inputStyle} value={prospect.name}
              onChange={(e) => setProspect({ ...prospect, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={labelStyle}>Email *</label>
            <input className={inputCls} style={inputStyle} type="email" value={prospect.email}
              onChange={(e) => {
                setProspect({ ...prospect, email: e.target.value });
                if (emailOverride) { setEmailOverride(false); setEmailOverrideReason(""); }
              }} />
            {personalEmail && (
              <div className="mt-2 rounded-xl px-3 py-2.5 space-y-2"
                style={{ background: "#fef3c7", border: "1px solid #fcd34d" }}>
                <p className="text-[12px] font-semibold" style={{ color: "#92400e" }}>
                  {selfServePersonalEmail
                    ? "⚠ This looks like a personal email address — we'd normally send the invite to your work email."
                    : "⚠ This looks like a personal email address — double-check it's the prospect's work email."}
                </p>
                <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "#92400e" }}>
                  <input
                    type="checkbox" checked={emailOverride}
                    onChange={(e) => setEmailOverride(e.target.checked)}
                    style={{ accentColor: "#b45309" }}
                  />
                  {selfServePersonalEmail
                    ? "That's the right address — use it anyway"
                    : "It's correct — book it anyway"}
                </label>
                {emailOverride && !selfServePersonalEmail && (
                  <textarea
                    className={inputCls} style={inputStyle} rows={2}
                    placeholder="Why is this meeting being pushed through? (required — the AE will see this)"
                    value={emailOverrideReason}
                    onChange={(e) => setEmailOverrideReason(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>
          {offerPhoneChoice && (
            <div className={wide}>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>How would you like to meet? *</label>
              <div className="grid grid-cols-2 gap-2">
                {([["video", "Video call"], ["phone", event.callback ? "Callback" : "Phone call"]] as const).map(([v, label]) => (
                  <button
                    key={v} type="button"
                    onClick={() => setLocationChoice(v)}
                    className="rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors"
                    style={locationChoice === v
                      ? { borderColor: C.purple, background: C.lav, color: C.deep }
                      : { borderColor: C.line, background: "#fff", color: C.soft }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isCallback && (
                <p className="text-[11px] mt-1" style={{ color: C.faint }}>
                  {prospectVoice
                    ? "A 15-minute call to your mobile, today or in the next two working days (UK time)."
                    : "A 15-minute call from the client to the prospect's mobile, today or in the next two working days (UK time). No video link."}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1" style={labelStyle}>
              Mobile{" "}
              <span style={{ color: isPhoneBooking ? C.deep : C.faint }}>
                {isPhoneBooking ? "(required — we'll call this number)" : "(for text reminders)"}
              </span>
            </label>
            <input className={inputCls} style={inputStyle} placeholder="+44…" value={prospect.mobile}
              onChange={(e) => setProspect({ ...prospect, mobile: e.target.value })} />
          </div>
          {/* Company / website / LinkedIn.
              On a staff-booked event these are filled by the Close lookup, so
              they are labelled as coming from it. On the PUBLIC link there is
              no Close lead — the prospect is typing their own details — so the
              labels stay plain (the owner, 25 Aug). Editable either way.
              HIDDEN on follow-up pages (Marcus, 2 Sep) — the company is
              already known; guests below replace them. */}
          {!isFollowUpEvent && <>
            <div>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                Company{closeLookupAvailable && (
                  <span style={{ color: C.faint }}> (from the Close lead)</span>
                )}
              </label>
              <input className={inputCls} style={inputStyle} placeholder="Company name"
                value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                Company website{closeLookupAvailable && (
                  <span style={{ color: C.faint }}> (from the Close lead)</span>
                )}
              </label>
              <input className={inputCls} style={inputStyle} placeholder="https://…"
                value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                LinkedIn{closeLookupAvailable && (
                  <span style={{ color: C.faint }}> (from the Close lead)</span>
                )}
              </label>
              <input className={inputCls} style={inputStyle} placeholder="https://linkedin.com/in/…"
                value={prospectLinkedin} onChange={(e) => setProspectLinkedin(e.target.value)} />
            </div>
          </>}
          {/* ── Guests (follow-up pages) — each address lands on the invite ── */}
          {isFollowUpEvent && (
            <div className={wide}>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                Add guests <span style={{ color: C.faint }}>(optional — they get the calendar invite)</span>
              </label>
              {guestEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {guestEmails.map((g) => (
                    <span
                      key={g}
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                      style={{ background: "rgba(107,122,144,.10)", color: C.soft }}
                    >
                      {g}
                      <button
                        type="button"
                        aria-label={`Remove ${g}`}
                        onClick={() => setGuestEmails((prev) => prev.filter((x) => x !== g))}
                        className="font-semibold leading-none"
                        style={{ color: C.faint }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  style={inputStyle}
                  type="email"
                  placeholder="guest@company.com"
                  value={guestDraft}
                  onChange={(e) => setGuestDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addGuest();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addGuest}
                  disabled={!guestDraftValid || guestEmails.length >= 10}
                  className="shrink-0 rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
                  style={{ background: "rgba(107,122,144,.12)", color: C.soft }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
          {/* honeypot — hidden from real people */}
          <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1} autoComplete="off" aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", height: 0, width: 0 }} />
          {/* ── Fulfilment qualification (client events) — Marcus's tree ── */}
          {askFulfilQuals && (
            <div className={`space-y-3.5 pt-1 ${wide}`}>
              <div>
                <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                  {prospectVoice ? "Are you currently hiring, or looking to start hiring in the next 3 months? *" : "Are they currently hiring, or looking to start in the next 3 months? *"}
                </label>
                <select className={inputCls} style={inputStyle} value={fqHiring}
                  onChange={(e) => setFqHiring(e.target.value as typeof fqHiring)}>
                  <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </div>

              {fqHiring === "yes" && (
                <>
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "#f7f7f8", border: `1px solid ${C.line}` }}>
                    <label className="block text-xs font-semibold" style={labelStyle}>
                      {prospectVoice ? "Which roles are you hiring for? *" : "Which roles are they hiring for? *"} <span style={{ color: C.faint }}>({fqRoles.length} added)</span>
                    </label>
                    {fqRoles.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5"
                        style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink }}>
                        <span className="font-semibold flex-1 truncate">{r.title}</span>
                        {r.salary && <span style={{ color: C.soft }}>{r.currency} {Number(r.salary).toLocaleString()}</span>}
                        <button type="button" style={{ color: "#be123c" }}
                          onClick={() => setFqRoles(fqRoles.filter((_, x) => x !== i))}>✕</button>
                      </div>
                    ))}
                    {/* 11 Sep (Marcus): stacked, not squashed into one row. */}
                    <div className="space-y-1.5">
                      <input className={`${inputCls} w-full`} style={inputStyle} placeholder="Job title"
                        value={fqRoleDraft.title}
                        onChange={(e) => setFqRoleDraft({ ...fqRoleDraft, title: e.target.value })} />
                      <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <input className={inputCls} style={inputStyle} placeholder="Salary" type="number" inputMode="numeric"
                          value={fqRoleDraft.salary}
                          onChange={(e) => setFqRoleDraft({ ...fqRoleDraft, salary: e.target.value })} />
                        <select className={`${inputCls} px-2`} style={inputStyle} value={fqRoleDraft.currency}
                          onChange={(e) => setFqRoleDraft({ ...fqRoleDraft, currency: e.target.value })}>
                          <option>GBP</option><option>USD</option><option>EUR</option><option>ZAR</option>
                        </select>
                      </div>
                      <button type="button"
                        className="w-full rounded-xl py-2 text-xs font-bold text-white disabled:opacity-40"
                        style={{ background: C.grad }}
                        disabled={!fqRoleDraft.title.trim()}
                        onClick={() => {
                          setFqRoles([...fqRoles, { ...fqRoleDraft, title: fqRoleDraft.title.trim() }]);
                          setFqRoleDraft({ title: "", salary: "", currency: fqRoleDraft.currency });
                        }}>
                        {fqRoles.length > 0 ? "Add another role" : "Add this role"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                      {prospectVoice ? "Do you have a job spec you can send across? *" : "Do they have a job spec they can send across? *"}
                    </label>
                    <select className={inputCls} style={inputStyle} value={fqJobSpec}
                      onChange={(e) => setFqJobSpec(e.target.value as typeof fqJobSpec)}>
                      <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </div>
                </>
              )}

              {fqHiring === "no" && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                    {prospectVoice ? "Would you be open to receiving strong candidate CVs over the next 3 months? *" : "Would they be open to receiving strong candidate CVs over the next 3 months? *"}
                  </label>
                  <select className={inputCls} style={inputStyle} value={fqOpenCvs}
                    onChange={(e) => { setFqOpenCvs(e.target.value as typeof fqOpenCvs); setFqOverride(false); setFqOverrideReason(""); }}>
                    <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
                  </select>
                </div>
              )}

              {fqHiring === "no" && fqOpenCvs === "yes" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                      {prospectVoice ? "What kind of candidates or job titles would you want to see? *" : "What kind of candidates / job titles would they want to see? *"}
                    </label>
                    <input className={inputCls} style={inputStyle} value={fqCvTitles}
                      onChange={(e) => setFqCvTitles(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                      What level are those candidates? *
                    </label>
                    <input className={inputCls} style={inputStyle} placeholder="e.g. junior, mid, senior, head-of"
                      value={fqCvLevel} onChange={(e) => setFqCvLevel(e.target.value)} />
                  </div>
                </>
              )}

              {fqDisqualified && !prospectVoice && (
                <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: "#ffe4e6", border: "1px solid #fda4af" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "#9f1239" }}>
                    ⚠ Not qualified — not hiring and not open to CVs. Don't book unless there's a real reason.
                  </p>
                  <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "#9f1239" }}>
                    <input type="checkbox" checked={fqOverride}
                      onChange={(e) => setFqOverride(e.target.checked)}
                      style={{ accentColor: "#be123c" }} />
                    Book it anyway — there's a good reason
                  </label>
                  {fqOverride && (
                    <textarea className={inputCls} style={inputStyle} rows={2}
                      placeholder="Why is this meeting being pushed through? (required — the client and Daniel will see this)"
                      value={fqOverrideReason} onChange={(e) => setFqOverrideReason(e.target.value)} />
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                  {prospectVoice ? "Is anyone else involved in hiring decisions? *" : "Are there any other decision makers on hiring? *"}
                </label>
                <select className={inputCls} style={inputStyle} value={fqDm}
                  onChange={(e) => { setFqDm(e.target.value as typeof fqDm); setFqDmStatus(""); setFqDmEmail(""); }}>
                  <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </div>
              {fqDm === "yes" && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: "#f7f7f8", border: `1px solid ${C.line}` }}>
                  {(prospectVoice
                    ? ([
                        ["joining", "They'll join the call"],
                        ["briefed_by_prospect", "They can't attend, I'll brief them"],
                      ] as const)
                    : ([
                        ["joining", "They'll join the meeting — I have their email"],
                        ["briefed_by_prospect", "They can't attend — the prospect will brief them"],
                        ["email_pending", "No email yet — to be collected"],
                      ] as const)
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: C.ink }}>
                      <input type="radio" name="fq_dm_status" checked={fqDmStatus === value}
                        onChange={() => setFqDmStatus(value)} style={{ accentColor: C.purple }} />
                      {label}
                    </label>
                  ))}
                  {fqDmStatus === "joining" && (
                    <input className={inputCls} style={inputStyle} type="email"
                      placeholder={prospectVoice ? "Their email, so they get the invite too" : "Decision maker's email — they'll be added to the invite"}
                      value={fqDmEmail} onChange={(e) => setFqDmEmail(e.target.value)} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Acquisition qualification (Marcus, 25 Aug). Replaces the plain
              question list for signed-in setters: the follow-ups are branching
              and setter-voiced, so prospects booking themselves never see them. */}
          {isAcqStaffEvent && (
            <div className={`space-y-3 rounded-xl px-3 py-3 ${wide}`}
              style={{ background: "#f7f7f8", border: `1px solid ${C.line}` }}>
              <div>
                <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                  Roughly what was your revenue in the last 12 months? *
                </label>
                <select className={inputCls} style={inputStyle} value={aqRevenue}
                  onChange={(e) => {
                    setAqRevenue(e.target.value);
                    if (e.target.value !== "Under £300,000") {
                      setAqPriceQualified(""); setAqPriceReason("");
                    }
                  }}>
                  <option value="">Select…</option>
                  {["Under £300,000", "£300,000-£1 million", "£1 million-£5 million",
                    "£5 million-£10 million", "£10 million+"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                {aqUnder300k && (
                  <div className="mt-2 rounded-xl px-3 py-2.5 space-y-2"
                    style={{ background: "#fef3c7", border: "1px solid #fcd34d" }}>
                    <p className="text-[12px] font-semibold" style={{ color: "#92400e" }}>
                      ⚠ Under £300k — are they price qualified? *
                    </p>
                    <div className="flex gap-4">
                      {(["yes", "no"] as const).map((v) => (
                        <label key={v} className="flex items-center gap-2 text-[12px] cursor-pointer"
                          style={{ color: "#92400e" }}>
                          <input type="radio" name="aq_price" checked={aqPriceQualified === v}
                            onChange={() => setAqPriceQualified(v)} style={{ accentColor: "#b45309" }} />
                          {v === "yes" ? "Yes" : "No"}
                        </label>
                      ))}
                    </div>
                    <textarea className={inputCls} style={inputStyle} rows={2}
                      placeholder="Roughly what do they make, and can they afford it? (required — the AE will see this)"
                      value={aqPriceReason} onChange={(e) => setAqPriceReason(e.target.value)} />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                  Are you the only decision maker? *
                </label>
                <select className={inputCls} style={inputStyle} value={aqOnlyDm}
                  onChange={(e) => {
                    setAqOnlyDm(e.target.value as "" | "yes" | "no");
                    if (e.target.value !== "no") {
                      setAqDmName(""); setAqDmStatus(""); setAqDmEmail("");
                    }
                  }}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                {aqOnlyDm === "no" && (
                  <div className="mt-2 rounded-xl px-3 py-2.5 space-y-2"
                    style={{ background: "#fef3c7", border: "1px solid #fcd34d" }}>
                    <p className="text-[12px] font-semibold" style={{ color: "#92400e" }}>
                      ⚠ Who else is a decision maker? *
                    </p>
                    <input className={inputCls} style={inputStyle}
                      placeholder="Their name"
                      value={aqDmName} onChange={(e) => setAqDmName(e.target.value)} />
                    {([
                      ["joining", "They'll join the discovery call — I have their email"],
                      ["attending_instead", "They'll attend instead of this person"],
                      ["briefed_by_prospect", "They'll be briefed by the prospect"],
                      ["email_pending", "No email yet — to be collected"],
                    ] as const).map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2 text-[12px] cursor-pointer"
                        style={{ color: "#92400e" }}>
                        <input type="radio" name="aq_dm_status" checked={aqDmStatus === value}
                          onChange={() => setAqDmStatus(value)} style={{ accentColor: "#b45309" }} />
                        {label}
                      </label>
                    ))}
                    {(aqDmStatus === "joining" || aqDmStatus === "attending_instead") && (
                      <input className={inputCls} style={inputStyle} type="email"
                        placeholder="Their email — they'll be added to the invite"
                        value={aqDmEmail} onChange={(e) => setAqDmEmail(e.target.value)} />
                    )}
                  </div>
                )}
              </div>

              {/* 17 Sep (Marcus): the last question is a hard gate — no push-through. */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                  Do you have capacity to take on an additional 5 to 10 workable vacancies per month at the moment? *
                </label>
                <select className={inputCls} style={inputStyle} value={aqCapacity}
                  onChange={(e) => setAqCapacity(e.target.value as "" | "yes" | "no")}>
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                {aqDisqualified && (
                  <div className="mt-2 rounded-xl px-3 py-2.5"
                    style={{ background: "#fee2e2", border: "1px solid #fca5a5" }}>
                    <p className="text-[12px] font-semibold" style={{ color: "#991b1b" }}>
                      This prospect is disqualified based on the criteria.
                    </p>
                    <p className="text-[12px] mt-1" style={{ color: "#991b1b" }}>
                      No capacity for an extra 5–10 vacancies per month means we can't deliver for them yet. Don't book the call.
                    </p>
                  </div>
                )}
              </div>

              {/* 22 Sep (Marcus): the distinction he wants on every record. */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                  Do you place all types of roles within one industry, or one type of role across lots of industries? *
                </label>
                <select className={inputCls} style={inputStyle} value={aqLed}
                  onChange={(e) => setAqLed(e.target.value)}>
                  <option value="">Select…</option>
                  {["All types of roles within one industry",
                    "One type of role across lots of industries",
                    "Both"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Information gathering (Marcus, 22 Sep): none of this stops a
                  booking — it is what the AE reads before the call. */}
              <div className="rounded-xl px-3 py-3 space-y-3"
                style={{ background: "#fff", border: `1px dashed ${C.line}` }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: C.soft }}>
                  Good to know — none of these disqualify
                </p>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                    How many vacancies from new clients did you get last month?
                  </label>
                  <input className={inputCls} style={inputStyle} value={aqVacanciesLastMonth}
                    onChange={(e) => setAqVacanciesLastMonth(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                    What, in your opinion, is your biggest bottleneck with business development currently?
                  </label>
                  <textarea className={inputCls} style={inputStyle} rows={2} value={aqBottleneck}
                    onChange={(e) => setAqBottleneck(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                    What type of job titles would you like to get vacancies for?
                  </label>
                  <input className={inputCls} style={inputStyle} value={aqJobTitles}
                    onChange={(e) => setAqJobTitles(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {!isClientEvent && !isAcqStaffEvent && (event.questions || []).map((q) => (
            <div key={q.id} className={wide}>
              <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                {q.label}{q.required ? " *" : ""}
              </label>
              {q.type === "long_text" ? (
                <textarea className={inputCls} style={inputStyle} rows={3} value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              ) : q.type === "yes_no" ? (
                <select className={inputCls} style={inputStyle} value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="">Select…</option><option value="Yes">Yes</option><option value="No">No</option>
                </select>
              ) : q.type === "dropdown" ? (
                <select className={inputCls} style={inputStyle} value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="">Select…</option>
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className={inputCls} style={inputStyle} value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
  );

  const calendarPanel = (
        <div
          className={stepped ? "" : `${pad} xl:border-r border-b xl:border-b-0`}
          style={stepped ? undefined : { borderColor: C.line }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold" style={{ color: C.ink }}>{monthLabel}</h2>
            <div className="flex gap-1.5">
              <button
                type="button" aria-label="Previous month"
                disabled={monthCursor <= thisMonth}
                onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ border: `1px solid ${C.line}`, color: C.ink }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button" aria-label="Next month"
                disabled={monthCursor >= maxMonth}
                onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"
                style={{ border: `1px solid ${C.line}`, color: C.ink }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wider mb-1" style={{ color: C.faint }}>
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <span key={d}>{d}</span>)}
          </div>
          {availLoading ? (
            <div className="flex items-center gap-2 justify-center py-16 text-sm" style={{ color: C.soft }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Checking live availability…
            </div>
          ) : availError ? (
            /* 21 Sep (Tom): a failed slot request used to render as a blank
               grid — indistinguishable from "fully booked". Say what the server
               said (calendar check failed, no host, turned off) and offer a retry. */
            <div className="flex flex-col items-center gap-2 justify-center py-12 text-center" style={{ color: C.soft }}>
              <CalendarX2 className="h-5 w-5" style={{ color: C.pink }} />
              <p className="text-sm font-semibold" style={{ color: C.ink }}>Couldn't load available times</p>
              <p className="text-xs max-w-xs">{(availError as Error).message}</p>
              <button
                type="button"
                onClick={() => refetchAvail()}
                disabled={availFetching}
                className="mt-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: C.line, color: C.ink, background: "#fff" }}
              >
                {availFetching ? "Retrying…" : "Try again"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grid.map((c, i) => (
                <button
                  key={i} type="button"
                  onClick={() => {
                    if (!byDay.has(c.key)) return;
                    setDayKey(c.key); setSlot(null);
                  }}
                  className="aspect-square rounded-[6px] text-sm tabular-nums flex items-center justify-center transition-colors"
                  style={dayCellStyle(c.key, c.inMonth)}
                >
                  {c.dom}
                </button>
              ))}
            </div>
          )}
          <div className={stepped ? "mt-4 pt-3" : "mt-5 pt-4"} style={{ borderTop: `1px solid ${C.line}` }}>
            {event.lock_timezone || isCallback ? (
              <span className="text-xs" style={{ color: C.soft }}>Times shown in {tzLabel}</span>
            ) : (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs" style={{ color: C.soft }}>Times shown in your timezone</span>
                <select
                  className="rounded-[6px] border px-2.5 py-1.5 text-xs bg-white"
                  style={{ borderColor: C.line2, color: C.ink }}
                  value={tz}
                  onChange={(e) => { setTz(e.target.value); setSlot(null); }}
                >
                  {[...new Set([detectTz(), ...TIMEZONES])].map((z) => (
                    <option key={z} value={z}>{tzDisplay(z)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
  );

  const timesList = (
        <>
          {!activeDay ? (
            <div className={`flex-1 flex flex-col items-center justify-center text-center gap-2 ${stepped ? "py-8 md:py-16" : "py-16"}`}>
              <Clock className="h-6 w-6" style={{ color: C.faint }} />
              <p className="font-semibold text-sm" style={{ color: C.ink }}>Pick a day</p>
              <p className="text-xs" style={{ color: C.faint }}>Open times appear here.</p>
            </div>
          ) : (
            // No flex-1 here (16 Oct, the owner): the confirm button sits straight
            // under the times instead of at the foot of the column.
            <div className="space-y-4">
              <div>
                <h3 className="font-head text-[17px] font-medium" style={{ color: C.ink }}>
                  {new Date(`${activeDay}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: C.soft }}>
                  {daySlots.length} times available · {durationMinutes} min{isCallback ? " · UK time" : ""}
                </p>
              </div>
              {([["Morning", morning], ["Afternoon", afternoon]] as const).map(([label, slots]) =>
                slots.length === 0 ? null : (
                  <div key={label}>
                    <p className="font-mono text-[10px] font-medium tracking-[0.08em] mb-2" style={{ color: C.faint }}>{label.toUpperCase()}</p>
                    {/* A callback day holds 15-minute steps: a compact grid keeps
                        the confirm button in reach. */}
                    <div className={isCallback ? "grid grid-cols-3 gap-1.5" : "space-y-2"}>
                      {slots.map((s) => {
                        const selected = slot === s.starts_at;
                        return (
                          <button
                            key={s.starts_at} type="button"
                            onClick={() => {
                              setSlot(selected && !stepped ? null : s.starts_at);
                              // The booked time can't also be a backup.
                              setBackups((b) => b.filter((t) => t !== s.starts_at));
                            }}
                            className="w-full rounded-[6px] py-2 text-sm font-semibold tabular-nums transition-colors"
                            style={selected
                              ? { border: "1.5px solid transparent", background: `linear-gradient(#fff,#fff) padding-box, ${C.gradDiag} border-box`, color: C.ink }
                              : { border: `1px solid ${C.line2}`, color: C.ink, background: "#fff" }}
                          >
                            {local(s.starts_at).time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
              {isCallback && slot && (
                <div className="pt-1">
                  <label className="block text-xs font-semibold mb-1" style={labelStyle}>
                    {prospectVoice
                      ? "Can't take the call then? Other times that work (optional)"
                      : "If the prospect can't take the call then, when else could they do? (optional)"}
                  </label>
                  <div className="space-y-1.5">
                    {Array.from({ length: Math.min(backups.filter(Boolean).length + 1, event.callback?.max_backups ?? 2) }, (_, i) => (
                      <select
                        key={i}
                        className={inputCls} style={inputStyle}
                        value={backups[i] || ""}
                        onChange={(e) => {
                          const next = [...backups];
                          next[i] = e.target.value;
                          setBackups(next.filter(Boolean));
                        }}
                      >
                        <option value="">{i === 0 ? "Pick a backup time" : "Pick another backup time"}</option>
                        {(avail?.slots || [])
                          .filter((o) => o.starts_at !== slot && (o.starts_at === backups[i] || !backups.includes(o.starts_at)))
                          .map((o) => <option key={o.starts_at} value={o.starts_at}>{backupLabel(o.starts_at)}</option>)}
                      </select>
                    ))}
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: C.faint }}>
                    {prospectVoice ? "If we can't reach you, we'll try one of these." : "These go on the client's invite and on the booking, so the callback can be moved to one in a click."}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
  );

  const confirmBlock = (
          <div className="pt-4 space-y-2">
            {submitError && <p className="text-sm" style={{ color: "#be123c" }}>{submitError}</p>}
            {!canConfirm && (
              <p className="text-[11px]" style={{ color: personalEmailBlocked && slot ? "#b45309" : C.faint }}>
                {slot
                  ? personalEmailBlocked
                    ? "The email looks personal — correct it, or tick “book it anyway” and give a reason."
                    : "Fill in the details and questions to confirm."
                  : "Pick a time — availability is double-checked when you confirm."}
              </p>
            )}
            <button
              type="button" disabled={!canConfirm || submitting} onClick={book}
              className="w-full rounded-[6px] py-3 font-bold transition-opacity disabled:opacity-40"
              style={{ background: C.grad, color: "#0f0f11" }}
            >
              {submitting ? "Booking…" : slot
                ? `Confirm ${local(slot).time} (${tzShort(tz)})`
                : "Confirm booking"}
            </button>
          </div>
  );

  const card = {
    border: `1px solid ${C.line}`,
    boxShadow: "none",
  } as React.CSSProperties;

  if (!stepped) {
    // Staff board — unchanged: event | details | calendar | times + confirm.
    return (
      <Shell embed={embed} innerRef={rootRef} brand={brand} actions={staffActions}>
        <div
          className="bg-white rounded-[10px] overflow-hidden grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1.15fr_1.25fr_1fr]"
          style={card}
        >
          {eventPanel}
          {detailsPanel}
          {calendarPanel}
          <div className={`${pad} flex flex-col`}>
            {timesList}
            {confirmBlock}
          </div>
        </div>
      </Shell>
    );
  }

  // Prospect / embed flow.
  return (
    <Shell embed={embed} innerRef={rootRef} brand={brand} actions={staffActions}>
      <div
        className={`bg-white overflow-hidden grid grid-cols-1 ${lite ? "" : "md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]"} max-w-5xl mx-auto ${embed ? "rounded-[10px]" : "rounded-[10px]"}`}
        style={card}
      >
        {lite ? (
          // Website hand-off (17 Sep): the marketing page already said what the
          // call is, so one line replaces the event column.
          <div className={`${pad} !py-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b`} style={{ borderColor: C.line }}>
            {brand ? <BrandMark brand={brand} size={36} /> : <img src={bookingsLogo} alt="" className="w-9 h-9 rounded-xl" />}
            <div className="leading-tight min-w-0">
              <span className="font-bold block truncate" style={{ color: C.ink }}>{event.name}</span>
              <span className="text-xs" style={{ color: C.soft }}>
                {hostName ? `with ${hostName} · ` : ""}{durationMinutes} min · {locationLabel} · {tzLabel}
              </span>
            </div>
          </div>
        ) : eventPanel}
        {step === "time" ? (
          <div className={pad}>
            {stepped && lite && (
              <p className="text-sm mb-3" style={{ color: C.soft }}>
                Booking for <b style={{ color: C.ink }}>{prospect.name}</b> · {prospect.email}
                {" · "}
                <button type="button" onClick={() => setDetailsDone(false)} className="font-semibold hover:underline" style={{ color: C.deep }}>Change</button>
              </p>
            )}
            {stepped && !lite && (
              <button
                type="button"
                onClick={() => setDetailsDone(false)}
                className="inline-flex items-center gap-1 text-sm font-semibold mb-3 hover:underline"
                style={{ color: C.deep }}
              >
                <ChevronLeft className="h-4 w-4" /> Edit your details
              </button>
            )}
            <h2 className="font-head text-[19px] font-medium tracking-[-0.01em] mb-4" style={{ color: C.ink }}>Select a date &amp; time</h2>
            {/* Calendar with the day's times beside it whenever the column is
                wide enough (flex-wrap, not a viewport breakpoint — inside an
                iframe the viewport is the iframe, so breakpoints lie). Times
                drop underneath on phones. */}
            <div className="flex flex-wrap gap-6">
              <div className="flex-[1_1_340px] max-w-[440px] min-w-0">{calendarPanel}</div>
              <div
                className={`flex flex-col flex-[1_1_180px] min-w-0 ${embed ? "" : "lg:max-h-[460px] lg:overflow-y-auto lg:pr-1"}`}
                aria-live="polite"
              >
                {timesList}
                {stepped && slot && confirmBlock}
              </div>
            </div>
          </div>
        ) : (
          <div className={pad}>
            <div
              className="flex items-center gap-3 rounded-[8px] px-3.5 py-3 mb-5 text-sm"
              style={{ background: C.surf2, color: C.ink }}
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                <span className="font-bold">A few quick questions first</span>
                <span className="block text-xs" style={{ color: C.soft }}>
                  Then pick a time · {durationMinutes} min · {locationLabel}
                </span>
              </span>
            </div>
            {detailsPanel}
            <div className="pt-4 space-y-2">
              {!detailsValid && (
                <p className="text-[11px]" style={{ color: personalEmailBlocked ? "#b45309" : C.faint }}>
                  {personalEmailBlocked
                    ? "The email looks personal — correct it, or tick “book it anyway” and give a reason."
                    : "Fill in your details and the questions to continue."}
                </p>
              )}
              <button
                type="button"
                disabled={!detailsValid}
                onClick={() => setDetailsDone(true)}
                className="w-full rounded-[6px] py-3 font-bold transition-opacity disabled:opacity-40"
                style={{ background: C.grad, color: "#0f0f11" }}
              >
                Continue to pick a time →
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Staff nudge — the yellow banner used to sit inside the form where a
          prospect read it. It is gone from the meridiansales.example iframe and from
          invite links (both prospect-only); on a plain direct link, where a
          setter may have opened it signed out, a quiet footer line keeps the
          Close auto-fill path discoverable (the owner, 14 Sep). */}
      {event.staff_mode && !isStaff && !embed && !inviteToken && !isClientEvent && (
        <p className="text-center text-[11px] mt-4" style={{ color: C.faint }}>
          Vexon OS team member? <a href="/" className="underline" style={{ color: C.soft }}>Sign in</a> in this
          browser to auto-fill from Close and auto-log the meeting.
        </p>
      )}
    </Shell>
  );
}
