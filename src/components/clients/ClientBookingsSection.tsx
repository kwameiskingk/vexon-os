import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CalendarCheck, CalendarClock, Link2, Loader2, Mail, Plug, Plus, RefreshCw,
  Save, Trash2, XCircle,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientRebookDialog } from "./ClientRebookDialog";

/**
 * Client profile → Config → Bookings (the owner, 24 Aug): the CSM-facing home of
 * a client's Vexon OS Bookings setup. Create the client's event, manage their
 * availability windows, watch what's booked (and whether the prospect
 * confirmed), see the calendar-connection status, and send the branded
 * connect email. All writes go through the booking-client-admin function, so
 * CSMs need no extra table permissions.
 */

type ClientBooking = {
  id: string;
  prospect_name: string | null;
  prospect_email: string | null;
  starts_at: string;
  status: string;
  prospect_confirmed_at: string | null;
  google_event_id: string | null;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Keep in sync with LOCATION_TYPES / TIMEZONES in booking-client-admin.
const PROVIDERS: Array<{ value: string; label: string }> = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "zoom", label: "Zoom" },
  { value: "phone", label: "Phone call" },
  { value: "in_person", label: "In person" },
];
/** Providers we cannot mint a link for — the client supplies their own room URL. */
const NEEDS_ROOM_LINK = ["teams", "zoom"];
const TIMEZONES: Array<{ value: string; label: string }> = [
  { value: "Europe/London", label: "UK (London)" },
  { value: "Europe/Dublin", label: "Ireland (Dublin)" },
  { value: "Europe/Madrid", label: "Spain (Madrid)" },
  { value: "Europe/Amsterdam", label: "Netherlands (Amsterdam)" },
  { value: "Europe/Paris", label: "France (Paris)" },
  { value: "Europe/Berlin", label: "Germany (Berlin)" },
  { value: "Asia/Dubai", label: "UAE (Dubai)" },
  { value: "Africa/Johannesburg", label: "South Africa (Johannesburg)" },
  { value: "America/New_York", label: "US Eastern (New York)" },
  { value: "America/Chicago", label: "US Central (Chicago)" },
  { value: "America/Los_Angeles", label: "US Pacific (Los Angeles)" },
  { value: "UTC", label: "UTC" },
];
const tzLabel = (tz: string) =>
  TIMEZONES.find((t) => t.value === tz)?.label ?? tz;

type Rule = {
  weekday: number; start_time: string; end_time: string;
  buffer_minutes: number; min_notice_minutes: number;
};

