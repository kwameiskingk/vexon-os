import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ButtonV2, Eyebrow, Panel, Pill } from "@/components/ui-v2";
import {
  DEFAULT_TEMPLATES,
  MOMENT_LABELS,
  TEMPLATE_KEYS,
  TEMPLATE_PLACEHOLDERS,
  renderTemplateText,
  type MessageTemplate,
  type TemplateKey,
  type TemplateMoment,
  type TemplateVars,
} from "../../../supabase/functions/_shared/kronos-message-defaults.ts";

/**
 * Dev Centre › Kronos › Message copy (16 Oct 2026, the owner): every text and
 * email a prospect receives from Kronos, editable without a deploy.
 *
 * Two scopes. "Every event" is the wording all events use; picking one event
 * shows that event's wording, which starts out as the shared wording and can
 * be given its own. The edge functions read the same table
 * (booking_message_templates) at send time: the event's own row, else the
 * shared row, else the default in kronos-message-defaults.ts.
 */

type TemplateRow = {
  id: string;
  key: string;
  event_type_id: string | null;
  enabled: boolean;
  subject: string | null;
  heading: string | null;
  body: string;
  updated_at: string;
};

type EventLite = { id: string; name: string; client_id: string | null; is_active: boolean };

const SAMPLE_VARS: TemplateVars = {
  name: "Jane Smith",
  first_name: "Jane",
  event: "Brightwater Group Discovery Call",
  with: "Brightwater Group",
  when: "Monday 19 October at 12:00",
  was_when: "Friday 16 October at 15:00",
  how: "Join: https://teams.microsoft.com/l/meetup-join/…",
  mobile: "+447700900123",
};
// What the same placeholders become on a callback (no link; who rings whom).
const CALLBACK_SAMPLE_VARS: TemplateVars = {
  ...SAMPLE_VARS,
  event: "callback",
  how: "Brightwater Group will call you on +447700900123.",
};

// booking_message_templates is not in the generated types until the hosted builder
// regenerates them; an untyped client reaches it without casting rows to any.
const db = supabase as unknown as SupabaseClient;

const MOMENT_ORDER: TemplateMoment[] = ["confirmation", "callback", "reminder_24h", "reminder_3h", "rescheduled"];

