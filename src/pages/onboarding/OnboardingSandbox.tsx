// SDR onboarding SANDBOX (3 Sep, R9). The real starter deck driven by an
// in-memory engine over the LIVE flow (onboarding_step_templates, enabled
// rows; the code template if the table is empty or missing, exactly like
// seeding). Every card is completable from card one and nothing is written:
// no tasks, no uploads (filenames only), no release. "Take me to my
// dashboard" opens the setter demo lens.
//
// Deliberately a SIBLING route (/onboarding/sandbox): the real /onboarding
// is an isOnboardingSurface that bounces any non-contained account.
// Reached from Dev Center → Onboarding Flow → "Run the flow (sandbox)" and
// the TA tracking header. Roles: admin/dev/ops/hr plus the
// can_screen_candidates capability (App.tsx), mirroring the RLS on
// onboarding_step_templates so the live flow is actually readable here.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOnboardingFlowDetailed } from "@/hooks/useOnboardingFlow";
import { onboardingTemplate, stepsFromTemplate, type ResolvedStep } from "@/lib/onboardingSteps";
import { SdrOnboardingView } from "@/pages/onboarding/OnboardingHome";
import { SandboxHeaderControls, clearIntroGate, forgetIntro } from "@/components/onboarding-deck";
import type { SdrCompletePayload } from "@/components/onboarding-deck/SdrSteps";

interface DoneState {
  answer?: string;
  proofPath?: string;
}

export default function OnboardingSandbox() {
  const navigate = useNavigate();
  const { user, userRoles } = useAuth();
  const [done, setDone] = useState<Record<string, DoneState>>({});
  const [epoch, setEpoch] = useState(0);
  // Day one is released by Elena in the live flow; here a button on the
  // section-end screen stands in for her.
  const [dayOneReleased, setDayOneReleased] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-flow-sandbox"],
    staleTime: 0,
    queryFn: async () => {
      const live = await fetchOnboardingFlowDetailed();
      return {
        steps: stepsFromTemplate(live.steps ?? onboardingTemplate(null)),
        fromBuilder: live.steps !== null,
        migrationPending: live.migrationPending,
      };
    },
  });

  const steps: ResolvedStep[] = useMemo(
    () =>
      (data?.steps ?? []).map((s) => {
        const d = done[s.key];
        return d ? { ...s, done: true, answer: d.answer ?? null, proofPath: d.proofPath ?? null } : s;
      }),
    [data, done],
  );

  const complete = (step: ResolvedStep, payload?: SdrCompletePayload) => {
    setDone((d) => ({ ...d, [step.key]: { answer: payload?.answer, proofPath: payload?.proofPath } }));
  };
  const cardList = useMemo(() => steps.map((s) => ({ key: s.key, label: s.label, done: s.done })), [steps]);
  // null = start over; a key = clear that card and everything after it.
  const reset = (fromKey: string | null) => {
    if (fromKey === null) {
      setDone({});
      setDayOneReleased(false);
      clearIntroGate("sdr-sandbox");
    } else {
      const from = steps.findIndex((s) => s.key === fromKey);
      const cleared = (from === -1 ? steps : steps.slice(from)).map((s) => s.key);
      setDone((d) => {
        const next = { ...d };
        for (const k of cleared) delete next[k];
        return next;
      });
      forgetIntro("sdr-sandbox", cleared);
    }
    setEpoch((e) => e + 1);
  };
  const exit = () => {
    if (window.history.length > 1) navigate(-1);
    else window.close();
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <SdrOnboardingView
      key={epoch}
      steps={steps}
      firstName="Sam"
      startDate={nextMondayIso()}
      completingTaskId={null}
      onComplete={complete}
      onUpdate={async (step, payload) => complete(step, payload)}
      released
      dayOneReleased={dayOneReleased}
      onSimulateRelease={() => setDayOneReleased(true)}
      onFinish={() => navigate("/setter/demo")}
      headerLabel={`New starter onboarding${fallbackReason(data, userRoles)}`}
      headerRight={<SandboxHeaderControls cards={cardList} onReset={reset} onExit={exit} exitLabel="Exit" />}
      sandbox
      userId={user?.id ?? null}
    />
  );
}

/**
 * Why the deck is on the code fallback, worded so an empty read is not
 * mistaken for an empty builder. Roles that can read onboarding_step_templates
 * (2026-08-18 builder migration): admin/dev/ops/hr; capability holders also
 * can, but we cannot see capabilities here, so they get the neutral wording.
 */
const TEMPLATE_READER_ROLES = ["admin", "dev", "ops", "hr"];
function fallbackReason(
  data: { fromBuilder: boolean; migrationPending: boolean },
  userRoles: string[],
): string {
  if (data.fromBuilder) return "";
  if (data.migrationPending) return " · built-in flow (builder table not created yet)";
  if (userRoles.some((r) => TEMPLATE_READER_ROLES.includes(r))) return " · built-in flow (builder has no enabled steps)";
  return " · built-in flow (your access can't read the builder table)";
}

/** A believable start date for the countdown chip: next Monday. */
function nextMondayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const add = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}
