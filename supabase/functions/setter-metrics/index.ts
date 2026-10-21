import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MetricSchema = z.object({
  setter_id: z.string().min(1),
  setter_name: z.string().min(1),
  department: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dials: z.number().int().nonnegative(),
  talk_time_seconds: z.number().int().nonnegative(),
  connects: z.number().int().nonnegative(),
  connect_rate: z.number().nonnegative(),
  connects_3_plus_mins: z.number().int().nonnegative(),
});

const PayloadSchema = z.array(MetricSchema).min(1).max(5000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Bearer auth
  const expected = Deno.env.get("N8N_WEBHOOK_SECRET");
  const auth = req.headers.get("Authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: parsed.error.flatten() }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const rows = parsed.data.map((m) => ({
    close_user_id: m.setter_id,
    setter_name: m.setter_name,
    department: m.department,
    date: m.date,
    dials: m.dials,
    talk_time_seconds: m.talk_time_seconds,
    connects: m.connects,
    connect_rate: m.connect_rate,
    connects_3_plus_mins: m.connects_3_plus_mins,
    updated_at: new Date().toISOString(),
  }));

  // Upsert canonical table
  const { error: upsertError } = await supabase
    .from("setter_close_metrics")
    .upsert(rows, { onConflict: "close_user_id,date" });

  if (upsertError) {
    return new Response(JSON.stringify({ error: upsertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Write-through to legacy `performance` table so existing dashboards reflect new data.
  // Look up setters_profiles by close_user_id to get email + user_id (the keys `performance` uses).
  const closeIds = Array.from(new Set(rows.map((r) => r.close_user_id)));
  const { data: profiles } = await supabase
    .from("setters_profiles")
    .select("user_id, email, close_user_id")
    .in("close_user_id", closeIds);

  const profByClose = new Map(
    (profiles || []).map((p: any) => [p.close_user_id, p]),
  );

  const perfRows: any[] = [];
  for (const r of rows) {
    // AEs (department='sales') live in setter_close_metrics only — the
    // legacy `performance` table stays setter-scoped (~40 read surfaces
    // assume it). Skipping here is normal, not an error.
    if (r.department === "sales") {
      console.log(`[setter-metrics] sales row ${r.close_user_id} ${r.date}: skipped legacy performance write-through`);
      continue;
    }
    const p = profByClose.get(r.close_user_id);
    if (!p?.email || !p?.user_id) continue;
    perfRows.push({
      email: String(p.email).toLowerCase(),
      date: r.date,
      setter_id: p.user_id,
      user_id: p.user_id,
      dials_made: r.dials,
      call_duration_seconds: r.talk_time_seconds,
      // Legacy column is in MINUTES — keep in sync so existing dashboards
      // (SetterLeaderboard, SDRManagerLeaderboard, OperationsLeaderboard, etc.)
      // continue to work without per-component refactors.
      talk_time: Math.round((r.talk_time_seconds || 0) / 60),
      conversations: r.connects,
      updated_at: new Date().toISOString(),
    });
  }

  if (perfRows.length > 0) {
    // performance has a unique constraint on (setter_id, date) per the existing trigger code
    const { error: perfErr } = await supabase
      .from("performance")
      .upsert(perfRows, { onConflict: "setter_id,date" });
    if (perfErr) {
      console.warn("[setter-metrics] performance write-through failed:", perfErr.message);
    }
  }

  return new Response(
    JSON.stringify({ success: true, upserted: rows.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