export function ClientBookingsSection({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [draftRules, setDraftRules] = useState<Rule[] | null>(null);
  // Meeting-location / timezone drafts — null means "not edited yet".
  const [draftProvider, setDraftProvider] = useState<string | null>(null);
  const [draftRoomLink, setDraftRoomLink] = useState<string | null>(null);
  const [draftPhoneChoice, setDraftPhoneChoice] = useState<boolean | null>(null);
  const [draftCallbackNotice, setDraftCallbackNotice] = useState<string | null>(null);
  const [draftTz, setDraftTz] = useState<string | null>(null);
  const [draftTzUnlocked, setDraftTzUnlocked] = useState<boolean | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-bookings-overview", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("booking-client-admin", {
        body: { action: "overview", client_profile_id: clientId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        client: { id: string; name: string; email: string | null };
        event: {
          id: string; slug: string; name: string; is_active: boolean;
          accepting_bookings: boolean; duration_minutes: number;
          location_type: string | null; static_meeting_link: string | null;
          offer_phone_choice: boolean | null; lock_timezone: string | null;
          callback_notice_minutes?: number | null;
        } | null;
        rules: Array<Rule & { id: string; timezone: string }>;
        connection: { status: string; provider: string | null; calendar_email: string | null; invited_at: string | null; connected_at: string | null; last_error: string | null } | null;
        bookings: ClientBooking[];
      };
    },
  });

  // Fulfilment rebook/cancel (16 Sep). Both act on one booking at a time; the
  // row being acted on is held here so the dialogs know their subject.
  const [rebooking, setRebooking] = useState<ClientBooking | null>(null);
  const [cancelling, setCancelling] = useState<ClientBooking | null>(null);

  const call = async (action: string, extra: Record<string, unknown> = {}, okMsg?: string) => {
    setBusy(action);
    try {
      const { data: res, error } = await supabase.functions.invoke("booking-client-admin", {
        body: { action, client_profile_id: clientId, ...extra },
      });
      const failMsg = error?.message || res?.error;
      if (failMsg) {
        toast.error(failMsg);
        return null;
      }
      if (okMsg) toast.success(okMsg);
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["client-bookings-overview", clientId] });
      return res;
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading bookings setup…
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground py-6">Couldn't load — refresh to retry.</p>;

  const rules = draftRules ?? data.rules.map((r) => ({
    weekday: r.weekday,
    start_time: r.start_time.slice(0, 5),
    end_time: r.end_time.slice(0, 5),
    buffer_minutes: r.buffer_minutes,
    min_notice_minutes: r.min_notice_minutes,
  }));

  // Effective meeting-location settings: the unsaved draft if edited, else live.
  const ev = data.event;
  const provider = draftProvider ?? ev?.location_type ?? "google_meet";
  const roomLink = draftRoomLink ?? ev?.static_meeting_link ?? "";
  const phoneChoice = draftPhoneChoice ?? !!ev?.offer_phone_choice;
  const liveCallbackNotice = String(ev?.callback_notice_minutes ?? 30);
  const callbackNotice = draftCallbackNotice ?? liveCallbackNotice;
  const callbackNoticeValid = /^\d+$/.test(callbackNotice.trim()) && Number(callbackNotice) <= 1440;
  // The client's working timezone drives BOTH the availability windows and what
  // the prospect sees. Unlocking lets the prospect pick their own instead.
  const liveTz = data.rules[0]?.timezone || ev?.lock_timezone || "Europe/London";
  const tz = draftTz ?? liveTz;
  const tzUnlocked = draftTzUnlocked ?? (!!ev && ev.lock_timezone === null);
  const locationDirty =
    draftProvider !== null || draftRoomLink !== null ||
    draftPhoneChoice !== null || draftTz !== null || draftTzUnlocked !== null ||
    (draftCallbackNotice !== null && draftCallbackNotice !== liveCallbackNotice);
  // A Microsoft-connected client needs no room link: the booking goes on their
  // own Outlook calendar and Teams mints a unique join link per booking (21 Sep).
  const msConnected = data.connection?.status === "connected" && data.connection?.provider === "microsoft";
  const roomLinkMissing = NEEDS_ROOM_LINK.includes(provider) && !roomLink.trim() && !(provider === "teams" && msConnected);

  const saveLocation = async () => {
    // Timezone lives in two places: the event (what the prospect is shown) and
    // every availability row (what the windows mean). Keep them together.
    const res = await call("update_event", {
      event_id: ev?.id,
      location_type: provider,
      static_meeting_link: roomLink.trim(),
      offer_phone_choice: phoneChoice,
      lock_timezone: tzUnlocked ? null : tz,
      ...(phoneChoice && callbackNoticeValid ? { callback_notice_minutes: Number(callbackNotice) } : {}),
    }, "Meeting settings saved");
    if (!res) return;
    if (tz !== liveTz && rules.length > 0) {
      await call("save_rules", { rules, timezone: tz });
    }
    setDraftProvider(null); setDraftRoomLink(null);
    setDraftPhoneChoice(null); setDraftTz(null); setDraftTzUnlocked(null); setDraftCallbackNotice(null);
  };

  const connBadge = () => {
    const c = data.connection;
    if (!c) return <Badge variant="secondary">not invited yet</Badge>;
    if (c.status === "connected")
      return <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">connected · {c.calendar_email}</Badge>;
    if (c.status === "error")
      return <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">error</Badge>;
    return <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30">
      invited {c.invited_at ? format(new Date(c.invited_at), "d MMM") : ""}
    </Badge>;
  };

  return (
    <div className="space-y-4">
      {/* ── Event ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" /> Booking event
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data.event ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {data.client.name} isn't on Vexon OS Bookings yet. Creating their event gives the
                rostered setter a live booking page with starter hours (Mon–Fri 9–5 UK) you can
                refine below.
              </p>
              <Button size="sm" disabled={busy === "create_event"}
                onClick={() => call("create_event", {}, "Booking event created — starter hours added")}>
                <Plus className="h-4 w-4 mr-1.5" />
                {busy === "create_event" ? "Creating…" : "Create booking event"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{data.event.name}</span>
                <Badge variant={data.event.is_active ? "success" : "secondary"}>
                  {data.event.is_active ? "on" : "off"}
                </Badge>
                {data.event.is_active && data.event.accepting_bookings === false && (
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30">paused</Badge>
                )}
                <span className="text-xs text-muted-foreground">{data.event.duration_minutes} min</span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Link2 className="h-3 w-3" /> /bookings/{data.event.slug}
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/bookings/${data.event!.slug}`);
                    toast.success("Booking link copied");
                  }}>
                  Copy
                </Button>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => call("toggle_event",
                    { event_id: data.event!.id, field: "is_active", value: !data.event!.is_active },
                    data.event!.is_active ? "Event turned off" : "Event turned on")}>
                  {data.event.is_active ? "Turn off" : "Turn on"}
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => call("toggle_event",
                    { event_id: data.event!.id, field: "accepting_bookings", value: data.event!.accepting_bookings === false },
                    data.event!.accepting_bookings === false ? "Accepting bookings again" : "Bookings paused")}>
                  {data.event.accepting_bookings === false ? "Resume bookings" : "Pause bookings"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Meeting location & timezone ── */}
      {data.event && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Meeting location &amp; timezone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Where the meeting happens</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={provider}
                  onChange={(e) => setDraftProvider(e.target.value)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client&apos;s timezone</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={tz}
                  onChange={(e) => setDraftTz(e.target.value)}
                >
                  {TIMEZONES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {NEEDS_ROOM_LINK.includes(provider) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {provider === "teams" ? "Microsoft Teams" : "Zoom"} meeting-room link
                </Label>
                <Input
                  placeholder={provider === "teams"
                    ? "https://teams.microsoft.com/l/meetup-join/..."
                    : "https://zoom.us/j/..."}
                  value={roomLink}
                  onChange={(e) => setDraftRoomLink(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {provider === "teams" && msConnected ? (
                    <>This client's Microsoft calendar is connected, so every booking is created on their own Outlook calendar with a unique Teams link, the same way Calendly does it. Nothing to paste. A link here is only used if the connection is ever removed.</>
                  ) : (
                    <>Without a connected calendar we can only create Google Meet links, so {provider === "teams" ? "Teams" : "Zoom"} clients paste their permanent meeting-room link here once and it goes into every invite. Better: connect their calendar and the link is made for them.</>
                  )}
                  {roomLinkMissing && (
                    <span className="text-destructive">
                      {" "}Until this is filled in or the calendar is connected, invites fall back to a Google Meet link.
                    </span>
                  )}
                </p>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                checked={phoneChoice}
                onChange={(e) => setDraftPhoneChoice(e.target.checked)}
              />
              <span>
                Offer a Callback as well as video
                <span className="block text-xs text-muted-foreground">
                  A 15-minute call from the client to the prospect's mobile, today or in the next two
                  working days (UK time). The mobile number is required.
                </span>
              </span>
            </label>
            {phoneChoice && (
              <div className="space-y-1.5 pl-5">
                <Label className="text-xs text-muted-foreground">Earliest callback, in minutes from now</Label>
                <Input
                  type="number" min={0} max={1440} step={5} className="w-32"
                  value={callbackNotice}
                  onChange={(e) => setDraftCallbackNotice(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {callbackNoticeValid
                    ? `A callback can be booked from ${callbackNotice} minutes from now. Video calls keep the notice on the hours below.`
                    : "Enter a whole number of minutes, 0 to 1440."}
                </p>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
                checked={tzUnlocked}
                onChange={(e) => setDraftTzUnlocked(e.target.checked)}
              />
              <span>
                Let the prospect pick their own timezone
                <span className="block text-xs text-muted-foreground">
                  Leave off for clients who only work one market — times are then always shown
                  in {tzLabel(tz)}. Turn on for clients working across regions.
                </span>
              </span>
            </label>

            {locationDirty && (
              <Button size="sm" disabled={busy === "update_event" || busy === "save_rules" || (phoneChoice && !callbackNoticeValid)}
                onClick={saveLocation}>
                <Save className="h-4 w-4 mr-1.5" />
                {busy === "update_event" || busy === "save_rules" ? "Saving…" : "Save meeting settings"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Availability windows ── */}
      {data.event && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Availability windows{" "}
              <span className="font-normal text-muted-foreground">({tzLabel(tz)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rules.length === 0 && (
              <p className="text-sm text-muted-foreground">No windows — the booking page shows no times.</p>
            )}
            {rules.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select
                  className="col-span-4 h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={r.weekday}
                  onChange={(e) => {
                    const next = [...rules];
                    next[i] = { ...r, weekday: Number(e.target.value) };
                    setDraftRules(next);
                  }}
                >
                  {WEEKDAYS.map((d, wi) => <option key={wi} value={wi}>{d}</option>)}
                </select>
                <Input className="col-span-3" type="time" value={r.start_time}
                  onChange={(e) => { const next = [...rules]; next[i] = { ...r, start_time: e.target.value }; setDraftRules(next); }} />
                <Input className="col-span-3" type="time" value={r.end_time}
                  onChange={(e) => { const next = [...rules]; next[i] = { ...r, end_time: e.target.value }; setDraftRules(next); }} />
                <Button size="icon" variant="ghost" className="col-span-2 h-9 w-9"
                  onClick={() => setDraftRules(rules.filter((_, x) => x !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline"
                onClick={() => setDraftRules([...rules, {
                  weekday: 1, start_time: "09:00", end_time: "17:00",
                  buffer_minutes: rules[0]?.buffer_minutes ?? 15,
                  min_notice_minutes: rules[0]?.min_notice_minutes ?? 120,
                }])}>
                <Plus className="h-4 w-4 mr-1" /> Add window
              </Button>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Buffer (min)</Label>
                <Input className="w-16 h-8" type="number" value={rules[0]?.buffer_minutes ?? 15}
                  onChange={(e) => setDraftRules(rules.map((r) => ({ ...r, buffer_minutes: Number(e.target.value) || 0 })))} />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Min notice (min)</Label>
                <Input className="w-20 h-8" type="number" value={rules[0]?.min_notice_minutes ?? 120}
                  onChange={(e) => setDraftRules(rules.map((r) => ({ ...r, min_notice_minutes: Number(e.target.value) || 0 })))} />
              </div>
              {draftRules && (
                <Button size="sm" disabled={busy === "save_rules"}
                  onClick={async () => {
                    const res = await call("save_rules", { rules, timezone: tz }, "Availability saved");
                    if (res) setDraftRules(null);
                  }}>
                  <Save className="h-4 w-4 mr-1.5" />
                  {busy === "save_rules" ? "Saving…" : "Save windows"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Calendar connection ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Calendar connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">{connBadge()}</div>
          {data.connection?.last_error && (
            <p className="text-xs text-destructive">{data.connection.last_error}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {data.connection?.status === "connected"
              ? "Live availability from their real calendar; meetings land on it directly."
              : "Until they connect, times come from the windows above and the invite reaches them by email. The connect email carries a one-click Google link."}
          </p>
          {data.connection?.status !== "connected" && (
            <Button size="sm" variant="outline" disabled={busy === "send_connect"}
              onClick={() => call("send_connect", {},
                `Connect email sent to ${data.client.email || "the client"}`)}>
              <Mail className="h-4 w-4 mr-1.5" />
              {busy === "send_connect"
                ? "Sending…"
                : data.connection ? "Resend connect email" : "Send connect email"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Recent bookings ── */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Booked through Vexon OS</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.bookings.length === 0 && (
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
          )}
          {data.bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2 flex-wrap">
              <span className="font-medium">{b.prospect_name || b.prospect_email || "Prospect"}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(b.starts_at), "EEE d MMM, HH:mm")}
              </span>
              <Badge variant={b.status === "confirmed" ? "success" : b.status === "cancelled" ? "secondary" : "outline"}>
                {b.status}
              </Badge>
              {b.prospect_confirmed_at && (
                <Badge className="bg-green-500/20 text-green-700 border-green-500/30">prospect confirmed</Badge>
              )}
              {!b.google_event_id && b.status !== "cancelled" && (
                <Badge className="bg-red-500/20 text-red-700 border-red-500/30">no calendar invite</Badge>
              )}
              {/* A meeting that already happened doesn't need moving, and a
                  cancelled one has nothing left to move or clear. */}
              {b.status !== "cancelled" && new Date(b.starts_at) > new Date() && (
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => setRebooking(b)}>
                    <CalendarClock className="h-3.5 w-3.5 mr-1" /> Rebook
                  </Button>
                  <Button size="sm" variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => setCancelling(b)}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <ClientRebookDialog
        open={!!rebooking}
        onOpenChange={(v) => !v && setRebooking(null)}
        clientId={clientId}
        booking={rebooking}
        onDone={() => { setRebooking(null); refetch(); }}
      />

      <AlertDialog open={!!cancelling} onOpenChange={(v) => !v && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling && (
                <>
                  This removes{" "}
                  <strong>
                    {cancelling.prospect_name || cancelling.prospect_email || "the prospect"}
                  </strong>{" "}
                  at {format(new Date(cancelling.starts_at), "EEE d MMM 'at' HH:mm")} from the
                  client's calendar and stops their reminders. The prospect gets the
                  cancellation from the calendar itself. This can't be undone — to move the
                  meeting instead, use Rebook.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = cancelling;
                setCancelling(null);
                if (target) {
                  await call("cancel_booking", { booking_id: target.id }, "Meeting cancelled");
                }
              }}
            >
              Cancel the meeting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