export function KronosMessageCopyTab() {
  const [scope, setScope] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["kronos-message-templates"],
    queryFn: async () => {
      const [{ data: rows, error: rErr }, { data: events, error: eErr }] = await Promise.all([
        db.from("booking_message_templates")
          .select("id, key, event_type_id, enabled, subject, heading, body, updated_at"),
        supabase.from("booking_event_types").select("id, name, client_id, is_active").order("name"),
      ]);
      if (rErr) throw rErr;
      if (eErr) throw eErr;
      return { rows: (rows || []) as TemplateRow[], events: (events || []) as EventLite[] };
    },
  });

  const events = data?.events || [];
  const rows = data?.rows || [];
  const eventId = scope === "all" ? null : scope;
  const eventName = events.find((e) => e.id === eventId)?.name;
  const customisedCount = (id: string) => rows.filter((r) => r.event_type_id === id).length;

  return (
    <Panel
      title="Message copy"
      meta="Every text and email a prospect gets from Kronos. The calendar invite itself is sent by Google or Microsoft and is not edited here."
    >
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[280px]">
          <p className="dc-label mb-1">Wording for</p>
          <select className="dc-select w-full" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Every event (the shared wording)</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.is_active ? "" : " (off)"}{customisedCount(e.id) ? ` · ${customisedCount(e.id)} own` : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="pb-1 text-[11.5px] text-[var(--dim)]">
          {eventId
            ? `${eventName} uses the shared wording unless you give a message its own below.`
            : "Changes here apply to every event that has not been given its own wording."}
        </p>
      </div>

      <details className="mt-3 text-[12px] text-[var(--ink2)]">
        <summary className="cursor-pointer text-[var(--dim)]">Placeholders you can use</summary>
        <ul className="mt-2 space-y-1">
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <li key={p.token}><code className="dc-mono text-[var(--ink)]">{p.token}</code> · {p.means}</li>
          ))}
        </ul>
      </details>

      {isLoading && <p className="py-[18px] text-[12px] text-[var(--dim)]">Loading…</p>}
      {error && <p className="py-[18px] text-[12px] text-[var(--bad)]">{(error as Error).message}</p>}
      {data && MOMENT_ORDER.map((moment) => (
        <div key={moment} className="mt-6">
          <Eyebrow className="mb-2">{MOMENT_LABELS[moment]}</Eyebrow>
          <div className="space-y-3">
            {TEMPLATE_KEYS.filter((k) => DEFAULT_TEMPLATES[k].moment === moment).map((key) => (
              <TemplateEditor
                key={`${scope}:${key}`}
                templateKey={key}
                eventTypeId={eventId}
                rows={rows}
              />
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}

function TemplateEditor({ templateKey, eventTypeId, rows }: { templateKey: TemplateKey; eventTypeId: string | null; rows: TemplateRow[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const base = DEFAULT_TEMPLATES[templateKey];
  const sharedRow = rows.find((r) => r.key === templateKey && r.event_type_id === null) || null;
  const ownRow = eventTypeId ? rows.find((r) => r.key === templateKey && r.event_type_id === eventTypeId) || null : null;
  // What actually goes out for this scope right now.
  const live: MessageTemplate = useMemo(() => {
    const merge = (t: MessageTemplate, r: TemplateRow | null): MessageTemplate => r ? {
      ...t,
      enabled: r.enabled !== false,
      subject: t.channel === "email" ? ((r.subject || "").trim() || t.subject) : null,
      heading: t.channel === "email" ? ((r.heading || "").trim() || t.heading) : null,
      body: (r.body || "").trim() || t.body,
    } : t;
    return merge(merge(base, sharedRow), ownRow);
  }, [base, sharedRow, ownRow]);
  const editingRow = eventTypeId ? ownRow : sharedRow;

  const [draft, setDraft] = useState({
    enabled: live.enabled, subject: live.subject || "", heading: live.heading || "", body: live.body,
  });
  // After a save or a reset the live wording changes underneath: start over from it.
  const liveSignature = JSON.stringify([live.enabled, live.subject, live.heading, live.body]);
  useEffect(() => {
    setDraft({ enabled: live.enabled, subject: live.subject || "", heading: live.heading || "", body: live.body });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSignature]);
  const dirty =
    draft.enabled !== live.enabled ||
    draft.body.trim() !== live.body.trim() ||
    (base.channel === "email" && (draft.subject.trim() !== (live.subject || "").trim() || draft.heading.trim() !== (live.heading || "").trim()));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["kronos-message-templates"] });

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.body.trim()) throw new Error("The message can't be empty. Use Reset to go back to the default.");
      const values = {
        key: templateKey,
        event_type_id: eventTypeId,
        channel: base.channel,
        enabled: draft.enabled,
        subject: base.channel === "email" ? draft.subject.trim() || null : null,
        heading: base.channel === "email" ? draft.heading.trim() || null : null,
        body: draft.body.trim(),
        updated_by: user?.id || null,
      };
      const table = db.from("booking_message_templates");
      const { error } = editingRow
        ? await table.update(values).eq("id", editingRow.id)
        : await table.insert(values);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${base.label} saved`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Reset: drop this scope's row. An event falls back to the shared wording,
  // the shared wording falls back to the default in code.
  const reset = useMutation({
    mutationFn: async () => {
      if (!editingRow) return;
      const { error } = await db.from("booking_message_templates").delete().eq("id", editingRow.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(eventTypeId ? `${base.label}: back to the shared wording` : `${base.label}: back to the default`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const source = eventTypeId
    ? (ownRow ? "this event's own wording" : sharedRow ? "shared wording (edited)" : "shared wording (default)")
    : (sharedRow ? "edited" : "default");
  // The callback text only goes on callbacks; the confirmation text only on
  // video calls; reminders and moved messages go on both, so show both.
  const previews: Array<[string, TemplateVars]> =
    base.moment === "callback" ? [["", CALLBACK_SAMPLE_VARS]]
    : base.moment === "confirmation" ? [["", SAMPLE_VARS]]
    : [["Video call", SAMPLE_VARS], ["Callback", CALLBACK_SAMPLE_VARS]];
  const previewLength = Math.max(...previews.map(([, v]) => renderTemplateText(draft.body, v).length));

  return (
    <div className="rounded-[8px] border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{base.label}</span>
        <Pill variant="info">{base.channel === "sms" ? "Text" : "Email"}</Pill>
        <Pill variant={ownRow || (!eventTypeId && sharedRow) ? "warn" : "default"}>{source}</Pill>
        {!draft.enabled && <Pill variant="bad">off, not sent</Pill>}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink2)]">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          Send this message
        </label>
      </div>

      {base.channel === "email" && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="dc-label mb-1">Subject</p>
            <input className="dc-input w-full" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </div>
          <div>
            <p className="dc-label mb-1">Heading (the coloured band at the top)</p>
            <input className="dc-input w-full" value={draft.heading} onChange={(e) => setDraft({ ...draft, heading: e.target.value })} />
          </div>
        </div>
      )}
      <div className="mt-3">
        <p className="dc-label mb-1">{base.channel === "email" ? "Body (a blank line starts a new paragraph)" : "Text"}</p>
        <textarea
          className="dc-textarea w-full"
          rows={base.channel === "email" ? 7 : 3}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        {base.channel === "sms" && (
          <p className="mt-1 font-mono text-[10px] text-[var(--dim)]">{previewLength} characters with the example below{previewLength > 160 ? ` · ${Math.ceil(previewLength / 153)} texts` : ""}</p>
        )}
      </div>

      <div className="mt-3 rounded-[6px] bg-[var(--surf2)] p-2.5 text-[12px] text-[var(--ink2)]">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Example, with made-up details</p>
        {previews.map(([label, vars]) => (
          <div key={label || "only"} className="mt-1.5 first:mt-0">
            {label && <p className="font-mono text-[10px] text-[var(--dim)]">{label}</p>}
            {base.channel === "email" && (
              <p className="mb-1"><b>{renderTemplateText(draft.subject, vars)}</b> · {renderTemplateText(draft.heading, vars)}</p>
            )}
            <p className="whitespace-pre-line">{renderTemplateText(draft.body, vars)}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ButtonV2 size="sm" variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : eventTypeId && !ownRow ? "Save as this event's own wording" : "Save"}
        </ButtonV2>
        {dirty && (
          <ButtonV2 size="sm" variant="ghost" onClick={() => setDraft({ enabled: live.enabled, subject: live.subject || "", heading: live.heading || "", body: live.body })}>
            Undo changes
          </ButtonV2>
        )}
        {editingRow && (
          <ButtonV2 size="sm" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
            {eventTypeId ? "Use the shared wording again" : "Reset to default"}
          </ButtonV2>
        )}
        {editingRow && (
          <span className="font-mono text-[10px] text-[var(--dim)]">
            saved {new Date(editingRow.updated_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}
