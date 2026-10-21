// Shared journey logic for the client onboarding flow.
// Stage locking is enforced HERE (server-side) — the portal UI only renders
// what these helpers say. Clients have no write policies on journey tables;
// every mutation goes through client-onboarding / client-onboarding-admin.

export const ONBOARDING_STAFF_ROLES = ["dev", "admin", "ops", "csm"];

/** Stage 5 has no client steps — it completes when the CSM marks the campaign live. */
export const CAMPAIGN_LIVE_STAGE_KEY = "campaign_live";

export interface JourneyTaskRow {
  id: string;
  journey_id: string;
  stage_key: string;
  stage_title: string;
  stage_subtitle: string | null;
  stage_order: number;
  step_key: string;
  label: string;
  description: string | null;
  step_type: string;
  config: Record<string, unknown>;
  video_url: string | null;
  document_path: string | null;
  link_url: string | null;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  waived_at: string | null;
  waive_note: string | null;
  answers: Record<string, unknown> | null;
  file_path: string | null;
  booking_id: string | null;
}

export interface JourneyRow {
  id: string;
  client_profile_id: string;
  status: string;
  campaign_live_at: string | null;
  first_signed_in_at: string | null;
}

export type StageState = "complete" | "active" | "locked";

export interface StageView {
  stage_key: string;
  title: string;
  subtitle: string | null;
  order: number;
  state: StageState;
  manually_unlocked: boolean;
  tasks: JourneyTaskRow[];
}

const taskDone = (t: JourneyTaskRow) => t.is_completed || t.waived_at != null;

/**
 * Groups tasks into ordered stages and computes locked/active/complete.
 * - a stage is complete when every task is completed-or-waived (campaign_live
 *   completes only via journey.campaign_live_at);
 * - the first incomplete stage is active; later stages are locked unless a
 *   CSM override row unlocks them (then they are active too).
 */
export function computeStages(
  journey: JourneyRow,
  tasks: JourneyTaskRow[],
  unlockedKeys: Set<string>
): StageView[] {
  const byStage = new Map<string, JourneyTaskRow[]>();
  const meta = new Map<string, { title: string; subtitle: string | null; order: number }>();
  for (const t of tasks) {
    const arr = byStage.get(t.stage_key) || [];
    arr.push(t);
    byStage.set(t.stage_key, arr);
    if (!meta.has(t.stage_key)) {
      meta.set(t.stage_key, { title: t.stage_title, subtitle: t.stage_subtitle, order: t.stage_order });
    }
  }
  // 3 Sep: the "Campaign live" stage is no longer synthesised. The client
  // finishes the deck and releases themselves ("Take me to my dashboard");
  // the campaign is the CSM's own switch. Journeys snapshotted before 3 Sep
  // that still carry a campaign_live task row keep their old behaviour below.

  const keys = [...meta.keys()].sort((a, b) => meta.get(a)!.order - meta.get(b)!.order);
  const completeByKey = new Map<string, boolean>();
  for (const key of keys) {
    if (key === CAMPAIGN_LIVE_STAGE_KEY) {
      completeByKey.set(key, journey.campaign_live_at != null);
    } else {
      const list = byStage.get(key) || [];
      completeByKey.set(key, list.length > 0 && list.every(taskDone));
    }
  }

  const views: StageView[] = [];
  let priorAllComplete = true;
  for (const key of keys) {
    const m = meta.get(key)!;
    const complete = completeByKey.get(key)!;
    let state: StageState;
    if (complete) state = "complete";
    else if (priorAllComplete || unlockedKeys.has(key)) state = "active";
    else state = "locked";
    views.push({
      stage_key: key,
      title: m.title,
      subtitle: m.subtitle,
      order: m.order,
      state,
      manually_unlocked: unlockedKeys.has(key) && !complete && !priorAllComplete,
      tasks: (byStage.get(key) || []).sort((a, b) => a.sort_order - b.sort_order),
    });
    priorAllComplete = priorAllComplete && complete;
  }
  return views;
}

/**
 * Whole-journey progress: completed cards over total cards (3 Sep: the deck is
 * one card per step, so task-grain progress is what the rail shows). A stage
 * with no task rows (legacy campaign_live) counts as one card.
 */
export function progressPct(stages: StageView[]): number {
  let total = 0;
  let done = 0;
  for (const s of stages) {
    if (s.tasks.length === 0) {
      total += 1;
      if (s.state === "complete") done += 1;
      continue;
    }
    total += s.tasks.length;
    done += s.tasks.filter(taskDone).length;
  }
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

/** True when every client-side stage (everything except campaign_live) is complete. */
export function readyForLive(stages: StageView[]): boolean {
  return stages
    .filter((s) => s.stage_key !== CAMPAIGN_LIVE_STAGE_KEY)
    .every((s) => s.state === "complete");
}

/** Resolves the client_profile_ids a signed-in user belongs to (junction + legacy). */
export async function clientProfileIdsFor(svc: any, userId: string): Promise<string[]> {
  const [{ data: junction }, { data: legacy }] = await Promise.all([
    svc.from("client_profile_users").select("client_profile_id").eq("user_id", userId),
    svc.from("client_profiles").select("id").eq("user_id", userId),
  ]);
  return [
    ...new Set([
      ...(junction || []).map((r: any) => r.client_profile_id as string),
      ...(legacy || []).map((r: any) => r.id as string),
    ]),
  ];
}
