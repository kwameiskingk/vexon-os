// Monthly Performance Review — narrative layer (setter scope).
//
// Mirrors the sdr-call-review-agent pattern (direct Anthropic API, async job
// via EdgeRuntime.waitUntil, realtime-watched result row), hardened for
// reliability (fix/review-compile-reliability):
//  - The Anthropic call retries with exponential backoff + jitter on 429 /
//    529 / 5xx / network errors / timeouts (4 attempts, 90s cap per
//    attempt); the brief is only marked 'failed' after retries are
//    exhausted, with a human-readable reason in the error column.
//  - "Job accepted" (2xx) is decoupled from "narrative finished" (realtime
//    brief update): once the brief row exists the handler returns 2xx, and
//    any model error afterwards lands in the brief row, never as a non-2xx
//    on the generate call.
//  - Every synchronous accept-path step (auth, role check, review fetch,
//    scope check, brief insert) gets short retries to absorb transient
//    sub-service hiccups, and the whole handler is wrapped so every
//    response is structured JSON.
//
// The client compiles compiled_metrics BEFORE invoking this function.
// Claude receives ONLY those finished figures — never formulas, never raw
// tables — and must not emit any number that is not present in the input.
//
// verify_jwt stays TRUE (no config.toml override) + in-code role gate:
// admin/dev/ops in full; sdr_manager scoped to genuine fulfilment setters.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const NARRATIVE_MODEL = "claude-opus-4-5";

