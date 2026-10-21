// supabase/functions/compile-payroll-cycle/index.ts
// Compiles the pay run for the period [period_start .. period_end] into
// invoice_submissions. Three line types:
//   setter — base + per-meeting bonus × sats + tiered bonus (meetings SSOT)
//   ae     — base (ae_compensation) + cash collected × commission %
//            (identical maths/rows to AECommissions.tsx — must never diverge)
//   staff  — flat base salary from profiles.base_salary (Employee Hub governed)
// One person = one line: setter pass wins over AE, AE over staff.
// Approved/paid rows are FROZEN — re-compiles never touch them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIERED_BONUSES = [
  { threshold: 50, amount: 500 },
  { threshold: 30, amount: 250 },
  { threshold: 25, amount: 175 },
  { threshold: 20, amount: 100 },
  { threshold: 15, amount: 50 },
];

function tieredBonus(sats: number) {
  for (const t of TIERED_BONUSES) if (sats >= t.threshold) return t;
  return { threshold: null as number | null, amount: 0 };
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Commission cycle: 26th of previous month → 25th of current month
// (mirrors src/utils/commissionCycle.ts — Deno cannot import frontend files).
function commissionCycleDefault(ref: Date): { start: string; end: string } {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  if (ref.getDate() >= 26) {
    return { start: fmtDate(new Date(year, month, 26)), end: fmtDate(new Date(year, month + 1, 25)) };
  }
  return { start: fmtDate(new Date(year, month - 1, 26)), end: fmtDate(new Date(year, month, 25)) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Identify the calling user (admin only)
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Service-role client for the heavy lifting
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Role check
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    const allowed = ["admin", "dev", "finance", "accounting", "ops", "ops_assistant"].some((r) => roleSet.has(r));
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const cycleDefault = commissionCycleDefault(new Date());
    const period_start: string = body.period_start ?? cycleDefault.start;
    const period_end: string = body.period_end ?? cycleDefault.end;
    const departments: string[] = Array.isArray(body.departments) && body.departments.length > 0
      ? body.departments
      : (body.department ? [body.department] : ["acquisition", "fulfilment"]);

    // 0. FREEZE RULE — load existing rows for this period. Approved/paid rows
    //    are never rewritten: figures, bonuses and status all stay exactly
    //    as the reviewer left them.
    const { data: existingRows, error: exErr } = await admin
      .from("invoice_submissions")
      .select("id, user_id, setter_profile_id, line_type, status")
      .eq("period_start", period_start)
      .eq("period_end", period_end);
    if (exErr) throw exErr;
    const frozen = (existingRows || []).filter((r: any) => ["approved", "paid"].includes(r.status));
    const frozenProfileIds = new Set(frozen.map((r: any) => r.setter_profile_id).filter(Boolean));
    const frozenUserIds = new Set(frozen.map((r: any) => r.user_id).filter(Boolean));
    const existingNonSetterByUser = new Map(
      (existingRows || [])
        .filter((r: any) => !r.setter_profile_id)
        .map((r: any) => [r.user_id, r])
    );

    const nowIso = new Date().toISOString();
    // Users who already have a line this run (or a frozen one) — the
    // one-person-one-line rule. Setter path wins over AE, AE over staff.
    const linedUserIds = new Set<string>();

    // ===== SETTER PASS =====================================================

    // 1. Load all active, non-test setters across the requested departments
    const { data: setters, error: setErr } = await admin
      .from("setters_profiles")
      .select("id, user_id, email, full_name, department, active, is_test_account, per_meeting_bonus, base_salary, currency")
      .in("department", departments)
      .eq("active", true);
    if (setErr) throw setErr;

    const eligible = (setters || []).filter((s: any) => !s.is_test_account && s.email);
    // Everyone on the setter path is "lined" even if frozen — the staff/AE
    // passes must not create a second line for them.
    for (const s of eligible) if (s.user_id) linedUserIds.add(s.user_id);

    // 2. Load all SAT meetings in window from the meetings table (SSOT).
    //    Rebooks are excluded from invoicing per project rules.
    const setterIds = eligible.map((s: any) => s.id);
    const satByProfile = new Map<string, { count: number; ids: string[] }>();
    if (setterIds.length > 0) {
      const { data: mtgs, error: mErr } = await admin
        .from("meetings")
        .select("id, setter_profile_id, meeting_date, attendance_status, is_rebook")
        .in("setter_profile_id", setterIds)
        .eq("attendance_status", "sat")
        .gte("meeting_date", period_start)
        .lte("meeting_date", period_end);
      if (mErr) throw mErr;
      for (const m of mtgs || []) {
        if (m.is_rebook) continue;
        const key = m.setter_profile_id as string;
        const entry = satByProfile.get(key) || { count: 0, ids: [] };
        entry.count += 1;
        entry.ids.push(m.id);
        satByProfile.set(key, entry);
      }
    }

    // 3. Build setter rows (skipping frozen ones)
    const setterRows: any[] = [];
    let frozenCount = 0;

    for (const s of eligible) {
      if (frozenProfileIds.has(s.id) || (s.user_id && frozenUserIds.has(s.user_id))) {
        frozenCount += 1;
        continue;
      }
      const bucket = satByProfile.get(s.id) || { count: 0, ids: [] };
      const sats = bucket.count;
      const base = Number(s.base_salary) || 0;
      const perMtg = Number(s.per_meeting_bonus) || 0;
      const currency = (s.currency as string) || "USD";
      const commission = sats * perMtg;
      const tb = tieredBonus(sats);
      const grand = base + commission + tb.amount; // bonuses/deductions added later by reviewer

      setterRows.push({
        setter_profile_id: s.id,
        user_id: s.user_id,
        line_type: "setter",
        period_start,
        period_end,
        meetings_count: sats,
        sat_meetings_count: sats,
        per_meeting_bonus: perMtg,
        base_salary: base,
        currency,
        sat_source: "meetings",
        tiered_bonus_amount: tb.amount,
        tiered_bonus_tier: tb.threshold,
        custom_bonuses: [],
        deductions: [],
        deductions_total: 0,
        total_commission: commission + tb.amount, // legacy field kept in sync
        grand_total: grand,
        meeting_ids: bucket.ids,
        status: "compiled",
        cycle_compiled_at: nowIso,
        compiled_by: userId,
        department: s.department,
        submitted_at: nowIso,
      });
    }

    // Upsert on (setter_profile_id, period_start, period_end)
    if (setterRows.length > 0) {
      const { error: upErr } = await admin
        .from("invoice_submissions")
        .upsert(setterRows, { onConflict: "setter_profile_id,period_start,period_end" });
      if (upErr) throw upErr;

      // Notify each setter that their invoice was just compiled.
      const notifs = setterRows
        .filter((r) => r.user_id)
        .map((r) => ({
          recipient_id: r.user_id,
          recipient_role: "setter",
          title: "Your invoice has been compiled",
          message: `Your ${period_start} – ${period_end} invoice is ready (${r.sat_meetings_count} sat meeting${r.sat_meetings_count === 1 ? "" : "s"}, total ${r.currency} ${Number(r.grand_total).toFixed(2)}).`,
          category: "system" as const,
          link_url: "/setter/invoice-submissions",
          triggered_by: userId,
        }));
      if (notifs.length > 0) {
        const { error: notifErr } = await admin.from("notifications").insert(notifs);
        if (notifErr) console.error("[compile-payroll-cycle] notification insert failed", notifErr);
      }
    }

    // ===== AE PASS =========================================================
    // Same rows and maths as AECommissions.tsx: cash = Σ ae_deal_payments in
    // period (inclusive), commission = cash × commission_percentage / 100,
    // base from ae_compensation. Currency: GBP (no currency column exists).

    const { data: aeComps } = await admin
      .from("ae_compensation")
      .select("user_id, base_salary, commission_percentage");
    const { data: aeRoleRows } = await admin
      .from("user_roles").select("user_id").eq("role", "account_executive");
    const aeRoleSet = new Set((aeRoleRows || []).map((r: any) => r.user_id));

    const aeCandidates = (aeComps || []).filter(
      (c: any) => c.user_id && aeRoleSet.has(c.user_id) && !linedUserIds.has(c.user_id)
    );

    const cashByAe = new Map<string, number>();
    if (aeCandidates.length > 0) {
      const { data: pays, error: payErr } = await admin
        .from("ae_deal_payments")
        .select("ae_user_id, amount")
        .in("ae_user_id", aeCandidates.map((c: any) => c.user_id))
        .gte("paid_on", period_start)
        .lte("paid_on", period_end);
      if (payErr) throw payErr;
      for (const p of pays || []) {
        cashByAe.set(p.ae_user_id, (cashByAe.get(p.ae_user_id) || 0) + (Number(p.amount) || 0));
      }
    }

    const nonSetterRows: any[] = [];
    for (const c of aeCandidates) {
      linedUserIds.add(c.user_id);
      if (frozenUserIds.has(c.user_id)) {
        frozenCount += 1;
        continue;
      }
      const base = Number(c.base_salary) || 0;
      const pct = Number(c.commission_percentage) || 0;
      const cash = cashByAe.get(c.user_id) || 0;
      const commission = (cash * pct) / 100;

      nonSetterRows.push({
        setter_profile_id: null,
        user_id: c.user_id,
        line_type: "ae",
        period_start,
        period_end,
        meetings_count: 0,
        sat_meetings_count: 0,
        per_meeting_bonus: 0,
        base_salary: base,
        currency: "GBP",
        cash_collected: cash,
        commission_percentage: pct,
        tiered_bonus_amount: 0,
        tiered_bonus_tier: null,
        custom_bonuses: [],
        deductions: [],
        deductions_total: 0,
        total_commission: commission,
        grand_total: base + commission,
        meeting_ids: [],
        status: "compiled",
        cycle_compiled_at: nowIso,
        compiled_by: userId,
        department: "ae",
        submitted_at: nowIso,
      });
    }

    // ===== STAFF PASS ======================================================
    // Flat base-salary lines for everyone else with a salary set in the
    // Employee Hub (profiles.base_salary > 0) and an internal (non-client)
    // role, who isn't already on the setter or AE path.

    const { data: staffProfiles } = await admin
      .from("profiles")
      .select("id, full_name, email, base_salary")
      .gt("base_salary", 0);
    const { data: allRoleRows } = await admin
      .from("user_roles").select("user_id, role");
    const internalUserIds = new Set(
      (allRoleRows || []).filter((r: any) => r.role !== "client").map((r: any) => r.user_id)
    );

    for (const p of staffProfiles || []) {
      if (!p.id || linedUserIds.has(p.id) || !internalUserIds.has(p.id)) continue;
      linedUserIds.add(p.id);
      if (frozenUserIds.has(p.id)) {
        frozenCount += 1;
        continue;
      }
      const base = Number(p.base_salary) || 0;
      nonSetterRows.push({
        setter_profile_id: null,
        user_id: p.id,
        line_type: "staff",
        period_start,
        period_end,
        meetings_count: 0,
        sat_meetings_count: 0,
        per_meeting_bonus: 0,
        base_salary: base,
        currency: "GBP",
        tiered_bonus_amount: 0,
        tiered_bonus_tier: null,
        custom_bonuses: [],
        deductions: [],
        deductions_total: 0,
        total_commission: 0,
        grand_total: base,
        meeting_ids: [],
        status: "compiled",
        cycle_compiled_at: nowIso,
        compiled_by: userId,
        department: "staff",
        submitted_at: nowIso,
      });
    }

    // Write AE/staff rows: update existing (non-frozen) rows by id, insert new.
    // (PostgREST upsert can't target the partial unique index, so merge manually;
    // the index remains as a duplicate backstop.)
    const toInsert: any[] = [];
    for (const row of nonSetterRows) {
      const existing = existingNonSetterByUser.get(row.user_id);
      if (existing) {
        const { error: updErr } = await admin
          .from("invoice_submissions")
          .update(row)
          .eq("id", (existing as any).id);
        if (updErr) throw updErr;
      } else {
        toInsert.push(row);
      }
    }
    if (toInsert.length > 0) {
      const { error: insErr } = await admin.from("invoice_submissions").insert(toInsert);
      if (insErr) throw insErr;
    }

    // ===== PAYROLL CYCLE SUMMARIES ========================================
    // Aggregate from the rows as stored (including frozen ones) so the
    // summary always matches the table. Upsert — no more duplicate rows.
    const { data: finalRows, error: finErr } = await admin
      .from("invoice_submissions")
      .select("department, currency, grand_total")
      .eq("period_start", period_start)
      .eq("period_end", period_end);
    if (finErr) throw finErr;

    const byDept = new Map<string, { totals: Record<string, number>; count: number }>();
    for (const r of finalRows || []) {
      const dep = (r.department as string) || "unknown";
      const cur = (r.currency as string) || "USD";
      const entry = byDept.get(dep) || { totals: {}, count: 0 };
      entry.totals[cur] = (entry.totals[cur] || 0) + Number(r.grand_total || 0);
      entry.count += 1;
      byDept.set(dep, entry);
    }

    const cycles: any[] = [];
    for (const [dep, entry] of byDept) {
      const { data: cycle, error: cyErr } = await admin
        .from("payroll_cycles")
        .upsert({
          period_start, period_end, department: dep,
          closed_by: userId,
          closed_at: nowIso,
          grand_total_by_currency: entry.totals,
          setter_count: entry.count,
        }, { onConflict: "department,period_start,period_end" })
        .select()
        .single();
      if (cyErr) throw cyErr;
      cycles.push(cycle);
    }

    const totalsByCurrency: Record<string, number> = {};
    for (const r of finalRows || []) {
      const cur = (r.currency as string) || "USD";
      totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + Number(r.grand_total || 0);
    }

    return new Response(JSON.stringify({
      success: true,
      cycle: cycles[0] ?? null,
      compiled_count: setterRows.length + nonSetterRows.length,
      frozen_count: frozenCount,
      totals_by_currency: totalsByCurrency,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("compile-payroll-cycle error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
