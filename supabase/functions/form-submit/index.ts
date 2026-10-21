// Vexon OS Forms — public submit endpoint (verify_jwt = false in config.toml).
// POST { slug, token, answers, hidden?, partial?, test?, referrer? }
// The server never trusts the client's route: it replays the walk from the
// published schema, recomputes the score, picks the ending, stores the
// response and routes it to the form's sink (marketing_leads / cv_screenings),
// rings the right bell, and fires the optional outbound webhook.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  answersByRef, answersByTitle, computeScore, finalEnding, isAnswered, walkPath,
  type FormSchema, type Question,
} from "../_shared/form-logic.ts";
import { sendResendEmail } from "../_shared/booking-flow.ts";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JAMES_USER_ID = "42292222-46a0-4b2c-85b8-ecf3fca6415b";
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

function validate(q: Question, v: unknown): string | null {
  if (q.type === "statement") return null;
  if (!isAnswered(q, v)) return q.required ? "required" : null;
  const s = Array.isArray(v) ? "" : String(v);
  if (q.type === "email" && !EMAIL_RE.test(s)) return "email";
  if (q.type === "phone" && s.replace(/\D/g, "").length < 8) return "phone";
  if (q.type === "number" && Number.isNaN(Number(s))) return "number";
  if ((q.type === "choice" || q.type === "dropdown" || q.type === "yes_no") && q.choices?.length && !q.choices.some((c) => c.label === s || c.id === s)) return "choice";
  return null;
}

