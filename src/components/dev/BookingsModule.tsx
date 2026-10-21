import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  TRIAL_DAY_EVENT_SLUG,
  FINAL_INTERVIEW_EVENT_SLUG,
  FOLLOW_UP_EVENT_SLUG,
  STAFF_DISCOVERY_EVENT_SLUG,
  CALL_REVIEW_EVENT_SLUG,
} from "@/hooks/useBookingEvent";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CalendarClock, Plus, Trash2, ChevronUp, ChevronDown, Pencil, X, Copy,
} from "lucide-react";
import { fetchOffboardedUserIds } from "@/hooks/useOffboardedUsers";
import { ButtonV2, Panel, Pill, Row, RowList, RowNum, TabsRow, type PillVariant } from "@/components/ui-v2";
import { KronosMessageCopyTab } from "./KronosMessageCopyTab";
import { backupLabel, isCallbackBooking } from "../../../supabase/functions/_shared/callback.ts";

/**
 * Kronos (Vexon OS Bookings) admin console, the Calendly replacement.
 *
 * Event types + hosts + weekly availability are the inputs to the slot engine
 * (Batch 2: booking-availability / booking-create edge functions). Bookings are
 * written exclusively by service-role edge functions — this module only reads
 * them. Questions are stored as an ordered jsonb array on the event type and
 * rendered before times are shown (qual-first, per Marcus 2026-08-19).
 *
 * New tables are not in generated types.ts yet, hence the `as any` casts —
 * same convention as SetterMeetings.tsx; regenerate types after the migration
 * is applied.
 */

const QUESTION_TYPES = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Long answer" },
  { value: "yes_no", label: "Yes / No" },
  { value: "dropdown", label: "Dropdown" },
] as const;

const WEEKDAYS = [
  { idx: 1, label: "Monday" },
  { idx: 2, label: "Tuesday" },
  { idx: 3, label: "Wednesday" },
  { idx: 4, label: "Thursday" },
  { idx: 5, label: "Friday" },
  { idx: 6, label: "Saturday" },
  { idx: 0, label: "Sunday" },
];

const TIMEZONES = [
  "Europe/London", "Africa/Johannesburg", "America/New_York",
  "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC",
];

const HOST_ROLES = ["account_executive", "admin", "dev", "ops", "sdr_manager"] as const;

type Question = {
  id: string;
  label: string;
  type: (typeof QUESTION_TYPES)[number]["value"];
  required: boolean;
  options: string[];
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * `scope="internal"` hides client events (client_id set) — those are edited
 * on the client's profile by the CSM. `simple` is the CEO layout (17 Sep):
 * plain-English labels, hints under every field, the advanced fields folded
 * away, and the Deliveries / Connections tabs gone. Same data, same writes.
 */
/**
 * `scope="mine"` (14 Oct 2026): the Ops Command door. Events the signed-in
 * person hosts or has ever booked for; bookings they host or created.
 */
export function BookingsModule({
  scope = "all", simple = false,
}: { scope?: "all" | "internal" | "mine"; simple?: boolean } = {}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"events" | "availability" | "bookings" | "deliveries" | "connections" | "messages">("events");
  const tabs = ([
    { id: "events", label: simple ? "Events" : "Event types" },
    { id: "availability", label: simple ? "When I'm free" : "Availability" },
    { id: "bookings", label: "Bookings" },
    { id: "deliveries", label: "Deliveries" },
    { id: "connections", label: "Connections" },
    // 16 Oct 2026 (the owner): the wording of every prospect text and email.
    { id: "messages", label: "Message copy" },
  ] as const).filter((t) => !simple || (t.id !== "deliveries" && t.id !== "connections" && t.id !== "messages"));

  return (
    <div className="space-y-4">
      <TabsRow tabs={tabs.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={(id) => setTab(id as typeof tab)} />
      {tab === "events" && <EventTypesTab scope={scope} simple={simple} />}
      {/* 14 Oct 2026 (the owner): in the CEO layout When I'm free opens on the
          signed-in person and Bookings says who booked what and when. */}
      {tab === "availability" && <AvailabilityTab simple={simple} currentUserId={user?.id} />}
      {tab === "bookings" && <BookingsTab simple={simple} mineUserId={scope === "mine" ? user?.id : undefined} />}
      {tab === "deliveries" && <DeliveriesTab />}
      {tab === "connections" && <ConnectionsTab />}
      {tab === "messages" && <KronosMessageCopyTab />}
    </div>
  );
}

/* ───────────────────────────── hosts (shared) ───────────────────────────── */

function useHostCandidates() {
  return useQuery({
    queryKey: ["booking-host-candidates"],
    queryFn: async () => {
      const [{ data: roles }, offboarded] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id, role")
          .in("role", HOST_ROLES),
        fetchOffboardedUserIds(),
      ]);
      const ids = [...new Set((roles || []).map((r: any) => r.user_id))].filter(
        (id) => !offboarded.has(id)
      );
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, timezone")
        .in("id", ids);
      return (profiles || []).sort((a: any, b: any) =>
        (a.full_name || "").localeCompare(b.full_name || "")
      );
    },
  });
}

/* ───────────────────────────── event types tab ──────────────────────────── */

