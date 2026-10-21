// CLIENT-FACING onboarding journey engine.
//
// The journey tables give clients SELECT only — every mutation flows through
// here so stage locking is enforced server-side ("a lot more robust than the
// SDR one": a locked stage genuinely cannot be completed, not merely hidden).
//
// Actions (caller = a signed-in client linked to the journey's profile; staff
// admin tier may also call for support/debugging):
//   journey          → resolved stages + lock states + progress (stamps first
//                      sign-in and auto-completes stage-1 on first call)
//   save_form_draft  → { step_key, answers } partial save, no completion
//   complete_step    → { step_key, ...payload } validated per step_type
//   booking_context  → { step_key } → event id/host/duration for the slot picker
//                      (clients can no longer read booking tables directly)
//   event_context    → { event_slug } → the same shape for a CLIENT-BOOKABLE
//                      event outside the journey (the Communications page's
//                      "Catch-up with Daniel", 3 Sep). Allow-listed slugs
//                      only, works for any signed-in client with a profile,
//                      journey or not (older clients have no journey row).
//   connect_url      → mints/reuses the calendar-connect token and returns the
//                      /connect-calendar URL for an in-portal redirect (the
//                      email flow via the CSM panel still exists; this is the
//                      client-initiated twin)
//   reopen_step      → { step_key } puts the client's own finished card back
//                      (2 Oct, Marcus's mis-click case); answers are kept
//   update_answers   → { step_key, ...payload } re-validates and REPLACES the
//                      answers/file on an already-completed editable step
//                      (form, yes_no, text_list, upload) without touching its
//                      completion — the deck's "Previous → Edit" (3 Sep)
//   go_to_dashboard  → releases the client to the portal once every card is
//                      done (3 Sep: no CSM release gate any more)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { toJourneyQuestions, type FormSchema } from "../_shared/form-logic.ts";
import {
  CAMPAIGN_LIVE_STAGE_KEY,
  ONBOARDING_STAFF_ROLES,
  clientProfileIdsFor,
  computeStages,
  progressPct,
  readyForLive,
  type JourneyTaskRow,
  type StageView,
} from "../_shared/client-journey.ts";
import { fileAnswersPdf } from "../_shared/onboarding-answers-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://vexon-os.example";

// Events a signed-in client may resolve (and then book through
// booking-create) from inside the portal without a journey step.
const CLIENT_BOOKABLE_EVENT_SLUGS = ["catch-up-with-daniel-msp", "onboarding-call-msp-a7w3k"];