function revenueQualification(byRef: Record<string, string>): "qualified" | "price_qualified" | "unqualified" | null {
  if ((byRef.owner || "").toLowerCase() === "no") return "unqualified";
  const band = byRef.revenue || "";
  if (!band) return null;
  if (band.startsWith("0-300")) {
    const inv = (byRef.invest || "").toLowerCase();
    return inv === "yes" ? "price_qualified" : inv === "no" ? "unqualified" : null;
  }
  return "qualified";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  const slug = clip(body.slug, 80);
  const token = clip(body.token, 80);
  if (!slug || !token) return json({ error: "slug and token required" }, 400);
  if (typeof body.website_url === "string" && body.website_url) return json({ ok: true }); // honeypot

  const { data: form } = await supabase.from("forms").select("*").eq("slug", slug).eq("status", "live").maybeSingle();
  if (!form || !form.published_schema) return json({ error: "Form not found" }, 404);
  const schema = form.published_schema as FormSchema;

  const rawAnswers: Record<string, unknown> = body.answers && typeof body.answers === "object" ? body.answers : {};
  const hidden: Record<string, string> = {};
  for (const k of schema.hidden || []) if (body.hidden && typeof body.hidden[k] === "string") hidden[k] = clip(body.hidden[k], 200);
  const partial = body.partial === true;
  const isTest = body.test === true;

  // Replay: only answers on the visited path count; validate those.
  const path = walkPath(schema, rawAnswers);
  const answers: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const q of path) {
    const v = rawAnswers[q.id];
    if (v !== undefined) answers[q.id] = q.type === "file" ? { path: clip((v as any)?.path, 300), name: clip((v as any)?.name, 200) }
      : (q.type === "full_name" || q.type === "address") ? Object.fromEntries(Object.entries((v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>).map(([k, x]) => [k.slice(0, 30), clip(x, 200)]))
      : Array.isArray(v) ? v.map((x) => clip(x, 500)) : clip(v, q.type === "long_text" ? 4000 : 500);
    if (!partial) { const e = validate(q, answers[q.id]); if (e) errors[q.id] = e; }
  }
  if (!partial && Object.keys(errors).length) return json({ error: "Invalid answers", errors }, 422);

  const ending = partial ? null : finalEnding(schema, answers);
  const score = computeScore(schema, answers, path);
  const byRef = answersByRef(schema, answers);
  const byTitle = answersByTitle(schema, answers);

  const row: any = {
    form_id: form.id, token, answers, hidden,
    ending_id: ending?.id ?? null, outcome: ending?.outcome ?? null,
    score: schema.scoring?.enabled ? score.score : null,
    max_score: schema.scoring?.enabled ? score.max : null,
    score_pct: schema.scoring?.enabled ? score.pct : null,
    is_partial: partial, is_test: isTest,
    completed_at: partial ? null : new Date().toISOString(),
    referrer: clip(body.referrer, 500) || null,
    user_agent: clip(req.headers.get("user-agent"), 300) || null,
  };

  const { data: existing } = await supabase.from("form_responses").select("id, is_partial, marketing_lead_id, cv_screening_id").eq("token", token).maybeSingle();
  let responseId: string;
  if (existing) {
    if (!existing.is_partial && partial) return json({ ok: true, response_id: existing.id }); // never downgrade
    const { error } = await supabase.from("form_responses").update(row).eq("id", existing.id);
    if (error) return json({ error: error.message }, 500);
    responseId = existing.id;
  } else {
    const { data, error } = await supabase.from("form_responses").insert(row).select("id").single();
    if (error) return json({ error: error.message }, 500);
    responseId = data.id;
  }

  // Sinks + bells only on a completed, non-test response.
  const links: any = {};
  if (!partial && !isTest) {
    try {
      if (form.sink === "marketing_leads") {
        const qual = revenueQualification(byRef);
        const lead = {
          source: "website", typeform_response_token: `form:${token}`,
          name: byRef.name || null, company_name: byRef.company || null,
          email: byRef.email || null, phone: byRef.phone || null,
          revenue_band: byRef.revenue || null, qualification: qual, outcome: "no_meeting",
          is_partial: false, raw: { form: form.slug, answers: byTitle, hidden, outcome: ending?.outcome },
          submitted_at: new Date().toISOString(),
        };
        const { data: ml } = existing?.marketing_lead_id
          ? await supabase.from("marketing_leads").update(lead).eq("id", existing.marketing_lead_id).select("id").single()
          : await supabase.from("marketing_leads").insert(lead).select("id").single();
        if (ml) links.marketing_lead_id = ml.id;
        if (byRef.name || byRef.email) {
          const who = byRef.name || byRef.email;
          const qualLabel = qual === "qualified" ? "Qualified" : qual === "price_qualified" ? "Price qualified" : qual === "unqualified" ? "Unqualified" : "Incomplete";
          await supabase.from("notifications").insert({
            recipient_id: JAMES_USER_ID, recipient_role: "setter",
            title: `🎯 New lead from the website: ${who}`,
            message: `${who}${byRef.company ? ` (${byRef.company})` : ""} · ${qualLabel}`,
            category: "system", link_url: "/marketing/leads", triggered_by: null,
          });
        }
      } else if (form.sink === "cv_screenings") {
        const first = byRef.first_name || (byRef.name || "").split(" ")[0] || "";
        const last = byRef.last_name || (byRef.name || "").split(" ").slice(1).join(" ") || "";
        const full = `${first} ${last}`.trim() || byRef.email || "Applicant";
        const rejected = ending?.outcome === "rejected";
        const below = score.pct !== null && score.pct < (schema.scoring?.threshold_pct ?? 0);
        // cv_screenings has check constraints: bucket REJECT <=> reject_reason set, and
        // reject_reason / ingested_via come from fixed lists (extended 19 Sep for forms).
        const cvPath = (answers[schema.questions.find((q) => q.type === "file")?.id ?? ""] as any)?.path || null;
        const screening = {
          full_name: full, first_name: first || null, last_name: last || null,
          email: byRef.email || null, phone: byRef.phone || null,
          current_title: byRef.current_title || null, current_company: byRef.current_company || null,
          linkedin_url: byRef.linkedin_url || null,
          typeform_answers: { ...byTitle, ...(score.pct !== null ? { Score: `${score.pct}%` } : {}), ...(cvPath ? { CV: cvPath } : {}) },
          score: score.pct, source: "typeform",
          bucket: rejected || below ? "REJECT" : "SHORTLIST",
          review_status: rejected || below ? null : "to_call",
          reject_reason: rejected ? "form_knockout" : below ? "below_threshold" : null,
          screened_on: new Date().toISOString().slice(0, 10),
          ingested_via: "form", source_file: form.slug, source_file_slug: `form-${form.slug}-${token}`,
          flags: ["source:typeform", `form_outcome:${ending?.outcome ?? "submitted"}`, ...(score.pct !== null && score.pct < (schema.scoring?.threshold_pct ?? 0) ? ["below_threshold"] : [])],
        };
        const { data: cs, error: csErr } = existing?.cv_screening_id
          ? await supabase.from("cv_screenings").update(screening).eq("id", existing.cv_screening_id).select("id").single()
          : await supabase.from("cv_screenings").insert(screening).select("id").single();
        if (csErr) console.error("[FORMS] cv_screenings write failed", csErr);
        if (cs) links.cv_screening_id = cs.id;
        if (!rejected && !below) {
          await supabase.from("notifications").insert({
            recipient_id: null, recipient_role: form.notify_role || "ops",
            title: `📝 New SDR application: ${full}`,
            message: `${full}${score.pct !== null ? ` · scored ${score.pct}%` : ""}${score.pct !== null && score.pct < (schema.scoring?.threshold_pct ?? 0) ? " (below threshold)" : ""}`,
            category: "system", link_url: "/ops-command/talent-acquisition", triggered_by: null,
          });
        }
      } else if (form.notify_role) {
        await supabase.from("notifications").insert({
          recipient_id: null, recipient_role: form.notify_role,
          title: `📝 New response: ${form.name}`, message: byRef.name || byRef.email || "Open Forms to read it.",
          category: "system", link_url: `/admin/forms/${form.id}/responses`, triggered_by: null,
        });
      }
      if (Object.keys(links).length) await supabase.from("form_responses").update(links).eq("id", responseId);
    } catch (e) {
      console.error("[FORMS] sink failed", e);
    }
    // 20 Sep: an email per completed response (Typeform "notifications").
    const emails: string[] = Array.isArray(form.notify_emails) ? form.notify_emails.filter((e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    if (emails.length) {
      const who = byRef.name || byRef.your_name || `${byRef.first_name ?? ""} ${byRef.last_name ?? ""}`.trim() || byRef.email || "Someone";
      const rowsHtml = Object.entries(byTitle).map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#5d5975;font-size:12px;vertical-align:top;width:40%">${esc(k)}</td><td style="padding:6px 0;font-size:13px;white-space:pre-wrap">${esc(v)}</td></tr>`).join("");
      const html = `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:Inter,Arial,sans-serif;color:#0f0f11;"><div style="max-width:640px;margin:0 auto;padding:28px 20px;"><div style="background:#fff;border:1px solid #e3e3e6;border-radius:14px;padding:26px;">
        <h1 style="font-size:18px;margin:0 0 6px;">New response: ${esc(form.name)}</h1>
        <p style="margin:0 0 14px;color:#5d5975;font-size:13px;">${esc(who)}${score.pct !== null ? ` · scored ${score.pct}%` : ""}${ending?.outcome ? ` · ${esc(ending.outcome.replace(/_/g, " "))}` : ""}</p>
        <table style="border-collapse:collapse;width:100%">${rowsHtml}</table>
        <p style="margin:18px 0 0;"><a href="https://vexon-os.example/admin/forms/${form.id}/responses" style="display:inline-block;background:#3d5a80;color:#fff;text-decoration:none;border-radius:999px;padding:9px 20px;font-weight:700;font-size:13px;">Open in Enquire</a></p>
      </div><p style="text-align:center;color:#8b87a3;font-size:11px;margin-top:18px;">Meridian · Enquire</p></div></body></html>`;
      const text = `New response: ${form.name}\n${who}${score.pct !== null ? ` · ${score.pct}%` : ""}\n\n${Object.entries(byTitle).map(([k, v]) => `${k}\n${v}`).join("\n\n")}\n\nhttps://vexon-os.example/admin/forms/${form.id}/responses`;
      for (const to of emails) sendResendEmail(to, `New response: ${form.name} (${who})`, html, text).catch((e) => console.error("[FORMS] notify email failed", e));
    }
    if (form.webhook_url && /^https:\/\//.test(form.webhook_url)) {
      fetch(form.webhook_url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form: form.slug, response_id: responseId, token, submitted_at: row.completed_at, outcome: ending?.outcome, score_pct: score.pct, answers: byRef, answers_by_title: byTitle, hidden }),
      }).catch((e) => console.error("[FORMS] webhook failed", e));
    }
  }

  // Booking endings hand the prospect straight to the lite widget, prefilled.
  const prefill = ending?.kind === "booking"
    ? { name: byRef.name || `${byRef.first_name || ""} ${byRef.last_name || ""}`.trim(), email: byRef.email || "", phone: byRef.phone || "", company: byRef.company || byRef.current_company || "" }
    : null;

  return json({ ok: true, response_id: responseId, ending, score_pct: score.pct, prefill });
});
