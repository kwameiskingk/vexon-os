// The texts and emails a prospect receives from Kronos, in their default
// wording (16 Oct 2026, the owner: Dev Centre > Kronos > Message copy).
//
// Shared by two runtimes, so keep it free of imports and of any runtime API:
//  - the edge functions import it through ./kronos-messages.ts;
//  - the app imports it by relative path for the Message copy editor
//    (labels, placeholders, the default wording behind "Reset").
//
// What is saved in the editor (booking_message_templates) wins over these:
// an event's own row first, then the row every event uses, then this file.

export type TemplateChannel = "email" | "sms";

export type TemplateKey =
  | "confirmation_sms"
  | "reminder_24h_email"
  | "reminder_24h_sms"
  | "reminder_3h_email"
  | "reminder_3h_sms"
  | "rescheduled_sms"
  | "rescheduled_email"
  | "callback_sms";

export type TemplateMoment = "confirmation" | "callback" | "reminder_24h" | "reminder_3h" | "rescheduled";

export type MessageTemplate = {
  key: TemplateKey;
  channel: TemplateChannel;
  /** When it goes out, for grouping on the editor. */
  moment: TemplateMoment;
  label: string;
  enabled: boolean;
  /** Email only. */
  subject: string | null;
  /** Email only: the line in the coloured band at the top. */
  heading: string | null;
  body: string;
};

/** What each curly placeholder becomes. */
export type TemplateVars = {
  name: string;
  first_name: string;
  event: string;
  with: string;
  when: string;
  was_when: string;
  how: string;
  mobile: string;
};

export const TEMPLATE_PLACEHOLDERS: ReadonlyArray<{ token: `{${keyof TemplateVars}}`; means: string }> = [
  { token: "{name}", means: "the prospect's full name (\"there\" when we have none)" },
  { token: "{first_name}", means: "the prospect's first name (\"there\" when we have none)" },
  { token: "{event}", means: "the event's name, e.g. \"Brightwater Group Discovery Call\"; on a callback it is just \"callback\"" },
  { token: "{with}", means: "who the call is with: the client's name on a client event, otherwise the host or Meridian" },
  { token: "{when}", means: "the day and time in UK time, e.g. \"Monday 19 October at 12:00\". In an email, a paragraph that is only {when} is shown as the big time line" },
  { token: "{was_when}", means: "the previous time, when a call has moved" },
  { token: "{how}", means: "\"Join: <meeting link>\" for a video call; on a callback \"Brightwater Group will call you on +44…\"; nothing otherwise" },
  { token: "{mobile}", means: "the prospect's mobile number" },
];

export const MOMENT_LABELS: Record<TemplateMoment, string> = {
  confirmation: "When the call is booked",
  callback: "When a callback is booked (client pages)",
  reminder_24h: "The day before (24 hours ahead)",
  reminder_3h: "Three hours before",
  rescheduled: "When the call is moved",
};

const REMINDER_EMAIL_BODY =
  "Hi {name},\n\nA quick reminder about your {event} with {with}:\n\n{when}\n\nCan't make it any more? Just reply to this email and we'll find a better time.";

export const DEFAULT_TEMPLATES: Record<TemplateKey, MessageTemplate> = {
  confirmation_sms: {
    key: "confirmation_sms", channel: "sms", moment: "confirmation", label: "Confirmation text",
    enabled: true, subject: null, heading: null,
    body: "Hi {name}, your {event} with {with} is confirmed for {when} (UK Time). A calendar invite has been sent to your email.",
  },
  // 16 Oct (the owner): replaces the confirmation text when a callback is booked.
  // The calendar invitation is the prospect's email.
  callback_sms: {
    key: "callback_sms", channel: "sms", moment: "callback", label: "Callback booked text",
    enabled: true, subject: null, heading: null,
    body: "Hi {first_name}, your callback with {with} is booked for {when} (UK time).",
  },
  reminder_24h_email: {
    key: "reminder_24h_email", channel: "email", moment: "reminder_24h", label: "Day-before email",
    enabled: true, subject: "Tomorrow: {event}, {when} (UK)", heading: "See you tomorrow 👋",
    body: REMINDER_EMAIL_BODY,
  },
  reminder_24h_sms: {
    key: "reminder_24h_sms", channel: "sms", moment: "reminder_24h", label: "Day-before text",
    enabled: true, subject: null, heading: null,
    body: "Reminder: your {event} with {with} is tomorrow, {when} (UK time). {how}",
  },
  reminder_3h_email: {
    key: "reminder_3h_email", channel: "email", moment: "reminder_3h", label: "Three-hour email",
    enabled: true, subject: "Starting soon: {event}, {when} (UK)", heading: "Your call starts in 3 hours ⏰",
    body: REMINDER_EMAIL_BODY,
  },
  reminder_3h_sms: {
    key: "reminder_3h_sms", channel: "sms", moment: "reminder_3h", label: "Three-hour text",
    enabled: true, subject: null, heading: null,
    body: "Reminder: your {event} with {with} is in about 3 hours, {when} (UK time). {how}",
  },
  rescheduled_sms: {
    key: "rescheduled_sms", channel: "sms", moment: "rescheduled", label: "Moved text",
    enabled: true, subject: null, heading: null,
    body: "Hi {name}, your {event} with {with} has moved to {when} (UK Time). The calendar invite has been updated.",
  },
  rescheduled_email: {
    key: "rescheduled_email", channel: "email", moment: "rescheduled", label: "Moved email",
    enabled: true, subject: "Moved: {event}, now {when} (UK Time)", heading: "Your call has moved",
    body: "Hi {name},\n\nYour {event} with {with} has moved.\n\n{when}\n\nIt was {was_when}. Your calendar invite has been updated. If the new time does not work, just reply to this email.",
  },
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES) as TemplateKey[];

/** Fills the placeholders. An unknown {token} is left as typed so a typo shows
 * up in the message instead of vanishing; a placeholder with no value (an
 * empty {how}) leaves no double space or dangling space behind. */
export function renderTemplateText(text: string, vars: TemplateVars): string {
  return String(text ?? "")
    .replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? String(vars[k as keyof TemplateVars] ?? "") : m))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
