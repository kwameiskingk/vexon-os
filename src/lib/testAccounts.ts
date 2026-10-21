import { supabase } from "@/integrations/supabase/client";

/**
 * Test/demo setter exclusion for RAW-MEETINGS surfaces.
 *
 * Roster-keyed boards already hide test accounts (active + is_test_account
 * filters, setters_profiles_safe, is_valid_active_setter_profile). But any
 * surface that queries `meetings` (or `performance`) directly by department
 * and date has no setter gate at all, so a demo setter's seeded meetings
 * would appear in shared lists and inflate shared aggregates. These helpers
 * are that missing gate: fetch the test-account identifiers once, then drop
 * their rows before render/aggregation.
 *
 * meetings rows key the setter inconsistently across eras (setter_id has
 * held both auth user ids and setter profile ids; setter_profile_id and
 * logged_by_setter_id are newer) — so every column is checked against every
 * identifier set.
 */

export interface TestSetterIds {
  profileIds: Set<string>;
  userIds: Set<string>;
  emails: Set<string>;
  closeUserIds: Set<string>;
}

export const EMPTY_TEST_SETTER_IDS: TestSetterIds = {
  profileIds: new Set(),
  userIds: new Set(),
  emails: new Set(),
  closeUserIds: new Set(),
};

export async function fetchTestSetterIds(): Promise<TestSetterIds> {
  const { data, error } = await supabase
    .from("setters_profiles")
    .select("id, user_id, email, close_user_id")
    .eq("is_test_account", true);
  // Fail open to "no exclusions" rather than blanking a page: a transient
  // error here must never hide real meetings.
  if (error) return EMPTY_TEST_SETTER_IDS;
  const profileIds = new Set<string>();
  const userIds = new Set<string>();
  const emails = new Set<string>();
  const closeUserIds = new Set<string>();
  (data || []).forEach(
    (s: { id: string; user_id: string | null; email: string | null; close_user_id: string | null }) => {
      profileIds.add(String(s.id));
      if (s.user_id) userIds.add(String(s.user_id));
      if (s.email) emails.add(s.email.toLowerCase());
      if (s.close_user_id) closeUserIds.add(String(s.close_user_id));
    },
  );
  return { profileIds, userIds, emails, closeUserIds };
}

interface MeetingSetterKeys {
  setter_id?: string | null;
  setter_profile_id?: string | null;
  logged_by_setter_id?: string | null;
}

const inAnySet = (v: string | null | undefined, t: TestSetterIds) =>
  v != null && (t.profileIds.has(String(v)) || t.userIds.has(String(v)));

export const isTestSetterMeeting = (m: MeetingSetterKeys, t: TestSetterIds): boolean =>
  inAnySet(m.setter_id, t) || inAnySet(m.setter_profile_id, t) || inAnySet(m.logged_by_setter_id, t);

export const isTestSetterEmail = (email: string | null | undefined, t: TestSetterIds): boolean =>
  email != null && t.emails.has(email.toLowerCase());

/**
 * Ids of every meeting logged by/for a test setter — for surfaces that key
 * off meeting_scores.appointment_id rather than the meeting row itself.
 */
export async function fetchTestMeetingIds(pre?: TestSetterIds): Promise<Set<string>> {
  const t = pre ?? (await fetchTestSetterIds());
  const list = Array.from(new Set([...t.profileIds, ...t.userIds]));
  if (list.length === 0) return new Set();
  const inList = `(${list.join(",")})`;
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .or(
      `setter_profile_id.in.${inList},setter_id.in.${inList},logged_by_setter_id.in.${inList}`,
    );
  if (error) return new Set(); // fail open — never hide real scores
  return new Set((data || []).map((m: { id: string }) => String(m.id)));
}