Deno.serve(async (req): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "journey");

    // ── Resolve the journey the caller may act on ──────────────────────────
    const { data: roleRows } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    const isStaff = roles.some((r) => ONBOARDING_STAFF_ROLES.includes(r));

    let profileIds: string[];
    if (isStaff && typeof body.client_profile_id === "string") {
      profileIds = [body.client_profile_id];
    } else {
      profileIds = await clientProfileIdsFor(svc, user.id);
    }
    if (profileIds.length === 0) return json({ error: "No client profile linked to this login" }, 403);

    // ── event_context (journey-independent) ────────────────────────────────
    // Resolved BEFORE the journey lookup: a released or pre-journey client
    // must still be able to book a catch-up from Communications.
    if (action === "event_context") {
      const slug = String(body.event_slug || "");
      if (!CLIENT_BOOKABLE_EVENT_SLUGS.includes(slug)) {
        return json({ error: "That event is not bookable from the client portal" }, 403);
      }
      const { data: event } = await svc
        .from("booking_event_types")
        .select("id, name, duration_minutes, is_active, accepting_bookings, lock_timezone")
        .eq("slug", slug)
        .maybeSingle();
      if (!event || !event.is_active) {
        return json({ error: "This call isn't set up yet. Email your Customer Success Manager and they'll sort a time." }, 404);
      }
      const { data: hosts } = await svc
        .from("booking_event_hosts")
        .select("host_user_id")
        .eq("event_type_id", event.id)
        .not("host_user_id", "is", null)
        .order("priority", { ascending: true });
      const hostId = hosts?.[0]?.host_user_id;
      if (!hostId) return json({ error: "No host is set up for this call yet" }, 404);
      const { data: profile } = await svc
        .from("client_profiles")
        .select("id, company_name, contact_name, email, phone")
        .eq("id", profileIds[0])
        .maybeSingle();
      return json({
        event_type_id: event.id,
        host_user_id: hostId,
        name: event.name,
        duration_minutes: event.duration_minutes,
        accepting_bookings: event.accepting_bookings !== false,
        lock_timezone: event.lock_timezone ?? null,
        client: profile
          ? {
              client_profile_id: profile.id,
              company_name: profile.company_name,
              contact_name: profile.contact_name,
              email: profile.email,
              phone: profile.phone,
            }
          : null,
      });
    }

    const { data: journey } = await svc
      .from("client_onboarding_journeys")
      .select("*")
      .in("client_profile_id", profileIds)
      .maybeSingle();
    if (!journey) return json({ journey: null });
    if (journey.status === "awaiting_payment" && !isStaff) {
      // Pre-payment a client login shouldn't normally exist; degrade politely.
      return json({ journey: { status: "awaiting_payment" } });
    }

    const { data: client } = await svc
      .from("client_profiles")
      .select("id, company_name, contact_name, email, phone")
      .eq("id", journey.client_profile_id)
      .single();

    const loadTasks = async (): Promise<JourneyTaskRow[]> => {
      const { data } = await svc
        .from("client_journey_tasks")
        .select("*")
        .eq("journey_id", journey.id)
        .order("stage_order", { ascending: true })
        .order("sort_order", { ascending: true });
      return (data || []) as JourneyTaskRow[];
    };
    const loadUnlocks = async (): Promise<Set<string>> => {
      const { data } = await svc
        .from("client_journey_stage_unlocks")
        .select("stage_key")
        .eq("journey_id", journey.id);
      return new Set((data || []).map((r: any) => r.stage_key as string));
    };

    const notifyCsm = async (title: string, message: string) => {
      await svc.from("notifications").insert({
        recipient_id: null,
        recipient_role: "csm",
        title,
        message,
        category: "system",
        link_url: "/csm/onboarding",
      });
    };

    // 6 Oct (the owner): a completed or edited form card files a PDF of the
    // questions and answers in the client's Documents. Never blocks the
    // client: a failure is logged and the card still completes.
    const fileFormPdf = async (task: JourneyTaskRow, answers: unknown) => {
      if (task.step_type !== "form" || !client) return;
      const cfg = (task.config ?? {}) as Record<string, unknown>;
      const res = await fileAnswersPdf(svc, {
        clientProfileId: client.id,
        companyName: client.company_name || "Client",
        contactName: client.contact_name,
        stepKey: task.step_key,
        cardTitle: task.label,
        questions: (Array.isArray(cfg.questions) ? cfg.questions : []) as never,
        sections: Array.isArray(cfg.sections) ? (cfg.sections as string[]) : undefined,
        answers: (answers ?? {}) as Record<string, unknown>,
        uploadedBy: user.id,
      });
      if (!res.ok) console.error("onboarding answers PDF failed", task.step_key, res.error);
    };

    // ── journey ────────────────────────────────────────────────────────────
    if (action === "journey") {
      // First sign-in by an actual client completes stage 1 automatically.
      if (!isStaff && !journey.first_signed_in_at && journey.status === "active") {
        await svc
          .from("client_onboarding_journeys")
          .update({ first_signed_in_at: new Date().toISOString() })
          .eq("id", journey.id);
        journey.first_signed_in_at = new Date().toISOString();
        const tasks = await loadTasks();
        for (const t of tasks) {
          if ((t.config as any)?.auto === "first_sign_in" && !t.is_completed) {
            await svc
              .from("client_journey_tasks")
              .update({ is_completed: true, completed_at: new Date().toISOString(), completed_by: user.id })
              .eq("id", t.id);
          }
        }
        await notifyCsm(
          "Client signed in — onboarding started",
          `${client?.company_name || "A client"} created their login and started the onboarding journey.`
        );
      }

      const [tasks, unlocks] = await Promise.all([loadTasks(), loadUnlocks()]);
      const stages = computeStages(journey, tasks, unlocks);

      // Live calendar-connection status so the connect step reflects reality
      // even when the OAuth round-trip happened in another tab. Status only —
      // tokens never leave the server.
      const { data: conn } = await svc
        .from("calendar_connections")
        .select("status, calendar_email, provider")
        .eq("client_profile_id", journey.client_profile_id)
        .maybeSingle();

      return json({
        journey: {
          status: journey.status,
          campaign_live_at: journey.campaign_live_at,
          released_at: journey.released_at ?? null,
          started_at: journey.created_at,
        },
        client: {
          client_profile_id: journey.client_profile_id,
          company_name: client?.company_name,
          contact_name: client?.contact_name,
          email: client?.email,
          phone: client?.phone,
        },
        stages,
        progress_pct: progressPct(stages),
        calendar_connection: conn ? { status: conn.status, calendar_email: conn.calendar_email } : null,
      });
    }

    // All remaining actions mutate → journey must be active, caller must be
    // the client (or staff acting for them).
    if (journey.status !== "active" && action !== "booking_context") {
      return json({ error: "This onboarding journey is not active" }, 409);
    }

    const findTask = async (stepKey: string): Promise<
      { error: Response } | { task: JourneyTaskRow; stage: StageView; stages: StageView[]; tasks: JourneyTaskRow[] }
    > => {
      const tasks = await loadTasks();
      const unlocks = await loadUnlocks();
      const stages = computeStages(journey, tasks, unlocks);
      const task = tasks.find((t) => t.step_key === stepKey);
      if (!task) return { error: json({ error: "Unknown step" }, 404) };
      const stage = stages.find((s) => s.stage_key === task.stage_key)!;
      return { task, stage, stages, tasks };
    };

    // ── save_form_draft ────────────────────────────────────────────────────
    if (action === "save_form_draft") {
      const found = await findTask(String(body.step_key || ""));
      if ("error" in found) return found.error;
      const { task, stage } = found;
      if (task.step_type !== "form") return json({ error: "Not a form step" }, 400);
      if (stage.state === "locked") return json({ error: "That stage is still locked" }, 423);
      await svc
        .from("client_journey_tasks")
        .update({ answers: body.answers ?? {} })
        .eq("id", task.id);
      return json({ saved: true });
    }

    // ── booking_context ────────────────────────────────────────────────────
    if (action === "booking_context") {
      const found = await findTask(String(body.step_key || ""));
      if ("error" in found) return found.error;
      const { task, stage } = found;
      if (task.step_type !== "booking") return json({ error: "Not a booking step" }, 400);
      if (stage.state === "locked") return json({ error: "That stage is still locked" }, 423);
      const slug = String((task.config as any)?.event_slug || "");
      const { data: event } = await svc
        .from("booking_event_types")
        .select("id, name, duration_minutes, is_active, accepting_bookings, lock_timezone")
        .eq("slug", slug)
        .maybeSingle();
      if (!event || !event.is_active) return json({ error: "The onboarding call isn't configured yet — your CSM will be in touch" }, 404);
      const { data: hosts } = await svc
        .from("booking_event_hosts")
        .select("host_user_id")
        .eq("event_type_id", event.id)
        .not("host_user_id", "is", null)
        .order("priority", { ascending: true });
      const hostId = hosts?.[0]?.host_user_id;
      if (!hostId) return json({ error: "No host configured for the onboarding call yet" }, 404);
      return json({
        event_type_id: event.id,
        host_user_id: hostId,
        name: event.name,
        duration_minutes: event.duration_minutes,
        accepting_bookings: event.accepting_bookings !== false,
        lock_timezone: event.lock_timezone ?? null,
      });
    }

    // ── connect_url ────────────────────────────────────────────────────────
    if (action === "connect_url") {
      const { data: existing } = await svc
        .from("calendar_connections")
        .select("id, status, connect_token")
        .eq("client_profile_id", journey.client_profile_id)
        .maybeSingle();
      if (existing?.status === "connected") return json({ already_connected: true });
      let token = existing?.connect_token as string | undefined;
      if (!token) token = crypto.randomUUID().replace(/-/g, "");
      const payload = {
        owner_type: "client",
        client_profile_id: journey.client_profile_id,
        provider: "google",
        status: "invited",
        calendar_email: client?.email ?? null,
        connect_token: token,
        invited_at: new Date().toISOString(),
      };
      if (existing) {
        await svc.from("calendar_connections").update(payload).eq("id", existing.id);
      } else {
        await svc.from("calendar_connections").insert(payload);
      }
      return json({ connect_url: `${APP_ORIGIN}/connect-calendar#ct=${token}` });
    }

    /**
     * Per-type validation shared by complete_step and update_answers. Returns
     * the columns to write on the task row, or an error response.
     */
    const validatePayload = async (
      task: JourneyTaskRow,
    ): Promise<{ patch: Record<string, unknown> } | { error: Response }> => {
      const patch: Record<string, unknown> = {};
      const expectedPrefix = `uploads/${journey.client_profile_id}/`;
      const verifyUpload = async (filePath: string): Promise<boolean> => {
        if (!filePath.startsWith(expectedPrefix)) return false;
        const { data: obj } = await svc.storage.from("client-onboarding-assets").list(
          expectedPrefix.slice(0, -1),
          { search: filePath.split("/").pop() }
        );
        return !!obj && obj.length > 0;
      };
      const collectFiles = async (): Promise<string[] | null> => {
        const raw: unknown[] = Array.isArray(body.file_paths)
          ? body.file_paths
          : body.file_path ? [body.file_path] : [];
        const paths = raw.map((x) => String(x)).filter(Boolean);
        for (const fp of paths) {
          if (!(await verifyUpload(fp))) return null;
        }
        return paths;
      };

      switch (task.step_type) {
        case "form": {
          const answers = (body.answers ?? {}) as Record<string, unknown>;
          // 20 Sep: Enquire-authored form — validate against the LIVE questions
          // (the card rendered those) and refresh the snapshot alongside.
          const enquireSlug = (task.config as any)?.enquire_slug;
          if (typeof enquireSlug === "string" && enquireSlug) {
            const { data: form } = await svc.from("forms").select("published_schema").eq("slug", enquireSlug).eq("status", "live").maybeSingle();
            if (form?.published_schema) {
              const conv = toJourneyQuestions(form.published_schema as FormSchema);
              (task as any).config = { ...(task.config as any), questions: conv.questions, sections: conv.sections };
              patch.config = (task as any).config;
            }
          }
          const questions = ((task.config as any)?.questions ?? []) as Array<{
            key: string; label: string; type?: string; required?: boolean;
          }>;
          const answered = (q: { key: string; type?: string }) => {
            const v = answers[q.key];
            if (v == null) return false;
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === "object") {
              // fullname / address: at least the leading field
              const o = v as Record<string, unknown>;
              return Object.values(o).some((x) => String(x ?? "").trim().length > 0);
            }
            return String(v).trim().length > 0;
          };
          const missing = questions.filter((q) => q.required !== false && !answered(q));
          if (missing.length > 0) {
            return { error: json({ error: `Please answer: ${missing.map((q) => q.label).join(" · ")}`, missing: missing.map((q) => q.key) }, 422) };
          }
          patch.answers = answers;
          break;
        }
        case "text_list": {
          const items = Array.isArray(body.items) ? body.items.map((i: unknown) => String(i).trim()).filter(Boolean) : [];
          const min = Number((task.config as any)?.min_items ?? 1);
          if (items.length < min) return { error: json({ error: `Please add at least ${min} item${min === 1 ? "" : "s"}` }, 422) };
          patch.answers = { items };
          break;
        }
        case "upload": {
          const files = await collectFiles();
          if (!files || files.length === 0) return { error: json({ error: "Upload the file first" }, 422) };
          patch.file_path = files[0];
          patch.answers = { file_paths: files };
          break;
        }
        case "yes_no": {
          // 3 Sep card type: "Do you have X?" Yes → upload and/or list.
          // 11 Sep (Marcus, 8 Sep): every card must receive something, so
          // "No" is refused unless the builder has switched it on for that
          // card (config.allow_no). The pitch deck's "Not yet" (no_requires_
          // upload) never completed the card anyway.
          const cfg = (task.config as any) ?? {};
          const answer = body.answer === "yes" ? "yes" : body.answer === "no" ? "no" : null;
          if (!answer) return { error: json({ error: "Choose yes or no" }, 422) };
          if (answer === "no" && (cfg.no_requires_upload === true || cfg.allow_no !== true)) {
            return { error: json({ error: "Please provide this before continuing" }, 422) };
          }
          if (answer === "no") {
            patch.answers = { answer: "no", note: typeof body.note === "string" ? body.note.slice(0, 500) : "" };
            patch.file_path = null;
            break;
          }
          const mode = String(cfg.on_yes ?? "upload");
          const wantsUpload = mode === "upload" || mode === "upload_or_list";
          const wantsList = mode === "list" || mode === "upload_or_list";
          const files = wantsUpload ? await collectFiles() : [];
          if (files === null) return { error: json({ error: "We couldn't find that upload — try again" }, 422) };
          const items = wantsList && Array.isArray(body.items)
            ? body.items.map((i: unknown) => String(i).trim()).filter(Boolean)
            : [];
          const min = Number(cfg.min_items ?? 1);
          const hasFiles = files.length > 0;
          const hasList = items.length >= min;
          if (mode === "upload" && !hasFiles) return { error: json({ error: "Upload the file first" }, 422) };
          if (mode === "list" && !hasList) return { error: json({ error: `Please add at least ${min} item${min === 1 ? "" : "s"}` }, 422) };
          if (mode === "upload_or_list" && !hasFiles && !hasList) {
            return { error: json({ error: "Upload a file or add at least one entry" }, 422) };
          }
          patch.answers = { answer: "yes", items, file_paths: files, note: typeof body.note === "string" ? body.note.slice(0, 500) : "" };
          patch.file_path = files[0] ?? null;
          break;
        }
        case "booking": {
          const bookingId = String(body.booking_id || "");
          if (!bookingId) return { error: json({ error: "Book a slot first" }, 422) };
          const slug = String((task.config as any)?.event_slug || "");
          const { data: booking } = await svc
            .from("bookings")
            .select("id, status, created_by, starts_at, booking_event_types!inner(slug)")
            .eq("id", bookingId)
            .maybeSingle();
          const bookedSlug = (booking as any)?.booking_event_types?.slug;
          if (!booking || bookedSlug !== slug) return { error: json({ error: "That booking doesn't match the onboarding call" }, 422) };
          if (!["held", "confirmed"].includes(booking.status)) return { error: json({ error: "That booking is no longer active" }, 422) };
          if (!isStaff && booking.created_by !== user.id) return { error: json({ error: "That booking wasn't made from this login" }, 403) };
          patch.booking_id = bookingId;
          break;
        }
        case "calendar_connect": {
          const { data: conn } = await svc
            .from("calendar_connections")
            .select("status")
            .eq("client_profile_id", journey.client_profile_id)
            .maybeSingle();
          if (conn?.status !== "connected") {
            return { error: json({ error: "Your calendar isn't connected yet — use the Connect button first" }, 422) };
          }
          break;
        }
        case "confirm":
        case "read_document":
        case "link":
          break;
        default:
          return { error: json({ error: `Unsupported step type ${task.step_type}` }, 400) };
      }
      return { patch };
    };

    // ── complete_step ──────────────────────────────────────────────────────
    if (action === "complete_step") {
      const found = await findTask(String(body.step_key || ""));
      if ("error" in found) return found.error;
      const { task, stage, stages } = found;
      if (stage.state === "locked") return json({ error: "That stage is still locked" }, 423);
      if (task.is_completed) return json({ completed: true });
      if (stage.stage_key === CAMPAIGN_LIVE_STAGE_KEY) {
        return json({ error: "Campaign live is confirmed by your CSM" }, 403);
      }

      const patch: Record<string, unknown> = {
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      };

      // Explicit decline (Daniel's ruling, 26 Aug): list/upload steps can be
      // answered with "I haven't got one" — recorded, never silently skipped.
      // Only these two types are declinable, and only when the flow allows it.
      const DECLINABLE = ["text_list", "upload"];
      if (body.declined === true) {
        if (!DECLINABLE.includes(task.step_type) || (task.config as any)?.allow_decline === false) {
          return json({ error: "This step can't be skipped" }, 422);
        }
        patch.answers = {
          declined: true,
          reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "",
        };
        await svc.from("client_journey_tasks").update(patch).eq("id", task.id);
        await notifyCsm(
          "Onboarding item declined",
          `${client?.company_name || "A client"} marked "${task.label}" as nothing to add${
            body.reason ? `: ${String(body.reason).slice(0, 140)}` : ""
          }.`
        );
        const afterDecline = computeStages(journey, await loadTasks(), await loadUnlocks());
        return json({ completed: true, declined: true, progress_pct: progressPct(afterDecline) });
      }

      const validated = await validatePayload(task);
      if ("error" in validated) return validated.error;
      Object.assign(patch, validated.patch);

      await svc.from("client_journey_tasks").update(patch).eq("id", task.id);
      await fileFormPdf(task, patch.answers);

      // Milestone notifications for the CSM
      const company = client?.company_name || "A client";
      if (task.step_type === "form") {
        await notifyCsm("Onboarding form submitted", `${company} completed "${task.label}".`);
      } else if (task.step_type === "booking") {
        await notifyCsm("Onboarding call booked", `${company} booked their onboarding call.`);
      } else if (task.step_type === "calendar_connect") {
        await notifyCsm("Calendar connected", `${company} connected their calendar to Vexon OS Bookings.`);
      } else if (task.step_type === "yes_no" && (patch.answers as any)?.answer === "no") {
        await notifyCsm("Onboarding: nothing to share", `${company} answered "no" to "${task.label}".`);
      }

      // If everything client-side is now done, tell the CSM it's launch time.
      const refreshedTasks = await loadTasks();
      const refreshedStages = computeStages(journey, refreshedTasks, await loadUnlocks());
      if (readyForLive(refreshedStages) && !readyForLive(stages)) {
        await notifyCsm(
          "Onboarding complete 🚀",
          `${company} has finished every onboarding card. They can enter their dashboard now; start their campaign when the onboarding call is done.`
        );
      }

      return json({ completed: true, progress_pct: progressPct(refreshedStages) });
    }

    // ── update_answers (edit a completed card in place) ────────────────────
    // ── reopen_step ────────────────────────────────────────────────────────
    // 2 Oct (Marcus): "what if I accidentally clicked mark as complete?" The
    // client puts their own finished card back; answers are kept. Mirrors the
    // CSM's reopen_step in client-onboarding-admin, minus the waiver fields a
    // client never sets. Campaign-live stays the CSM's call.
    if (action === "reopen_step") {
      const found = await findTask(String(body.step_key || ""));
      if ("error" in found) return found.error;
      const { task, stage } = found;
      if (journey.status !== "active") return json({ error: "Your onboarding is complete; ask your Customer Success Manager to reopen a card" }, 409);
      if (stage.stage_key === CAMPAIGN_LIVE_STAGE_KEY) return json({ error: "Campaign live is confirmed by your CSM" }, 403);
      if (!task.is_completed) return json({ reopened: true });
      const { error: rErr } = await svc
        .from("client_journey_tasks")
        .update({ is_completed: false, completed_at: null, completed_by: null })
        .eq("id", task.id);
      if (rErr) return json({ error: rErr.message }, 500);
      return json({ reopened: true });
    }

    if (action === "update_answers") {
      const found = await findTask(String(body.step_key || ""));
      if ("error" in found) return found.error;
      const { task } = found;
      if (!task.is_completed) return json({ error: "Complete the step first" }, 409);
      const EDITABLE = ["form", "yes_no", "text_list", "upload"];
      if (!EDITABLE.includes(task.step_type)) return json({ error: "This step can't be edited" }, 422);
      const validated = await validatePayload(task);
      if ("error" in validated) return validated.error;
      await svc.from("client_journey_tasks").update(validated.patch).eq("id", task.id);
      await fileFormPdf(task, validated.patch.answers);
      await notifyCsm(
        "Onboarding answer updated",
        `${client?.company_name || "A client"} updated "${task.label}".`
      );
      return json({ updated: true });
    }

    // ── go_to_dashboard (client self-release) ──────────────────────────────
    if (action === "go_to_dashboard") {
      if (journey.released_at) return json({ released: true });
      const stages = computeStages(journey, await loadTasks(), await loadUnlocks());
      if (!readyForLive(stages)) return json({ error: "There are still cards to finish" }, 409);
      const now = new Date().toISOString();
      await svc
        .from("client_onboarding_journeys")
        .update({ status: "completed", completed_at: now, released_at: now, released_by: user.id })
        .eq("id", journey.id);
      await svc.from("client_profiles").update({ status: "active" }).eq("id", journey.client_profile_id);
      await notifyCsm(
        "Client entered their dashboard",
        `${client?.company_name || "A client"} finished onboarding and opened their dashboard. Start their campaign from Onboarding → Journeys when the call is done.`
      );
      return json({ released: true });
    }

    return json({ error: `Unknown action ${action}` }, 400);
  } catch (e) {
    console.error("[client-onboarding]", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
