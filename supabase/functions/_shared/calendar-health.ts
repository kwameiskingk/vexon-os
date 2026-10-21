// Shared by google-calendar.ts and microsoft-calendar.ts (11 Sep). Lives in
// its own module so neither provider file has to import the other.

/**
 * A client's calendar has stopped working (revoked grant, expired refresh
 * token, password change). Mark the connection, and the FIRST time it
 * happens raise it with the CSM and on the client's own portal (Marcus and
 * Daniel, 8 Sep: "it should pop up as a task on their portal, and alert the
 * CSM side"). Repeat failures only refresh last_error, so nobody is spammed.
 */
// deno-lint-ignore no-explicit-any
export async function reportClientCalendarDisconnect(
  supabase: any,
  conn: { id: string; client_profile_id?: string | null; status?: string | null; calendar_email?: string | null },
  reason: string,
): Promise<void> {
  const firstTime = conn.status === "connected";
  await supabase.from("calendar_connections")
    .update({ status: "error", last_error: reason, last_checked_at: new Date().toISOString() })
    .eq("id", conn.id);
  if (!firstTime || !conn.client_profile_id) return;
  const { data: client } = await supabase
    .from("client_profiles")
    .select("id, company_name")
    .eq("id", conn.client_profile_id)
    .maybeSingle();
  const name = client?.company_name || conn.calendar_email || "A client";
  await supabase.from("notifications").insert([
    {
      recipient_id: null,
      recipient_role: "csm",
      title: "Client calendar disconnected",
      message: `${name}'s calendar (${conn.calendar_email || "unknown address"}) is no longer connected. Bookings fall back to working hours only and land on the team calendar until they reconnect. Send them a new connect link from their profile → Bookings.`,
      category: "system",
      link_url: `/csm/clients/${conn.client_profile_id}`,
    },
    {
      recipient_id: null,
      recipient_role: "ops",
      title: "Client calendar disconnected",
      message: `${name}'s calendar is no longer connected. The CSM has been notified.`,
      category: "system",
      link_url: `/admin/clients/${conn.client_profile_id}`,
    },
  ]);
}
