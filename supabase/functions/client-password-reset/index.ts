// PUBLIC forgot-password endpoint (the product had none anywhere).
//
// Takes { email }, and — whether or not an account exists — returns the same
// generic success, so it can't be used to probe which emails have accounts.
// When the account exists, a one-shot recovery link is mailed via Resend
// (branded, lands on the existing /welcome set-password page; the token rides
// the URL fragment so it never reaches server logs).
//
// Registered with verify_jwt=false — anyone locked out is by definition not
// signed in. Per-isolate cooldown keeps trivial loops from hammering Resend;
// the generic response is the real defence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendResendEmail } from "../_shared/booking-flow.ts";
import { passwordResetEmailHtml } from "../_shared/client-onboarding-emails.ts";

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
const GENERIC = { ok: true, message: "If that email has an account, a reset link is on its way." };

const lastSent = new Map<string, number>();
const COOLDOWN_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await req.json().catch(() => ({}));
    if (typeof email !== "string" || !email.includes("@")) return json(GENERIC);
    const target = email.trim().toLowerCase();

    const prev = lastSent.get(target);
    if (prev && Date.now() - prev < COOLDOWN_MS) return json(GENERIC);
    lastSent.set(target, Date.now());

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // generateLink errors when no user exists — swallow into the generic reply.
    const { data: linkData, error } = await svc.auth.admin.generateLink({
      type: "recovery",
      email: target,
    });
    if (error || !linkData?.properties?.hashed_token) return json(GENERIC);

    const resetUrl =
      `${APP_ORIGIN}/welcome#token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&email=${encodeURIComponent(target)}`;
    await sendResendEmail(
      target,
      "Reset your Vexon OS password",
      passwordResetEmailHtml({ resetUrl })
    );

    return json(GENERIC);
  } catch {
    return json(GENERIC);
  }
});
