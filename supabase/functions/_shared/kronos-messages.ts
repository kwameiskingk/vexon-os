// Kronos message copy at send time (16 Oct 2026). Loads the wording saved in
// Dev Centre > Kronos > Message copy over the defaults, fills the
// placeholders, and sets an email in the branded shell the reminders always
// used (client logo on a client event, Meridian's otherwise).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { LEGAL_LINE } from "./legalEntity.ts";
import {
  DEFAULT_TEMPLATES,
  renderTemplateText,
  TEMPLATE_KEYS,
  type MessageTemplate,
  type TemplateKey,
  type TemplateVars,
} from "./kronos-message-defaults.ts";

export type { MessageTemplate, TemplateKey, TemplateVars };
export type Templates = Record<TemplateKey, MessageTemplate>;

export const MESSAGE_TZ = "Europe/London";

/** The button reads for the link it opens: Meet, Teams, Zoom, or a plain "Join the call". */
export const joinLabel = (link: string | null | undefined) => {
  const l = String(link || "").toLowerCase();
  if (l.includes("meet.google.com")) return "Join with Google Meet";
  if (l.includes("teams.microsoft.com") || l.includes("teams.live.com")) return "Join with Microsoft Teams";
  if (l.includes("zoom.us")) return "Join with Zoom";
  return "Join the call";
};

/** Same sending address, the client's name on it: "Ridgeway Legal <bookings@…>". */
export function clientFromAddress(name: string) {
  const configured = Deno.env.get("RESEND_FROM") || "Meridian <bookings@send.meridiansales.example>";
  const address = configured.match(/<([^>]+)>/)?.[1] || configured;
  return `${name.replace(/[<>"]/g, "")} <${address}>`;
}

const esc = (v: string) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The wording for one event: its own saved rows, then the rows every event
 * uses, then the defaults in code. A saved body left blank falls back to the
 * layer below; a row's on/off switch always counts. Never throws: if the
 * table can't be read, the defaults stand and the message still goes. */
export async function loadTemplates(supabase: SupabaseClient, eventTypeId: string | null | undefined): Promise<Templates> {
  const out: Templates = { ...DEFAULT_TEMPLATES };
  try {
    let q = supabase.from("booking_message_templates").select("key, event_type_id, enabled, subject, heading, body");
    q = eventTypeId ? q.or(`event_type_id.is.null,event_type_id.eq.${eventTypeId}`) : q.is("event_type_id", null);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []) as Array<{ key: string; event_type_id: string | null; enabled: boolean; subject: string | null; heading: string | null; body: string | null }>;
    // Default-set rows first, then this event's rows on top.
    rows.sort((a, b) => Number(!!a.event_type_id) - Number(!!b.event_type_id));
    for (const row of rows) {
      if (!TEMPLATE_KEYS.includes(row.key as TemplateKey)) continue;
      const base = out[row.key as TemplateKey];
      out[row.key as TemplateKey] = {
        ...base,
        enabled: row.enabled !== false,
        subject: base.channel === "email" ? (String(row.subject ?? "").trim() || base.subject) : null,
        heading: base.channel === "email" ? (String(row.heading ?? "").trim() || base.heading) : null,
        body: String(row.body ?? "").trim() || base.body,
      };
    }
  } catch (e) {
    console.error("[kronos-messages] load:", e);
  }
  return out;
}

/** "Monday 19 October at 12:00", in UK time: the wording every message has used. */
export const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: MESSAGE_TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

const firstNameOf = (name: string | null | undefined) => String(name ?? "").trim().split(/\s+/)[0] || "there";

export type VarsInput = {
  prospectName: string | null | undefined;
  eventName: string;
  withName: string;
  startsAt: string;
  wasStartsAt?: string | null;
  meetLink?: string | null;
  prospectMobile?: string | null;
  /** A callback (client event, phone): {event} reads "callback" and {how}
   * says who will ring which number. */
  callback?: boolean;
};

export function templateVars(o: VarsInput): TemplateVars {
  return {
    name: String(o.prospectName ?? "").trim() || "there",
    first_name: firstNameOf(o.prospectName),
    event: o.callback ? "callback" : o.eventName,
    with: o.withName,
    when: whenLabel(o.startsAt),
    was_when: o.wasStartsAt ? whenLabel(o.wasStartsAt) : "the earlier time",
    how: o.callback
      ? (o.prospectMobile ? `${o.withName} will call you on ${o.prospectMobile}.` : `${o.withName} will call you.`)
      : o.meetLink ? `Join: ${o.meetLink}` : "",
    mobile: o.prospectMobile || "",
  };
}

export const renderSms = (t: MessageTemplate, vars: TemplateVars) => renderTemplateText(t.body, vars);

/** Subject and HTML of an email template. Paragraphs are split on blank lines;
 * one that is only {when} becomes the big blue time line with "(UK time)".
 * The join button follows the body when there is a link; on a callback, the
 * "will call you on" line does. */
export function renderEmail(
  t: MessageTemplate,
  vars: TemplateVars,
  opts: { meetLink?: string | null; brandName?: string | null; clientLogo?: string | null; callback?: boolean } = {},
): { subject: string; html: string } {
  const subject = renderTemplateText(t.subject || "{event}", vars);
  const heading = renderTemplateText(t.heading || "", vars);
  const paragraphs = String(t.body ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const card = paragraphs
    .map((p) =>
      p === "{when}"
        ? `<p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#2f4661;">${esc(vars.when)} (UK time)</p>`
        : `<p style="margin:0 0 14px;">${esc(renderTemplateText(p, vars)).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n      ");
  const link = opts.meetLink && /^https:\/\//.test(opts.meetLink) ? opts.meetLink : null;
  // A callback has no link: the line under the time says who rings which number.
  // A body that already places {how} itself gets neither, or it would show twice.
  const button = /\{how\}/.test(String(t.body ?? ""))
    ? ""
    : opts.callback
    ? `<p style="margin:0 0 14px;font-weight:700;">${esc(vars.how)}</p>`
    : link
    ? `<p style="margin:0 0 14px;"><a href="${esc(link)}" style="display:inline-block;background:#3d5a80;color:#ffffff;text-decoration:none;border-radius:999px;padding:10px 22px;font-weight:700;">${joinLabel(link)}</a></p>`
    : "";
  // Client name and logo are client-editable: escaped before they reach HTML.
  const brand = opts.clientLogo && /^https:\/\//.test(opts.clientLogo)
    ? `<img src="${esc(opts.clientLogo)}" width="56" height="56" alt="${esc(opts.brandName || "")}" style="display:block;width:56px;height:56px;border-radius:12px;background:#ffffff;object-fit:contain;border:0;" />`
    : `<img src="https://vexon-os.example/brand/vexon-logo-white.png" width="120" alt="Vexon OS" style="display:block;width:120px;height:auto;border:0;" />`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,Segoe UI,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#9e9e9e;background:linear-gradient(135deg,#dedede 0%,#9e9e9e 50%,#6b7a90 100%);border-radius:16px;padding:28px 30px;color:#0f0f11;">
      ${brand}
      ${heading ? `<h1 style="margin:8px 0 0;font-size:22px;">${esc(heading)}</h1>` : ""}
    </div>
    <div style="background:#ffffff;border:1px solid #e3e3e6;border-radius:16px;padding:26px 30px;margin-top:16px;color:#111113;">
      ${card}
      ${button}
    </div>
    <p style="text-align:center;color:#5f5f66;font-size:11px;margin-top:14px;">Powered by Vexon OS Bookings<br/>${LEGAL_LINE}</p>
  </div></body></html>`;
  return { subject, html };
}