const ANTHROPIC_MAX_ATTEMPTS = 4;
const ANTHROPIC_TIMEOUT_MS = 90_000;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Short retry wrapper for accept-path steps (transient sub-service blips). */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(300 * 2 ** i);
    }
  }
  throw new Error(`${label}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

// ── Per-role narrative prompts (Batch A, 2026-07-28) ────────────────────────
// Parallel to the reviewThemes registry on the frontend: one prompt per role,
// selected by performance_reviews.role. The setter prompt is byte-identical
// to the pre-registry NARRATIVE_SYSTEM. A role with no prompt is rejected
// BEFORE the brief row is created (400), so briefs never dangle.

const SETTER_NARRATIVE_SYSTEM = `You are writing the narrative layer of a monthly performance review for an appointment setter at a recruitment agency. A manager will read this out during a review conversation.

You are an interpreter, NOT a calculator:
- Use ONLY the figures provided in the input JSON. Do not compute, derive, extrapolate, or estimate any number. Never state a number that does not appear verbatim in the input.
- Percentage changes vs the prior period and gaps vs target are already provided as deltas — quote them, do not recalculate them.
- If an area has no data in the input (a module is absent), do not mention that area at all.
- Ground "likely_why" in the coaching and PIP context provided, phrased as a hypothesis ("this may reflect…"), never as a certainty.

WRITING STYLE — STRICTLY ENFORCED:
- Plain English. Short, complete sentences. No jargon, no abbreviations the setter wouldn't use.
- Refer to the setter by their first name.
- Every strength and gap must name the specific metric and its figure from the input.
- Do not invent context (no assumed conversations, market conditions, or events).

Reply with ONLY valid JSON in exactly this shape:
{
  "strengths": ["..."],
  "gaps_vs_target": ["..."],
  "what_moved": { "summary": "...", "likely_why": "..." },
  "focus_areas": ["..."]
}
At most 4 strengths, 4 gaps_vs_target, 4 focus_areas. what_moved.summary is one tight paragraph on the biggest changes vs the prior period, using only the provided deltas. focus_areas are forward-looking, concrete behaviours for next month.`;

const AE_NARRATIVE_SYSTEM = `You are writing the narrative layer of a monthly performance review for an Account Executive (a closer) at a recruitment agency. A manager will read this out during a review conversation.

You are an interpreter, NOT a calculator:
- Use ONLY the figures provided in the input JSON. Do not compute, derive, extrapolate, or estimate any number. Never state a number that does not appear verbatim in the input.
- Percentage changes vs the prior period and gaps vs target are already provided as deltas — quote them, do not recalculate them.
- If an area has no data in the input (a module is absent), do not mention that area at all.
- Some metrics carry a null actual with a "pending" note (e.g. cold calls, re-engaged meetings, Close telemetry not yet linked). These are NOT zero performance — describe them as "not yet tracked", never as a shortfall, never as a zero.
- All money figures are GBP — write them with £, never $.
- Ground "likely_why" in any coaching context provided, phrased as a hypothesis ("this may reflect…"), never as a certainty.

WRITING STYLE — STRICTLY ENFORCED:
- Plain English. Short, complete sentences. No jargon.
- Refer to the Account Executive by their first name.
- Every strength and gap must name the specific metric and its figure from the input.
- Do not invent context (no assumed conversations, market conditions, or events).

Reply with ONLY valid JSON in exactly this shape:
{
  "strengths": ["..."],
  "gaps_vs_target": ["..."],
  "what_moved": { "summary": "...", "likely_why": "..." },
  "focus_areas": ["..."]
}
At most 4 strengths, 4 gaps_vs_target, 4 focus_areas. what_moved.summary is one tight paragraph on the biggest changes vs the prior period, using only the provided deltas. focus_areas are forward-looking, concrete behaviours for next month.`;

const SDR_MANAGER_NARRATIVE_SYSTEM = `You are writing the narrative layer of a monthly performance review for an SDR Manager at a recruitment agency. A senior leader will read this out during a review conversation.

The input JSON contains TWO DISTINCT GROUPS and you must keep them separate at all times:
- "personal" — the manager's own delivery (e.g. coaching sessions they personally ran).
- "team" — the combined performance of the setters they manage.
NEVER attribute a team number to the manager personally, and NEVER present a personal number as a team result. Every strength, gap and focus area must make clear whether it is about personal delivery or team performance (e.g. "Team: …" / "Personal: …").

You are an interpreter, NOT a calculator:
- Use ONLY the figures provided in the input JSON. Do not compute, derive, extrapolate, or estimate any number. Never state a number that does not appear verbatim in the input.
- Percentage changes vs the prior period and gaps vs target are already provided as deltas — quote them, do not recalculate them.
- If an area has no data in the input (a module is absent), do not mention that area at all.
- Ground "likely_why" in any context provided, phrased as a hypothesis ("this may reflect…"), never as a certainty.

WRITING STYLE — STRICTLY ENFORCED:
- Plain English. Short, complete sentences. No jargon.
- Refer to the manager by their first name.
- Every strength and gap must name the specific metric and its figure from the input, prefixed "Personal:" or "Team:".
- Do not invent context (no assumed conversations, market conditions, or events).

Reply with ONLY valid JSON in exactly this shape:
{
  "strengths": ["..."],
  "gaps_vs_target": ["..."],
  "what_moved": { "summary": "...", "likely_why": "..." },
  "focus_areas": ["..."]
}
At most 4 strengths, 4 gaps_vs_target, 4 focus_areas — covering BOTH groups where the data supports it. what_moved.summary is one tight paragraph on the biggest changes vs the prior period, using only the provided deltas. focus_areas are forward-looking, concrete behaviours for next month, each tagged "Personal:" or "Team:".`;

const NARRATIVE_PROMPTS: Record<string, string> = {
  setter: SETTER_NARRATIVE_SYSTEM,
  account_executive: AE_NARRATIVE_SYSTEM,
  sdr_manager: SDR_MANAGER_NARRATIVE_SYSTEM,
};

interface AnthropicAttemptError extends Error {
  retryable: boolean;
}

function attemptError(message: string, retryable: boolean): AnthropicAttemptError {
  const e = new Error(message) as AnthropicAttemptError;
  e.retryable = retryable;
  return e;
}

async function callAnthropicOnce(system: string, user: string, maxTokens: number): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw attemptError("ANTHROPIC_API_KEY not configured", false);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: NARRATIVE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (e) {
    // Network failure or timeout — transient by nature.
    const reason = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "network error";
    throw attemptError(`Anthropic request ${reason}`, true);
  }

  if (!res.ok) {
    if (res.status === 429) throw attemptError("Anthropic rate limited (429)", true);
    if (res.status === 529) throw attemptError("Anthropic overloaded (529)", true);
    if (res.status >= 500) throw attemptError(`Anthropic server error (${res.status})`, true);
    const t = await res.text();
    throw attemptError(`Anthropic ${NARRATIVE_MODEL} ${res.status}: ${t.slice(0, 300)}`, false);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") throw attemptError("Anthropic: no text in response", true);
  return text;
}

/** 4 attempts, exponential backoff + jitter on retryable failures only. */
async function callAnthropicWithRetry(system: string, user: string, maxTokens: number): Promise<string> {
  let lastMessage = "unknown error";
  for (let attempt = 1; attempt <= ANTHROPIC_MAX_ATTEMPTS; attempt++) {
    try {
      return await callAnthropicOnce(system, user, maxTokens);
    } catch (e) {
      const err = e as AnthropicAttemptError;
      lastMessage = err.message;
      if (!err.retryable) throw new Error(lastMessage);
      console.warn(`[performance-review-compile] attempt ${attempt}/${ANTHROPIC_MAX_ATTEMPTS} failed: ${lastMessage}`);
      if (attempt < ANTHROPIC_MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400));
      }
    }
  }
  throw new Error(
    `Narrative generation failed after ${ANTHROPIC_MAX_ATTEMPTS} attempts (last: ${lastMessage}). The numbers are unaffected — regenerate to retry.`,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "POST only" }, 405);

  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) return jsonResp({ error: "Missing bearer token" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userRes = await withRetry("auth", () =>
      supabase.auth.getUser(auth.replace(/^bearer\s+/i, "")),
    );
    const userId = userRes.data.user?.id;
    if (!userId) return jsonResp({ error: "Invalid token" }, 401);

    // Write parity with the performance_reviews RLS: admin/dev/ops in full,
    // plus sdr_manager scoped to genuine fulfilment setters (verified below
    // against the reviewee's ACTUAL role + department, never a row field).
    const { data: roles } = await withRetry("roles", () =>
      supabase.from("user_roles").select("role").eq("user_id", userId),
    );
    const userRoles = new Set((roles || []).map((r: { role: string }) => r.role));
    // 7 Oct: Ops Command holders (Daniel covering Elena) review like ops,
    // matching the "Ops Command manages performance reviews" policy.
    const { data: opsCap } = await supabase.rpc("has_capability", { _user_id: userId, _cap: "can_view_ops_command" });
    const unscopedStaff = opsCap === true || ["admin", "dev", "ops"].some((r) => userRoles.has(r));
    const isScopedManager = !unscopedStaff && userRoles.has("sdr_manager");
    if (!unscopedStaff && !isScopedManager) return jsonResp({ error: "Forbidden" }, 403);

    let body: { review_id?: string };
    try { body = await req.json(); } catch { return jsonResp({ error: "Invalid JSON" }, 400); }
    const reviewId = body?.review_id;
    if (!reviewId) return jsonResp({ error: "Missing review_id" }, 400);

    const { data: review, error: reviewErr } = await withRetry("review fetch", () =>
      supabase
        .from("performance_reviews")
        .select("id, reviewee_user_id, role, department, period_start, period_end, compiled_metrics, status")
        .eq("id", reviewId)
        .maybeSingle(),
    );
    if (reviewErr || !review) return jsonResp({ error: "Review not found" }, 404);
    if (!review.compiled_metrics || Object.keys(review.compiled_metrics).length === 0) {
      return jsonResp({ error: "Review has no compiled_metrics" }, 400);
    }

    // Role → narrative prompt. Rejected before the brief insert so an
    // unregistered role never leaves a dangling 'generating' brief.
    const narrativeSystem = NARRATIVE_PROMPTS[String(review.role)];
    if (!narrativeSystem) {
      return jsonResp({ error: `No narrative prompt registered for role "${review.role}"` }, 400);
    }

    // sdr_manager-scoped generation covers two reviewee shapes (mirroring
    // the RLS): genuine setters in the manager's own departments, and —
    // when the manager runs acquisition — genuine AEs. sdr_manager reviews
    // of other sdr_managers remain unscoped-staff-only. Neither check gates
    // on setters_profiles.active: former staff stay reviewable (leaver
    // visibility, 2026-08-11).

    if (isScopedManager) {
      if (review.reviewee_user_id === userId) return jsonResp({ error: "Forbidden" }, 403);
      const [{ data: revProfile }, { data: revRoles }, { data: mgrAssignments }] = await withRetry(
        "scope check",
        () =>
          Promise.all([
            supabase
              .from("setters_profiles")
              .select("department, is_test_account")
              .eq("user_id", review.reviewee_user_id)
              .maybeSingle(),
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", review.reviewee_user_id)
              .in("role", ["setter", "account_executive"]),
            supabase
              .from("sdr_manager_assignments")
              .select("department")
              .eq("manager_user_id", userId),
          ]),
      );
      const managerDepartments = new Set(
        (mgrAssignments || []).map((r: { department: string | null }) => r.department).filter(Boolean),
      );
      const revRoleSet = new Set((revRoles || []).map((r: { role: string }) => r.role));
      // Setter path: genuine setter in one of the manager's departments
      // (mirrors is_genuine_setter_in_departments + sdr_manager_departments).
      const genuineSetterScoped =
        !!revProfile &&
        !!revProfile.department &&
        managerDepartments.has(revProfile.department) &&
        revProfile.is_test_account !== true &&
        revRoleSet.has("setter");
      // AE path: manager runs acquisition, reviewee is a genuine AE
      // (mirrors sdr_manager_manages_aes + is_genuine_ae).
      const genuineAEScoped =
        review.role === "account_executive" &&
        managerDepartments.has("acquisition") &&
        !!revProfile &&
        revProfile.department === "sales" &&
        revProfile.is_test_account !== true &&
        revRoleSet.has("account_executive");
      if (!genuineSetterScoped && !genuineAEScoped) return jsonResp({ error: "Forbidden" }, 403);
    }

    const { data: brief, error: insertErr } = await withRetry("brief insert", () =>
      supabase
        .from("performance_review_briefs")
        .insert({ review_id: reviewId, status: "generating", model: NARRATIVE_MODEL })
        .select()
        .single(),
    );
    if (insertErr || !brief) {
      return jsonResp({ error: `Could not create brief: ${insertErr?.message}` }, 500);
    }
    await supabase.from("performance_reviews").update({ status: "generating" }).eq("id", reviewId);

    // ── JOB ACCEPTED. Everything below is async; failures land in the
    //    brief row (realtime), never as a non-2xx on this call. ──
    const runJob = async () => {
      const finishBrief = async (patch: Record<string, unknown>) => {
        await supabase
          .from("performance_review_briefs")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", brief.id);
      };

      try {
        const userPrompt = `Compiled monthly review input (the ONLY source of figures):

${JSON.stringify(review.compiled_metrics, null, 2)}`;

        const text = await callAnthropicWithRetry(narrativeSystem, userPrompt, 2048);
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("Model returned no JSON object");
        const parsed = JSON.parse(m[0]);
        for (const k of ["strengths", "gaps_vs_target", "what_moved", "focus_areas"]) {
          if (!(k in parsed)) throw new Error(`Model output missing "${k}"`);
        }

        await finishBrief({ status: "complete", brief: parsed, error: null });
        await supabase.from("performance_reviews").update({ status: "complete" }).eq("id", reviewId);
      } catch (e) {
        console.error("[performance-review-compile] job error", e);
        await finishBrief({ status: "failed", error: e instanceof Error ? e.message : "Unknown error" });
        await supabase.from("performance_reviews").update({ status: "failed" }).eq("id", reviewId);
      }
    };

    // @ts-ignore EdgeRuntime
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runJob());
    } else {
      runJob();
    }

    return jsonResp({ review_id: reviewId, brief_id: brief.id, status: "generating" });
  } catch (e) {
    // Never let the handler die without structured JSON.
    console.error("[performance-review-compile] accept-path error", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