function EventTypesTab({ scope = "all", simple = false }: { scope?: "all" | "internal" | "mine"; simple?: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState<any | null>(null);
  const { data: hostCandidates = [] } = useHostCandidates();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["booking-event-types", scope, scope === "mine" ? user?.id : null],
    enabled: scope !== "mine" || !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_event_types")
        .select("*, booking_event_hosts(id, host_user_id, host_calendar_email), client_profiles(company_name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      // Client events live on the client's profile (CSM), never here.
      const internal = (data || []).filter((ev: any) => scope === "all" || !ev.client_id);
      if (scope !== "mine" || !user?.id) return internal;
      // Mine: events I host, plus events I have booked for (e.g. Elena
      // booking Final Interviews on Marcus's event).
      const { data: booked } = await supabase
        .from("bookings")
        .select("event_type_id")
        .eq("created_by", user.id);
      const bookedFor = new Set((booked || []).map((b) => b.event_type_id));
      type MineEvent = { id: string; booking_event_hosts?: { host_user_id: string }[] | null };
      return internal.filter((ev: MineEvent) =>
        (ev.booking_event_hosts || []).some((h) => h.host_user_id === user.id) || bookedFor.has(ev.id),
      );
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("booking_event_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      toast.success("Event type deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (ev: any) => {
      const { error } = await (supabase as any)
        .from("booking_event_types")
        .update({ is_active: !ev.is_active })
        .eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["booking-event-types"] }),
    onError: (e: any) => toast.error(e.message),
  });

  // Softer than the off switch: the page stays up, the pill flips to
  // "Not currently accepting bookings", and the engine refuses new bookings.
  const toggleAccepting = useMutation({
    mutationFn: async (ev: any) => {
      const { error } = await (supabase as any)
        .from("booking_event_types")
        .update({ accepting_bookings: ev.accepting_bookings === false })
        .eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: (_: any, ev: any) => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      toast.success(ev.accepting_bookings === false ? "Accepting bookings again" : "Bookings paused");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Client events (8 Oct): whether a prospect on the public link answers the
  // prospect-worded hiring questions. Setters signed in always get the full tree.
  type PublicQualsEvent = { id: string; public_quals_enabled?: boolean | null };
  const togglePublicQuals = useMutation({
    // Uncast: public_quals_enabled reaches types.ts on the next the hosted builder sync.
    mutationFn: async (ev: PublicQualsEvent) => {
      const { error } = await supabase
        .from("booking_event_types")
        .update({ public_quals_enabled: ev.public_quals_enabled === false } as never)
        .eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: (_: unknown, ev: PublicQualsEvent) => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      toast.success(ev.public_quals_enabled === false
        ? "Prospects now answer the hiring questions"
        : "Prospects now book with contact details only");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyLink = (url: string) =>
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied"));
  type HostCandidate = { id: string; full_name: string | null };
  const hostNames = (ev: { booking_event_hosts?: { host_user_id: string }[] | null }) => {
    const candidates = hostCandidates as HostCandidate[];
    const names = (ev.booking_event_hosts || [])
      .map((h) => candidates.find((p) => p.id === h.host_user_id)?.full_name)
      .filter(Boolean);
    return names.length ? names.join(", ") : "nobody yet";
  };

  if (editing !== null) {
    return (
      <EventTypeEditor
        event={editing === "new" ? null : editing}
        hostCandidates={hostCandidates}
        currentUserId={user?.id}
        simple={simple}
        onClose={() => setEditing(null)}
      />
    );
  }

  type SimpleEvent = {
    id: string; name: string; slug: string; side: string; is_active: boolean; accepting_bookings?: boolean | null;
    duration_minutes: number; booking_horizon_days?: number | null; questions?: unknown[] | null; staff_mode?: boolean | null;
    booking_event_hosts?: { host_user_id: string }[] | null;
  };
  if (simple) {
    return (
      <Panel
        title="Your Kronos events"
        meta="What each one asks, how long it runs, who hosts it"
        aside={<ButtonV2 variant="primary" size="sm" onClick={() => setEditing("new")}>New event</ButtonV2>}
      >
        {isLoading && <p className="py-[18px] text-[12px] text-[var(--dim)]">Loading…</p>}
        {!isLoading && events.length === 0 && (
          <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No events yet. Create the first one.</p>
        )}
        {events.length > 0 && (
          <RowList columns="1fr auto">
            {(events as SimpleEvent[]).map((ev) => (
              <Row key={ev.id} className="items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-[6px]">
                    <span className="row-primary text-[13px] font-semibold">{ev.name}</span>
                    <Pill variant={ev.is_active ? "ok" : "default"}>{ev.is_active ? "active" : "off"}</Pill>
                    {ev.is_active && ev.accepting_bookings === false && <Pill variant="warn">paused</Pill>}
                    <Pill variant="info">{ev.side}</Pill>
                  </div>
                  <p className="mt-[2px] text-[11.5px] text-[var(--dim)]">
                    {ev.duration_minutes} min · hosted by {hostNames(ev)}
                    {ev.booking_horizon_days ? ` · people can book up to ${ev.booking_horizon_days} days ahead` : " · people can book up to 31 days ahead"}
                    {(ev.questions || []).length ? ` · asks ${(ev.questions || []).length} question${(ev.questions || []).length === 1 ? "" : "s"} first` : ""}
                    {ev.staff_mode ? " · setters book this for prospects" : " · anyone with the link can book"}
                  </p>
                  <p className="mt-[4px] flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--dim)] break-all">{window.location.origin}/bookings/{ev.slug}</span>
                    <button type="button" className="text-[11.5px] text-[var(--accent)] hover:underline" onClick={() => copyLink(`${window.location.origin}/bookings/${ev.slug}`)}>Copy link</button>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-[5px]">
                  {ev.is_active && (
                    <ButtonV2 size="sm" onClick={() => toggleAccepting.mutate(ev)}>
                      {ev.accepting_bookings === false ? "Resume bookings" : "Pause bookings"}
                    </ButtonV2>
                  )}
                  <ButtonV2 size="sm" onClick={() => toggleActive.mutate(ev)}>{ev.is_active ? "Turn off" : "Turn on"}</ButtonV2>
                  <ButtonV2 size="sm" onClick={() => setEditing(ev)}>Edit</ButtonV2>
                  <ButtonV2
                    size="sm"
                    className="text-[var(--bad)]"
                    onClick={() => {
                      if (confirm(`Delete "${ev.name}"? Existing bookings keep their data.`))
                        remove.mutate(ev.id);
                    }}
                  >
                    Delete
                  </ButtonV2>
                </div>
              </Row>
            ))}
          </RowList>
        )}
      </Panel>
    );
  }

  return (
    <div className="dc-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="dc-label">Event types</p>
        <button className="dc-btn dc-btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5 inline mr-1" />
          New event type
        </button>
      </div>
      {isLoading && <p className="dc-mono text-xs text-[var(--dc-text-dim)]">Loading…</p>}
      {!isLoading && events.length === 0 && (
        <p className="dc-mono text-xs text-[var(--dc-text-dim)]">None yet. Create the first one (the cold-call discovery duplicate).</p>
      )}
      <div className="space-y-2">
        {events.map((ev: any) => (
          <div key={ev.id} className="dc-surface-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-[var(--dc-text)]">{ev.name}</span>
                  <span className={ev.is_active ? "dc-pill-ok" : "dc-pill-dim"}>
                    {ev.is_active ? "active" : "off"}
                  </span>
                  {ev.is_active && ev.accepting_bookings === false && (
                    <span className="dc-pill-warn">paused — not accepting</span>
                  )}
                  <span className="dc-pill-info">{ev.side}</span>
                  {ev.client_id && (
                    <span className="dc-pill-info">client: {ev.client_profiles?.company_name || "unknown"}</span>
                  )}
                </div>
                {simple ? (
                  <>
                    <p className="text-[12px] text-[var(--dc-text-dim)] mt-1">
                      {ev.duration_minutes} min · hosted by {hostNames(ev)}
                      {ev.booking_horizon_days ? ` · people can book up to ${ev.booking_horizon_days} days ahead` : " · people can book up to 31 days ahead"}
                      {(ev.questions || []).length ? ` · asks ${(ev.questions || []).length} question${(ev.questions || []).length === 1 ? "" : "s"} first` : ""}
                      {ev.staff_mode ? " · setters book this for prospects" : " · anyone with the link can book"}
                    </p>
                    <p className="flex items-center gap-2 flex-wrap mt-1.5">
                      <span className="dc-mono text-[11px] text-[var(--dc-text-dim)] break-all">{window.location.origin}/bookings/{ev.slug}</span>
                      <button className="dc-btn" onClick={() => copyLink(`${window.location.origin}/bookings/${ev.slug}`)}>
                        <Copy className="h-3 w-3 inline mr-1" />Copy link
                      </button>
                    </p>
                  </>
                ) : (
                <p className="dc-mono text-[11px] text-[var(--dc-text-dim)] mt-1 break-all">
                  /bookings/{ev.slug} · {ev.duration_minutes} min ·{" "}
                  {(ev.questions || []).length} questions ·{" "}
                  {(ev.booking_event_hosts || []).length} host(s)
                  {ev.booking_horizon_days ? ` · books up to ${ev.booking_horizon_days} days ahead` : ""}
                  {ev.round_robin ? " · round robin" : ""}
                  {ev.staff_mode ? " · staff mode" : " · public"}
                  {ev.lock_timezone ? ` · locked to ${ev.lock_timezone}` : ""}
                  {ev.host_calendar_slots ? ` · slots = host calendar entries titled "${ev.host_calendar_slots}"` : ""}
                  {ev.redirect_url ? " · redirects after booking" : ""}
                </p>
                )}
                {ev.client_id && (
                  <div className="mt-2 space-y-1 text-[11px] text-[var(--dc-text-dim)]">
                    <p>
                      <span className="text-[var(--dc-text)]">Staff:</span> setters open it from the
                      fulfilment hub signed in (Close auto-fill, Marcus's full questions, auto-logged).
                    </p>
                    <p className="flex items-center gap-2 flex-wrap">
                      <span className="text-[var(--dc-text)]">Public:</span>
                      <span className="dc-mono break-all">{window.location.origin}/bookings/{ev.slug}?view=public</span>
                      <button className="dc-btn" onClick={() => copyLink(`${window.location.origin}/bookings/${ev.slug}?view=public`)}>
                        <Copy className="h-3 w-3" />
                      </button>
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ev.public_quals_enabled !== false}
                        disabled={togglePublicQuals.isPending}
                        onChange={() => togglePublicQuals.mutate(ev)}
                      />
                      Prospects on the public link answer the hiring questions (prospect-worded)
                    </label>
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {ev.is_active && (
                  <button className="dc-btn" onClick={() => toggleAccepting.mutate(ev)}>
                    {ev.accepting_bookings === false ? "Resume bookings" : "Pause bookings"}
                  </button>
                )}
                <button className="dc-btn" onClick={() => toggleActive.mutate(ev)}>
                  {ev.is_active ? "Turn off" : "Turn on"}
                </button>
                <button className="dc-btn" onClick={() => setEditing(ev)}>
                  <Pencil className="h-3.5 w-3.5" />{simple ? <span className="ml-1">Edit</span> : null}
                </button>
                <button
                  className="dc-btn dc-btn-danger"
                  onClick={() => {
                    if (confirm(`Delete "${ev.name}"? Existing bookings keep their data.`))
                      remove.mutate(ev.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventTypeEditor({
  event, hostCandidates, currentUserId, onClose, simple = false,
}: {
  event: any | null;
  hostCandidates: any[];
  currentUserId?: string;
  onClose: () => void;
  simple?: boolean;
}) {
  const qc = useQueryClient();
  // Simple layout (CEO): advanced fields fold away unless already set.
  const [showAdvanced, setShowAdvanced] = useState<boolean>(
    !simple || !!(event?.lock_timezone || event?.default_source || event?.redirect_url || event?.host_calendar_slots)
  );
  const Hint = ({ children }: { children: React.ReactNode }) =>
    simple ? <p className="text-[11px] text-[var(--dc-text-dim)] mb-1.5">{children}</p> : null;
  // These events are wired into in-app pickers by slug (AE follow-up modal,
  // TA LCT/final-interview pickers). Renaming the slug silently breaks those
  // flows — they fall back to manual date/time entry — so the field is locked.
  // 17 Sep: the staff discovery + call-review events resolve by slug too, and the
  // editor now has a second door (CEO · Event Bookings), so they are locked as well.
  const APP_WIRED_SLUGS = [
    TRIAL_DAY_EVENT_SLUG, FINAL_INTERVIEW_EVENT_SLUG, FOLLOW_UP_EVENT_SLUG,
    STAFF_DISCOVERY_EVENT_SLUG, CALL_REVIEW_EVENT_SLUG,
  ];
  const slugLocked = !!event && APP_WIRED_SLUGS.includes(event.slug);
  const [name, setName] = useState(event?.name || "");
  const [slug, setSlug] = useState(event?.slug || "");
  const [slugTouched, setSlugTouched] = useState(!!event);
  const [description, setDescription] = useState(event?.description || "");
  const [duration, setDuration] = useState<number>(event?.duration_minutes || 30);
  // 17 Sep (Marcus): how far ahead people may book. Blank = 31 days.
  const [horizonDays, setHorizonDays] = useState<string>(
    event?.booking_horizon_days ? String(event.booking_horizon_days) : ""
  );
  const [side, setSide] = useState(event?.side || "acquisition");
  const [redirectUrl, setRedirectUrl] = useState(event?.redirect_url || "");
  const [kitSequenceId, setKitSequenceId] = useState<string>(event?.kit_sequence_id || "");
  const [webhookUrl, setWebhookUrl] = useState<string>(event?.webhook_url || "");
  const [roundRobin, setRoundRobin] = useState<boolean>(event?.round_robin ?? false);
  const [staffMode, setStaffMode] = useState<boolean>(event?.staff_mode ?? false);
  const [lockTimezone, setLockTimezone] = useState<string>(event?.lock_timezone || "");
  // 23 Sep: slots taken from the host's own calendar entries (Elena's Trial Days).
  const [hostCalendarSlots, setHostCalendarSlots] = useState<string>(event?.host_calendar_slots || "");
  const [slotCapacity, setSlotCapacity] = useState<string>(event?.slot_capacity ? String(event.slot_capacity) : "");
  const [defaultSource, setDefaultSource] = useState<string>(event?.default_source || "");
  const [questions, setQuestions] = useState<Question[]>(event?.questions || []);
  const [hostIds, setHostIds] = useState<string[]>(
    // Staff hosts only: a client event's host row (client_profile_id, no
    // host_user_id) is managed by booking-client-admin, never by this editor.
    (event?.booking_event_hosts || [])
      .map((h: { host_user_id: string | null }) => h.host_user_id)
      .filter((id: string | null): id is string => !!id)
  );

  const setQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const moveQuestion = (i: number, dir: -1 | 1) =>
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const finalSlug = slugLocked ? event.slug : slugify(slug || name);
      if (!finalSlug) throw new Error("Slug is required");
      if (questions.some((q) => !q.label.trim()))
        throw new Error("Every question needs a label");
      const capacity = slotCapacity.trim() === "" ? null : parseInt(slotCapacity, 10);
      if (capacity !== null && (Number.isNaN(capacity) || capacity < 1))
        throw new Error("Max per entry must be 1 or more (or blank for no limit)");
      const horizon = horizonDays.trim() === "" ? null : parseInt(horizonDays, 10);
      if (horizon !== null && (Number.isNaN(horizon) || horizon < 1 || horizon > 365))
        throw new Error("How far ahead must be between 1 and 365 days (or blank for 31)");
      const payload = {
        name: name.trim(),
        slug: finalSlug,
        description: description.trim() || null,
        duration_minutes: duration,
        booking_horizon_days: horizon,
        side,
        redirect_url: redirectUrl.trim() || null,
        kit_sequence_id: kitSequenceId.trim() || null,
        webhook_url: webhookUrl.trim() || null,
        round_robin: roundRobin,
        staff_mode: staffMode,
        lock_timezone: lockTimezone || null,
        default_source: defaultSource.trim() || null,
        host_calendar_slots: hostCalendarSlots.trim() || null,
        slot_capacity: capacity,
        questions,
      };
      let eventId = event?.id;
      if (eventId) {
        const { error } = await (supabase as any)
          .from("booking_event_types").update(payload).eq("id", eventId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("booking_event_types")
          .insert({ ...payload, created_by: currentUserId })
          .select().single();
        if (error) throw error;
        eventId = data.id;
      }
      // Reconcile STAFF hosts: replace that set (simple + idempotent at this
      // scale). 7 Oct (Ridgeway Legal): this used to delete every host row,
      // including a connected client's own host row, then fail to re-insert
      // it, leaving the client's booking page with "No host is available".
      // Client host rows (host_user_id NULL) are never touched here.
      const { error: delErr } = await (supabase as any)
        .from("booking_event_hosts").delete()
        .eq("event_type_id", eventId)
        .not("host_user_id", "is", null);
      if (delErr) throw delErr;
      if (hostIds.length > 0) {
        const rows = hostIds.map((uid, i) => {
          const p = hostCandidates.find((c: any) => c.id === uid);
          return {
            event_type_id: eventId,
            host_user_id: uid,
            host_calendar_email: p?.email || "",
            priority: i + 1,
          };
        });
        const { error: insErr } = await (supabase as any)
          .from("booking_event_hosts").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      toast.success(event ? "Event type updated" : "Event type created");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="dc-surface p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="dc-label">{event ? (simple ? `Edit: ${event.name}` : "Edit event type") : (simple ? "New event" : "New event type")}</p>
        <button className="dc-btn" onClick={onClose}>
          <X className="h-3.5 w-3.5 inline mr-1" />
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {simple && (
          <div className="md:col-span-2 dc-surface-2 p-3">
            <p className="text-xs text-[var(--dc-text)] font-medium mb-1">Four things make an event</p>
            <p className="text-[11px] text-[var(--dc-text-dim)]">
              1 · What it's called and how long it runs &nbsp; 2 · Who hosts it (whose calendar gets booked)
              &nbsp; 3 · What to ask before times are shown &nbsp; 4 · How far ahead people can book.
              Your free hours live under "When I'm free".
            </p>
          </div>
        )}
        <div>
          <p className="dc-label mb-1">Name</p>
          <Hint>What people see on the booking page, e.g. "Follow-up call with Marcus".</Hint>
          <input
            className="dc-input w-full"
            value={name}
            placeholder="Discovery Call — Cold Call"
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </div>
        <div>
          <p className="dc-label mb-1">{simple ? "Kronos link" : "Link slug (/bookings/…)"}</p>
          <Hint>Made from the name. The page lives at vexon-os.example/bookings/&lt;this&gt;.</Hint>
          <input
            className="dc-input w-full dc-mono"
            value={slug}
            disabled={slugLocked}
            onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
          />
          {slugLocked && (
            <p className="text-[11px] mt-1 text-amber-500">
              Locked — this link is wired into the app's booking pickers. Renaming it breaks them.
            </p>
          )}
        </div>
        <div>
          <p className="dc-label mb-1">Duration (minutes)</p>
          <Hint>How long the call is. Slots are cut to this length.</Hint>
          <input
            className="dc-input w-full"
            type="number" min={5} max={480} step={5}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 30)}
          />
        </div>
        <div>
          <p className="dc-label mb-1">How far ahead people can book (days)</p>
          <Hint>Blank = 31 days. Put 180 for a follow-up link that stays open six months out.</Hint>
          <input
            className="dc-input w-full"
            type="number" min={1} max={365} step={1}
            placeholder="31"
            value={horizonDays}
            onChange={(e) => setHorizonDays(e.target.value)}
          />
        </div>
        {(!simple || showAdvanced) && (
          <div>
            <p className="dc-label mb-1">Side</p>
            <Hint>Which team's numbers this counts towards.</Hint>
            <select className="dc-select w-full" value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="acquisition">Acquisition</option>
              <option value="fulfilment">Fulfilment</option>
            </select>
          </div>
        )}
        <div className="md:col-span-2">
          <p className="dc-label mb-1">Description (shown on the booking page)</p>
          <Hint>A line or two under the title. Tell them what the call is for.</Hint>
          <textarea
            className="dc-textarea w-full" rows={2}
            value={description} onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {(!simple || showAdvanced) && (
        <div className="md:col-span-2">
          <p className="dc-label mb-1">
            Redirect URL after booking (optional — the meta-ads confirmation page)
          </p>
          <Hint>Leave blank and they see the normal "you're booked" page.</Hint>
          <input
            className="dc-input w-full dc-mono"
            placeholder="https://…"
            value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
          />
        </div>
        )}
        {(!simple || showAdvanced) && (
        <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
          <div>
            <p className="dc-label mb-1">Kit sequence ID (optional)</p>
            <Hint>Every booking adds the prospect to this Kit (ConvertKit) sequence. Replaces the old Zap.</Hint>
            <input className="dc-input w-full dc-mono" placeholder="e.g. 1234567" value={kitSequenceId} onChange={(e) => setKitSequenceId(e.target.value)} />
          </div>
          <div>
            <p className="dc-label mb-1">Webhook URL (optional)</p>
            <Hint>Every confirmed booking is POSTed here as JSON (n8n, Zapier, anything).</Hint>
            <input className="dc-input w-full dc-mono" placeholder="https://…" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
          </div>
        </div>
        )}
        <div>
          <p className="dc-label mb-1">Booking behaviour</p>
          <Hint>Round robin shares one link across several hosts. Staff mode is for links the setters use to book prospects in.</Hint>
          <label className="dc-surface-2 p-2 flex items-center gap-2 cursor-pointer mb-1">
            <input type="checkbox" checked={roundRobin} onChange={(e) => setRoundRobin(e.target.checked)} />
            <span className="text-xs text-[var(--dc-text)]">Round robin</span>
            <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">merge host availability, assign at booking</span>
          </label>
          <label className="dc-surface-2 p-2 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={staffMode} onChange={(e) => setStaffMode(e.target.checked)} />
            <span className="text-xs text-[var(--dc-text)]">Staff mode</span>
            <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">Close-link autofill + auto-log for signed-in setters</span>
          </label>
        </div>
        {(!simple || showAdvanced) ? (
        <div>
          <p className="dc-label mb-1">Lock timezone (empty = viewer's own)</p>
          <select className="dc-select w-full mb-2" value={lockTimezone} onChange={(e) => setLockTimezone(e.target.value)}>
            <option value="">Viewer's own timezone</option>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          <p className="dc-label mb-1">Slots from the host's own calendar (title contains)</p>
          <input className="dc-input w-full mb-1" value={hostCalendarSlots} onChange={(e) => setHostCalendarSlots(e.target.value)} placeholder="e.g. Trial Day — blank = weekly rules" />
          <p className="text-[11px] text-[var(--dc-text-dim)] mb-2">When set, the bookable times are the host's calendar entries with this in the title; a booking adds the invitee as a guest to that entry (host's own Meet link). Weekly rules and free/busy are ignored.</p>
          <p className="dc-label mb-1">Max bookings per entry (blank = no limit)</p>
          <input className="dc-input w-full mb-2" value={slotCapacity} onChange={(e) => setSlotCapacity(e.target.value)} placeholder="e.g. 4" inputMode="numeric" />
          <p className="dc-label mb-1">Default source (auto-logged meetings)</p>
          <input
            className="dc-input w-full dc-mono"
            placeholder="cold_call / ads / linkedin"
            value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)}
          />
        </div>
        ) : (
          <div className="flex items-end">
            <button className="dc-btn" onClick={() => setShowAdvanced(true)}>
              Show advanced (side, redirect, timezone, source)
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="dc-label mb-2">Hosts (whose calendars get booked)</p>
        <Hint>Tick yourself for your own calls. The invite goes on the ticked person's calendar.</Hint>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {hostCandidates.map((p: any) => (
            <label key={p.id} className="dc-surface-2 p-2 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hostIds.includes(p.id)}
                onChange={(e) =>
                  setHostIds((ids) =>
                    e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)
                  )
                }
              />
              <span className="text-xs text-[var(--dc-text)]">{p.full_name}</span>
              <span className="dc-mono text-[10px] text-[var(--dc-text-dim)] truncate">
                {p.email}
              </span>
            </label>
          ))}
          {hostCandidates.length === 0 && (
            <p className="dc-mono text-xs text-[var(--dc-text-dim)]">No eligible hosts found.</p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="dc-label">{simple ? "Questions to ask before times are shown" : "Qualifying questions (asked before times are shown)"}</p>
          <button
            className="dc-btn"
            onClick={() =>
              setQuestions((qs) => [
                ...qs,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  type: "short_text",
                  required: true,
                  options: [],
                },
              ])
            }
          >
            <Plus className="h-3.5 w-3.5 inline mr-1" />
            Add question
          </button>
        </div>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="dc-surface-2 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="dc-mono text-[10px] text-[var(--dc-text-dim)] w-5">{i + 1}.</span>
                <input
                  className="dc-input flex-1"
                  placeholder="Question label"
                  value={q.label}
                  onChange={(e) => setQuestion(i, { label: e.target.value })}
                />
                <select
                  className="dc-select"
                  value={q.type}
                  onChange={(e) => setQuestion(i, { type: e.target.value as Question["type"] })}
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 dc-mono text-[10px] text-[var(--dc-text-dim)]">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => setQuestion(i, { required: e.target.checked })}
                  />
                  req
                </label>
                <button className="dc-btn" onClick={() => moveQuestion(i, -1)} disabled={i === 0}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="dc-btn"
                  onClick={() => moveQuestion(i, 1)}
                  disabled={i === questions.length - 1}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  className="dc-btn dc-btn-danger"
                  onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {q.type === "dropdown" && (
                <input
                  className="dc-input w-full dc-mono text-xs"
                  placeholder="Options, comma-separated (e.g. 1-10, 11-50, 51-200)"
                  value={q.options.join(", ")}
                  onChange={(e) =>
                    setQuestion(i, {
                      options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              )}
            </div>
          ))}
          {questions.length === 0 && (
            <p className="dc-mono text-xs text-[var(--dc-text-dim)]">
              No questions yet — copy them from the Calendly event, in order.
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="dc-btn" onClick={onClose}>Cancel</button>
        <button
          className="dc-btn dc-btn-primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : (simple ? "Save event" : "Save event type")}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── availability tab ─────────────────────────── */

type DayRule = { enabled: boolean; start: string; end: string };

function AvailabilityTab({ simple = false, currentUserId }: { simple?: boolean; currentUserId?: string } = {}) {
  const qc = useQueryClient();
  const { data: hostCandidates = [] } = useHostCandidates();
  // CEO layout: your own hours, no host to pick (Marcus should not see
  // Elena and the owner offered as hosts). The Dev Centre keeps the picker.
  const [hostId, setHostId] = useState<string>(simple && currentUserId ? currentUserId : "");
  // "" = the host's default hours (event_type_id NULL); an event id = the
  // per-event override scope. Override rows replace the defaults outright.
  const [scopeId, setScopeId] = useState<string>("");

  const { data: rules = [] } = useQuery({
    queryKey: ["booking-availability", hostId],
    enabled: !!hostId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_availability_rules")
        .select("*")
        .eq("host_user_id", hostId);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: hostEvents = [] } = useQuery({
    queryKey: ["booking-host-events", hostId],
    enabled: !!hostId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_event_hosts")
        .select("event_type_id, booking_event_types(id, name, is_active)")
        .eq("host_user_id", hostId);
      if (error) throw error;
      return (data || [])
        .map((r: any) => r.booking_event_types)
        .filter(Boolean)
        .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
    },
  });

  const hasOverride = !!scopeId && (rules as any[]).some((x) => x.event_type_id === scopeId);

  const initial = useMemo(() => {
    const defaults = (rules as any[]).filter((x) => !x.event_type_id);
    const overrides = scopeId ? (rules as any[]).filter((x) => x.event_type_id === scopeId) : [];
    // Event scope with no override yet: prefill from the defaults so an admin
    // starts from the host's normal week and just adjusts.
    const source = overrides.length > 0 ? overrides : defaults;
    const byDay: Record<number, DayRule> = {};
    for (const d of WEEKDAYS) {
      const r = source.find((x) => x.weekday === d.idx);
      byDay[d.idx] = r
        ? { enabled: true, start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) }
        : { enabled: d.idx >= 1 && d.idx <= 5, start: "09:00", end: "17:00" };
    }
    const first = source[0];
    return {
      byDay,
      timezone: first?.timezone || "Europe/London",
      buffer: first?.buffer_minutes ?? 15,
      notice: first?.min_notice_minutes ?? 240,
      cap: first?.daily_cap ?? ("" as number | ""),
      loadedFor: hostId + ":" + scopeId + ":" + (rules as any[]).length,
    };
  }, [rules, hostId, scopeId]);

  const [form, setForm] = useState<typeof initial | null>(null);
  const current = form && form.loadedFor === initial.loadedFor ? form : initial;

  const save = useMutation({
    mutationFn: async () => {
      if (!hostId) throw new Error("Pick a host first");
      // Scope the delete: a default-hours save must never wipe per-event
      // overrides, and an override save must only replace its own event's rows.
      let del = (supabase as any)
        .from("booking_availability_rules").delete().eq("host_user_id", hostId);
      del = scopeId ? del.eq("event_type_id", scopeId) : del.is("event_type_id", null);
      const { error: delErr } = await del;
      if (delErr) throw delErr;
      const rows = WEEKDAYS.filter((d) => current.byDay[d.idx].enabled).map((d) => ({
        host_user_id: hostId,
        event_type_id: scopeId || null,
        weekday: d.idx,
        start_time: current.byDay[d.idx].start,
        end_time: current.byDay[d.idx].end,
        timezone: current.timezone,
        buffer_minutes: current.buffer,
        min_notice_minutes: current.notice,
        daily_cap: current.cap === "" ? null : current.cap,
      }));
      if (rows.length > 0) {
        const { error } = await (supabase as any)
          .from("booking_availability_rules").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-availability", hostId] });
      toast.success(scopeId ? "Event hours saved" : "Availability saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeOverride = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("booking_availability_rules")
        .delete().eq("host_user_id", hostId).eq("event_type_id", scopeId);
      if (error) throw error;
    },
    onSuccess: () => {
      setForm(null);
      qc.invalidateQueries({ queryKey: ["booking-availability", hostId] });
      toast.success("Override removed — this event now uses the default hours");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const patchDay = (idx: number, patch: Partial<DayRule>) =>
    setForm({
      ...current,
      byDay: { ...current.byDay, [idx]: { ...current.byDay[idx], ...patch } },
    });

  return (
    <div className="dc-surface p-4 space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        {simple ? (
          <div>
            <p className="dc-label mb-1">Your hours</p>
            <p className="text-sm text-[var(--dc-text)]">
              {(hostCandidates as { id: string; full_name: string | null }[]).find((p) => p.id === hostId)?.full_name || "You"}
            </p>
          </div>
        ) : (
        <div>
          <p className="dc-label mb-1">Host</p>
          <select className="dc-select" value={hostId} onChange={(e) => { setHostId(e.target.value); setForm(null); }}>
            <option value="">Select a host…</option>
            {hostCandidates.map((p: any) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>
        )}
        {hostId && (
          <>
            <div>
              <p className="dc-label mb-1">Hours for</p>
              <select
                className="dc-select"
                value={scopeId}
                onChange={(e) => { setScopeId(e.target.value); setForm(null); }}
              >
                <option value="">Default (all events)</option>
                {hostEvents.map((ev: any) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}{ev.is_active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="dc-label mb-1">Timezone</p>
              <select
                className="dc-select"
                value={current.timezone}
                onChange={(e) => setForm({ ...current, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <p className="dc-label mb-1">Buffer (min)</p>
              <input
                className="dc-input w-20" type="number" min={0} max={120} step={5}
                value={current.buffer}
                onChange={(e) => setForm({ ...current, buffer: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <p className="dc-label mb-1">Min notice (min)</p>
              <input
                className="dc-input w-24" type="number" min={0} step={30}
                value={current.notice}
                onChange={(e) => setForm({ ...current, notice: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <p className="dc-label mb-1">Daily cap</p>
              <input
                className="dc-input w-20" type="number" min={1} placeholder="—"
                value={current.cap}
                onChange={(e) =>
                  setForm({ ...current, cap: e.target.value === "" ? "" : parseInt(e.target.value) })
                }
              />
            </div>
          </>
        )}
      </div>

      {hostId && scopeId && (
        <div className="flex items-center justify-between gap-3 dc-surface-2 p-2">
          <p className="text-xs text-[var(--dc-text-dim)]">
            {hasOverride
              ? "This event has its own hours — they replace the host's default hours."
              : "Using the host's default hours. Saving here creates hours for this event only."}
          </p>
          {hasOverride && (
            <button
              className="dc-btn"
              disabled={removeOverride.isPending}
              onClick={() => removeOverride.mutate()}
            >
              Remove override
            </button>
          )}
        </div>
      )}

      {hostId && (
        <>
          <div className="space-y-1">
            {WEEKDAYS.map((d) => {
              const r = current.byDay[d.idx];
              return (
                <div key={d.idx} className="dc-surface-2 p-2 flex items-center gap-3">
                  <label className="flex items-center gap-2 w-32 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => patchDay(d.idx, { enabled: e.target.checked })}
                    />
                    <span className="text-xs text-[var(--dc-text)]">{d.label}</span>
                  </label>
                  {r.enabled ? (
                    <>
                      <input
                        className="dc-input" type="time" value={r.start}
                        onChange={(e) => patchDay(d.idx, { start: e.target.value })}
                      />
                      <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">to</span>
                      <input
                        className="dc-input" type="time" value={r.end}
                        onChange={(e) => patchDay(d.idx, { end: e.target.value })}
                      />
                    </>
                  ) : (
                    <span className="dc-mono text-[10px] text-[var(--dc-text-dim)]">unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              className="dc-btn dc-btn-primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save availability"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── bookings tab ─────────────────────────────── */

type BookingRow = {
  id: string;
  status: string;
  source?: string | null;
  host_user_id?: string | null;
  created_by?: string | null;
  created_at: string;
  starts_at: string;
  prospect_name?: string | null;
  prospect_email?: string | null;
  prospect_confirmed_at?: string | null;
  client_profile_id?: string | null;
  client_profiles?: { company_name: string } | null;
  booking_event_types?: { name?: string | null; slug?: string | null; side?: string | null } | null;
  location_choice?: string | null;
  callback_backup_times?: string[] | null;
};

const bookingTone = (s: string): PillVariant =>
  s === "confirmed" ? "ok" : s === "held" ? "warn" : s === "cancelled" ? "bad" : "default";

/** 15 Oct 2026 (the owner): one layout for every door. Each row says what kind of
 * booking it is, who hosts it, who booked it (the signed-in person, the
 * public link, or the source) and when. The Dev Centre adds the source pill,
 * the year and the prospect's email. */
function BookingsTab({ simple = false, mineUserId }: { simple?: boolean; mineUserId?: string } = {}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { data: bookings = [], isLoading, refetch } = useQuery<BookingRow[]>({
    queryKey: ["booking-list", mineUserId ?? "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("bookings")
        .select("*, booking_event_types(name, slug, side), client_profiles(company_name)")
        .order("starts_at", { ascending: false })
        .limit(100);
      // Mine: bookings I host or I made.
      if (mineUserId) q = q.or(`host_user_id.eq.${mineUserId},created_by.eq.${mineUserId}`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BookingRow[];
    },
    refetchInterval: 30000,
  });
  const { data: hostCandidates = [] } = useHostCandidates();
  const hostName = (b: BookingRow) =>
    (b.host_user_id && (hostCandidates as { id: string; full_name?: string | null }[]).find((p) => p.id === b.host_user_id)?.full_name)
    || b.client_profiles?.company_name
    || "—";
  // Who booked it: the signed-in setter (created_by) by name, or the public link.
  const bookerIds = [...new Set(bookings.map((b) => b.created_by).filter(Boolean))] as string[];
  const { data: bookerNames = {} } = useQuery({
    queryKey: ["booking-booker-names", bookerIds.join(",")],
    enabled: bookerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", bookerIds);
      return Object.fromEntries((data || []).map((p) => [p.id, p.full_name || "Unknown"])) as Record<string, string>;
    },
  });
  const bookedBy = (b: BookingRow) =>
    (b.created_by && bookerNames[b.created_by]) || (b.source === "public" ? "the public link" : b.source || "unknown");
  const kindOf = (b: BookingRow) =>
    b.client_profiles?.company_name
      ? `Client meeting for ${b.client_profiles.company_name}`
      : (b.booking_event_types?.side === "acquisition" ? "Discovery call" : b.booking_event_types?.name || "Booking");

  const cancelBooking = async (b: BookingRow) => {
    if (!confirm(
      `Cancel the booking for "${b.prospect_name || b.prospect_email || "this prospect"}"? ` +
      `The calendar invite is removed and the prospect is notified by Google. ` +
      `The linked meeting record is not changed.`
    )) return;
    setCancellingId(b.id);
    const { data, error } = await supabase.functions.invoke("booking-cancel", {
      body: { booking_id: b.id },
    });
    setCancellingId(null);
    const failMsg = error?.message || data?.error;
    if (failMsg) toast.error("Cancel failed: " + failMsg);
    else toast.success(data?.calendar_cancelled
      ? "Booking cancelled — calendar invite removed"
      : "Booking cancelled (no calendar event to remove)");
    refetch();
  };

  return (
    <Panel
      title="Bookings"
      meta={simple ? "Who booked what, and when" : "Latest 100 from every source: who booked what, and when"}
      aside={<ButtonV2 size="sm" onClick={() => refetch()}>Refresh</ButtonV2>}
    >
      {isLoading && <p className="py-[18px] text-[12px] text-[var(--dim)]">Loading…</p>}
      {!isLoading && bookings.length === 0 && (
        <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No bookings yet.</p>
      )}
      {bookings.length > 0 && (
        <RowList columns={simple ? "150px 1fr auto" : "180px 1fr auto"}>
          {bookings.map((b) => (
            <Row key={b.id} className="items-start">
              <RowNum className="text-[var(--dim)]">
                {format(new Date(b.starts_at), simple ? "EEE d MMM, HH:mm" : "EEE d MMM yyyy, HH:mm")}
              </RowNum>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[6px]">
                  <span className="row-primary text-[13px] font-semibold">{b.prospect_name || "Unknown prospect"}</span>
                  <Pill variant={bookingTone(b.status)}>{b.status}</Pill>
                  {!simple && b.source && <Pill variant="info">{b.source}</Pill>}
                  {b.prospect_confirmed_at && <Pill variant="ok">prospect confirmed</Pill>}
                  {isCallbackBooking({ client_id: b.client_profile_id }, b.location_choice) && <Pill variant="warn">callback</Pill>}
                </div>
                <p className="mt-[2px] text-[11.5px] text-[var(--dim)]">
                  {kindOf(b)} · host {hostName(b)} · booked by {bookedBy(b)} on {format(new Date(b.created_at), "EEE d MMM, HH:mm")}
                  {b.prospect_email ? ` · ${b.prospect_email}` : ""}
                </p>
                {/* 16 Oct: the other times the prospect could take a callback.
                    The setter moves it from their appointment's Move button. */}
                {(b.callback_backup_times?.length ?? 0) > 0 && (
                  <p className="mt-[2px] text-[11.5px] text-[var(--ink2)]">
                    Backup times (UK): {b.callback_backup_times!.map(backupLabel).join("; ")}
                  </p>
                )}
              </div>
              {["held", "confirmed"].includes(b.status) ? (
                <ButtonV2
                  size="sm"
                  className="shrink-0 text-[var(--bad)]"
                  disabled={cancellingId === b.id}
                  onClick={() => cancelBooking(b)}
                >
                  {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                </ButtonV2>
              ) : <span />}
            </Row>
          ))}
        </RowList>
      )}
    </Panel>
  );
}

/* ───────────────────────────── deliveries tab ───────────────────────────── */
/* Full delivery oversight (the owner, 24 Aug): per booking, did the calendar
 * invite get created, did each email/SMS go out (with the provider error when
 * it didn't), what's still scheduled, and has the prospect confirmed. This is
 * the "why didn't they get it" debugging surface. */

type DeliveryBooking = {
  id: string;
  status: string;
  starts_at: string;
  prospect_name?: string | null;
  prospect_email?: string | null;
  prospect_confirmed_at?: string | null;
  google_event_id?: string | null;
  google_meet_link?: string | null;
  location_choice?: string | null;
  host_user_id?: string | null;
  client_profile_id?: string | null;
  booking_event_types?: {
    name?: string | null;
    location_type?: string | null;
    booking_event_hosts?: { host_user_id: string | null; host_calendar_email: string | null }[] | null;
  } | null;
};
type DeliveryNotif = {
  id: string; booking_id: string; channel: string; template: string; status: string;
  sent_at?: string | null; scheduled_for?: string | null; recipient?: string | null; error?: string | null;
};
type ConnectionLite = { client_profile_id: string | null; status: string; provider: string };

/**
 * What the calendar invite carried, worked out from the booking row and its
 * event type. booking-flow.ts writes `google_meet_link` as the generic join
 * link whatever the provider (Meet minted by Google, Teams minted by a
 * Microsoft-connected client, or the event's standing Teams/Zoom link), and
 * leaves it null for phone events.
 */
function inviteLink(
  b: DeliveryBooking, connections: ConnectionLite[],
): { label: string; tone: PillVariant; dim?: boolean; reason?: string } {
  const isPhone = b.booking_event_types?.location_type === "phone" || b.location_choice === "phone";
  if (!b.google_event_id) {
    if (b.status === "cancelled") return { label: "removed (cancelled)", tone: "default", dim: true };
    let reason = "the calendar step failed";
    if (b.client_profile_id) {
      const conn = connections.find((c) => c.client_profile_id === b.client_profile_id);
      reason = !conn || conn.status !== "connected"
        ? "client has no calendar connection and the Meridian fallback calendar did not take it"
        : `the client's ${conn.provider === "microsoft" ? "Microsoft" : "Google"} connection did not answer`;
    } else {
      const host = (b.booking_event_types?.booking_event_hosts || []).find((h) => h.host_user_id === b.host_user_id);
      if (!host?.host_calendar_email) reason = "host has no calendar connection";
    }
    return { label: "not created, prospect got no invite", tone: "bad", reason };
  }
  const link = (b.google_meet_link || "").toLowerCase();
  if (link.includes("meet.google.com")) return { label: "created · Google Meet", tone: "ok" };
  if (link.includes("teams.microsoft.com") || link.includes("teams.live.com")) return { label: "created · Microsoft Teams", tone: "ok" };
  if (link.includes("zoom.us")) return { label: "created · Zoom", tone: "ok" };
  if (link) return { label: "created · standing link", tone: "ok", reason: b.google_meet_link || undefined };
  if (isPhone) {
    return {
      label: "created · phone, no link", tone: "ok",
      reason: b.location_choice === "phone" ? "booked as a phone call" : "event is phone",
    };
  }
  return { label: "created · no link", tone: "warn", reason: "the calendar entry has no join link" };
}

function DeliveryLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 font-mono text-[10px] text-[var(--dim)]">{label}</span>
      {children}
    </div>
  );
}

function DeliveriesTab() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["booking-deliveries"],
    queryFn: async () => {
      const { data: bookings, error } = await (supabase as any)
        .from("bookings")
        .select("*, booking_event_types(name, location_type, booking_event_hosts(host_user_id, host_calendar_email))")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const list = (bookings || []) as DeliveryBooking[];
      const ids = list.map((b) => b.id);
      let notifs: DeliveryNotif[] = [];
      if (ids.length) {
        const { data: n } = await (supabase as any)
          .from("booking_notifications")
          .select("*")
          .in("booking_id", ids)
          .order("created_at", { ascending: true });
        notifs = (n || []) as DeliveryNotif[];
      }
      // Only to explain a missing invite: the admin tier can read these rows.
      const { data: conns } = await supabase
        .from("calendar_connections")
        .select("client_profile_id, status, provider");
      return { bookings: list, notifs, connections: (conns || []) as ConnectionLite[] };
    },
    refetchInterval: 30000,
  });

  const templateLabel = (t: string) =>
    t === "confirmation" ? "confirmation"
    : t === "rescheduled" ? "moved"
    : t === "reminder_24h" ? "24h reminder"
    : t === "reminder_1h" ? "1h reminder"
    : t;

  // sent ok · scheduled warn · failed bad · pending default · not configured / cancelled dim
  const notifTone = (n: DeliveryNotif): { tone: PillVariant; dim?: boolean; text: string } =>
    n.status === "sent" ? { tone: "ok", text: `sent ${n.sent_at ? format(new Date(n.sent_at), "d MMM HH:mm") : ""}`.trim() }
    : n.status === "pending" && n.scheduled_for ? { tone: "warn", text: `scheduled ${format(new Date(n.scheduled_for), "d MMM HH:mm")}` }
    : n.status === "pending" ? { tone: "default", text: "pending" }
    : n.status === "failed" ? { tone: "bad", text: "failed" }
    : n.status === "not_configured" ? { tone: "default", dim: true, text: "not configured" }
    : { tone: "default", dim: true, text: n.status };

  const bookings = data?.bookings || [];

  return (
    <Panel
      title="Delivery log"
      meta="Last 50 bookings: calendar invite, SMS, email and reminders, with the provider error when something did not go out"
      aside={<ButtonV2 size="sm" onClick={() => refetch()}>Refresh</ButtonV2>}
    >
      {isLoading && <p className="py-[18px] text-[12px] text-[var(--dim)]">Loading…</p>}
      {!isLoading && bookings.length === 0 && (
        <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">No bookings yet.</p>
      )}
      {bookings.length > 0 && (
        <RowList columns="150px 1fr">
          {bookings.map((b) => {
            const rows = (data?.notifs || []).filter((n) => n.booking_id === b.id);
            const invite = inviteLink(b, data?.connections || []);
            return (
              <Row key={b.id} className="items-start">
                <RowNum className="text-[var(--dim)]">{format(new Date(b.starts_at), "EEE d MMM, HH:mm")}</RowNum>
                <div className="min-w-0 space-y-[6px]">
                  <div className="flex flex-wrap items-center gap-[6px]">
                    <span className="row-primary text-[13px] font-semibold">
                      {b.prospect_name || b.prospect_email || "Unknown prospect"}
                    </span>
                    <Pill variant="info">{b.booking_event_types?.name || "—"}</Pill>
                    <Pill variant={bookingTone(b.status)}>{b.status}</Pill>
                  </div>
                  {/* Calendar invite: the calendar event is the prospect's invitation */}
                  <DeliveryLine label="calendar invite">
                    <Pill variant={invite.tone} className={invite.dim ? "text-[var(--dim)]" : undefined}>{invite.label}</Pill>
                    {invite.reason && <span className="font-mono text-[10px] text-[var(--dim)]">{invite.reason}</span>}
                  </DeliveryLine>
                  {/* Channel sends */}
                  {rows.map((n) => {
                    const t = notifTone(n);
                    return (
                      <DeliveryLine key={n.id} label={`${n.channel} · ${templateLabel(n.template)}`}>
                        <Pill variant={t.tone} className={t.dim ? "text-[var(--dim)]" : undefined}>{t.text}</Pill>
                        {n.recipient && <span className="font-mono text-[10px] text-[var(--dim)]">{n.recipient}</span>}
                        {n.error && <span className="font-mono text-[10px] text-[var(--bad)]">{n.error}</span>}
                      </DeliveryLine>
                    );
                  })}
                  {rows.length === 0 && (
                    <p className="font-mono text-[10px] text-[var(--dim)]">
                      No SMS or email rows: booked without a mobile number, or before notifications were configured.
                    </p>
                  )}
                  {/* Prospect response */}
                  <DeliveryLine label="prospect">
                    {b.prospect_confirmed_at ? (
                      <Pill variant="ok">confirmed attendance {format(new Date(b.prospect_confirmed_at), "d MMM HH:mm")}</Pill>
                    ) : (
                      <Pill className="text-[var(--dim)]">no confirmation yet</Pill>
                    )}
                  </DeliveryLine>
                </div>
              </Row>
            );
          })}
        </RowList>
      )}
    </Panel>
  );
}

/* ───────────────────────────── connections tab ──────────────────────────── */

type ConnectionRow = {
  id: string;
  owner_type: string;
  provider: string;
  status: string;
  calendar_email: string;
  client_profile_id: string | null;
  connect_token: string | null;
  last_error: string | null;
  invited_at: string | null;
  connected_at: string | null;
  last_checked_at: string | null;
  client_profiles?: { company_name: string } | null;
};

const connectionTone = (s: string): { tone: PillVariant; dim?: boolean } =>
  s === "connected" ? { tone: "ok" }
  : s === "error" ? { tone: "bad" }
  : s === "invited" || s === "pending" ? { tone: "warn" }
  : { tone: "default", dim: true }; // disconnected

function ConnectionsTab() {
  const qc = useQueryClient();
  const { userRoles } = useAuth();
  // RLS (20260819 booking_platform): admin and dev can update
  // calendar_connections; ops can only read, so Disconnect stays hidden for ops.
  const canManage = userRoles.includes("admin") || userRoles.includes("dev");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ["booking-connections-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("booking-connections-status");
      if (error) throw error;
      return data as { google: boolean; twilio: boolean; resend: boolean };
    },
    retry: false,
  });

  const { data: connections = [] } = useQuery<ConnectionRow[]>({
    queryKey: ["calendar-connections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_connections")
        .select("id, owner_type, provider, status, calendar_email, client_profile_id, connect_token, last_error, invited_at, connected_at, last_checked_at, client_profiles(company_name)")
        .order("created_at", { ascending: true });
      return (data || []) as unknown as ConnectionRow[];
    },
  });
  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["calendar-connections"] });
  };

  // Same call ClientBookingsSection makes from the client's profile.
  const sendConnect = async (c: ConnectionRow) => {
    if (!c.client_profile_id) return;
    setBusyId(c.id);
    const { data, error } = await supabase.functions.invoke("booking-client-admin", {
      body: { action: "send_connect", client_profile_id: c.client_profile_id },
    });
    setBusyId(null);
    const failMsg = error?.message || data?.error;
    if (failMsg) toast.error(failMsg);
    else toast.success(`Connect email sent to ${data?.to || c.calendar_email}`);
    qc.invalidateQueries({ queryKey: ["calendar-connections"] });
  };

  // The link the connect email carries: /connect-calendar#ct=<token>
  // (booking-client-admin send_connect). The token is on the row, so the
  // link is built here; Resend mints a new token and retires this one.
  const copyLink = async (c: ConnectionRow) => {
    const url = `${window.location.origin}/connect-calendar#ct=${c.connect_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Connect link copied");
    } catch {
      toast.error(`Could not copy. Link: ${url}`);
    }
  };

  const disconnect = async (c: ConnectionRow) => {
    if (!confirm(
      `Disconnect ${c.calendar_email}? New bookings stop using this calendar; ` +
      `client bookings fall back to the Meridian calendar until they connect again.`
    )) return;
    setBusyId(c.id);
    const { error } = await supabase
      .from("calendar_connections")
      .update({ status: "disconnected", last_checked_at: new Date().toISOString() })
      .eq("id", c.id);
    setBusyId(null);
    if (error) toast.error(error.message);
    else toast.success("Calendar disconnected");
    qc.invalidateQueries({ queryKey: ["calendar-connections"] });
  };

  const secretRows = [
    { key: "google", label: "Google Calendar (service account)", secret: "GOOGLE_SERVICE_ACCOUNT_JSON" },
    { key: "twilio", label: "Twilio SMS", secret: "TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER" },
    { key: "resend", label: "Resend email", secret: "RESEND_API_KEY" },
  ] as const;

  return (
    <div className="space-y-6">
      <Panel
        title="Provider secrets"
        meta="What the booking functions can reach"
        aside={<ButtonV2 size="sm" onClick={refreshAll}>Refresh</ButtonV2>}
      >
        {isLoading && <p className="py-[18px] text-[12px] text-[var(--dim)]">Checking…</p>}
        {!isLoading && !status && (
          <p className="py-[12px] text-[12px] text-[var(--dim)]">
            The status check did not answer (booking-connections-status). Refresh, or check the function is deployed.
          </p>
        )}
        <RowList columns="1fr auto">
          {secretRows.map((r) => (
            <Row key={r.key}>
              <div className="min-w-0">
                <div className="row-primary text-[13px] font-semibold">{r.label}</div>
                <div className="font-mono text-[10.5px] text-[var(--dim)]">{r.secret}</div>
              </div>
              <Pill variant={status ? (status[r.key] ? "ok" : "warn") : "default"}>
                {status ? (status[r.key] ? "configured" : "missing") : "unknown"}
              </Pill>
            </Row>
          ))}
        </RowList>
      </Panel>

      <Panel title="Calendar connections" meta="Client calendars connected to Kronos">
        {connections.length === 0 && (
          <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">
            No calendar connections yet. A client appears here once their connect email goes out, from the Clients page or onboarding. Staff hosts book through the workspace service account and need no row.
          </p>
        )}
        {connections.length > 0 && (
          <RowList columns="1fr auto">
            {connections.map((c) => {
              const tone = connectionTone(c.status);
              const isClient = c.owner_type === "client" && !!c.client_profile_id;
              const busy = busyId === c.id;
              const canCopy = !!c.connect_token && c.status !== "connected" && c.status !== "disconnected";
              return (
                <Row key={c.id} className="items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-[6px]">
                      <span className="row-primary text-[13px] font-semibold">{c.calendar_email}</span>
                      {c.client_profiles?.company_name && (
                        <span className="text-[12px] text-[var(--dim)]">{c.client_profiles.company_name}</span>
                      )}
                      <Pill variant={tone.tone} className={tone.dim ? "text-[var(--dim)]" : undefined}>{c.status}</Pill>
                    </div>
                    <div className="mt-[2px] font-mono text-[10.5px] text-[var(--dim)]">
                      {c.owner_type} · {c.provider}
                      {c.invited_at ? ` · invited ${format(new Date(c.invited_at), "d MMM")}` : ""}
                      {c.connected_at ? ` · connected ${format(new Date(c.connected_at), "d MMM")}` : ""}
                      {c.last_checked_at ? ` · checked ${format(new Date(c.last_checked_at), "d MMM HH:mm")}` : ""}
                    </div>
                    {c.last_error && (
                      <div className="mt-[2px] font-mono text-[10.5px] text-[var(--bad)]">{c.last_error}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-[6px]">
                    {isClient && c.status !== "connected" && (
                      <ButtonV2 size="sm" disabled={busy} onClick={() => sendConnect(c)}>
                        {busy ? "Sending…" : c.invited_at ? "Resend connect email" : "Send connect email"}
                      </ButtonV2>
                    )}
                    {canCopy && (
                      <ButtonV2 size="sm" variant="ghost" onClick={() => copyLink(c)}>
                        <Copy className="h-3 w-3" /> Copy connect link
                      </ButtonV2>
                    )}
                    {canManage && (c.status === "connected" || c.status === "error") && (
                      <ButtonV2 size="sm" className="text-[var(--bad)]" disabled={busy} onClick={() => disconnect(c)}>
                        Disconnect
                      </ButtonV2>
                    )}
                  </div>
                </Row>
              );
            })}
          </RowList>
        )}
      </Panel>
    </div>
  );
}
