// Client onboarding SANDBOX (3 Sep, R9). The real deck UI driven by an
// in-memory engine over the LIVE flow templates (client_flow_stages /
// client_flow_steps, enabled rows only). Every card is completable from card
// one and nothing is written: form answers live in state (the full pop-out
// works), uploads keep only the filename, the booking card shows Daniel's
// live availability but "Confirm this time" simulates, calendar connect
// simulates, read_document opens the real reader. Confetti, Previous and
// edit all work. "Take me to my dashboard" opens the AE demo portal.
//
// Reached from Dev Center → Client Onboarding → "Run the flow (sandbox)" and
// the CSM Onboarding tab. Roles: admin/dev/ops/csm (App.tsx), mirroring the
// RLS on client_flow_stages/steps so the live flow is actually readable here.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingSchemaError } from "@/lib/migrationGuard";
import type { ClientJourneyData, JourneyStage, JourneyTask } from "@/hooks/useClientJourney";
import { ClientOnboardingView } from "@/pages/client/ClientOnboarding";
import { SandboxHeaderControls, clearIntroGate, forgetIntro } from "@/components/onboarding-deck";

interface FlowStepRow {
  id: string;
  step_key: string;
  label: string;
  description: string | null;
  step_type: string;
  config: Record<string, unknown> | null;
  video_url: string | null;
  document_path: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
}

interface FlowStageRow {
  id: string;
  stage_key: string;
  title: string;
  subtitle: string | null;
  sort_order: number;
  enabled: boolean;
  client_flow_steps: FlowStepRow[];
}

interface CardState {
  done: boolean;
  answers: Record<string, unknown>;
}

/** Roles the client_flow_* RLS (20260826130000) lets read the flow. */
const FLOW_READER_ROLES = ["admin", "dev", "ops", "csm"];

const SANDBOX_CLIENT = {
  client_profile_id: "sandbox",
  company_name: "Sandbox Recruitment Ltd",
  contact_name: "Sam Sandbox",
  email: "sam@sandbox.example",
  phone: "",
};

function useLiveClientFlow() {
  return useQuery({
    queryKey: ["client-flow-sandbox"],
    staleTime: 0,
    queryFn: async (): Promise<{ stages: FlowStageRow[]; migrationPending: boolean }> => {
      const { data, error } = await supabase
        .from("client_flow_stages" as never)
        .select("*, client_flow_steps(*)" as never)
        .order("sort_order" as never);
      if (error) {
        if (isMissingSchemaError(error)) return { stages: [], migrationPending: true };
        throw new Error(error.message);
      }
      const stages = ((data as unknown as FlowStageRow[]) ?? [])
        .filter((s) => s.enabled)
        .map((s) => ({
          ...s,
          client_flow_steps: (s.client_flow_steps ?? []).filter((t) => t.enabled).sort((a, b) => a.sort_order - b.sort_order),
        }))
        .filter((s) => s.client_flow_steps.length > 0);
      return { stages, migrationPending: false };
    },
  });
}

export default function ClientOnboardingSandbox() {
  const navigate = useNavigate();
  const { userRoles } = useAuth();
  const { data, isLoading, error } = useLiveClientFlow();
  const [state, setState] = useState<Record<string, CardState>>({});
  // Bumping the epoch remounts the view so every card's local state resets too.
  const [epoch, setEpoch] = useState(0);

  const journey = useMemo<ClientJourneyData | null>(() => {
    if (!data) return null;
    let firstOpenFound = false;
    let total = 0;
    let done = 0;
    const stages: JourneyStage[] = data.stages.map((s) => {
      const tasks: JourneyTask[] = s.client_flow_steps.map((t) => {
        const st = state[t.step_key];
        total += 1;
        if (st?.done) done += 1;
        return {
          id: t.id,
          step_key: t.step_key,
          label: t.label,
          description: t.description,
          step_type: t.step_type,
          config: t.config ?? {},
          video_url: t.video_url,
          document_path: t.document_path,
          link_url: t.link_url,
          sort_order: t.sort_order,
          is_completed: !!st?.done,
          waived_at: null,
          answers: st?.answers ?? null,
          file_path: null,
          booking_id: typeof st?.answers?.booking_id === "string" ? (st.answers.booking_id as string) : null,
        };
      });
      const complete = tasks.every((t) => t.is_completed);
      let stageState: JourneyStage["state"];
      if (complete) stageState = "complete";
      else if (!firstOpenFound) {
        stageState = "active";
        firstOpenFound = true;
      } else stageState = "locked";
      return { stage_key: s.stage_key, title: s.title, subtitle: s.subtitle, order: s.sort_order, state: stageState, tasks };
    });
    return {
      journey: { status: "active", campaign_live_at: null, released_at: null },
      client: SANDBOX_CLIENT,
      stages,
      progress_pct: total ? Math.round((done / total) * 100) : 0,
      calendar_connection: null,
    };
  }, [data, state]);

  const complete = (stepKey: string, payload: Record<string, unknown>) => {
    setState((s) => ({ ...s, [stepKey]: { done: true, answers: { ...(s[stepKey]?.answers ?? {}), ...payload } } }));
  };
  const update = async (stepKey: string, payload: Record<string, unknown>) => {
    setState((s) => ({ ...s, [stepKey]: { done: true, answers: { ...(s[stepKey]?.answers ?? {}), ...payload } } }));
  };
  // Every card in deck order, for the Reset dialog and for "clear from here".
  const orderedKeys = useMemo(
    () => (data?.stages ?? []).flatMap((s) => s.client_flow_steps.map((t) => t.step_key)),
    [data],
  );
  const cardList = useMemo(
    () => (data?.stages ?? []).flatMap((s) => s.client_flow_steps.map((t) => ({ key: t.step_key, label: t.label, done: !!state[t.step_key]?.done }))),
    [data, state],
  );
  // null = start over; a key = clear that card and everything after it, so
  // the deck lands back on that card with its earlier cards still done.
  const reset = (fromKey: string | null) => {
    if (fromKey === null) {
      setState({});
      clearIntroGate("client-sandbox");
    } else {
      const from = orderedKeys.indexOf(fromKey);
      const cleared = from === -1 ? orderedKeys : orderedKeys.slice(from);
      setState((s) => {
        const next = { ...s };
        for (const k of cleared) delete next[k];
        return next;
      });
      forgetIntro("client-sandbox", cleared);
    }
    setEpoch((e) => e + 1);
  };
  const exit = () => {
    if (window.history.length > 1) navigate(-1);
    else window.close();
  };

  if (isLoading || !journey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6]">
        {error ? (
          <p className="text-sm text-red-500 max-w-md text-center px-5">{(error as Error).message}</p>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        )}
      </div>
    );
  }

  if (data?.migrationPending || (journey.stages ?? []).length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f6] px-5">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold font-heading">Nothing to run yet</h1>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            {data?.migrationPending
              ? "The client flow tables are not there yet. Run 20260826130000_client_onboarding_flow.sql first."
              : userRoles.some((r) => FLOW_READER_ROLES.includes(r))
                ? "The client flow has no enabled stages or steps. Add some in the flow builder, then come back."
                : "Your access can't read the client flow tables, so there is nothing to run. Ask an admin, ops or CSM user to open the sandbox."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClientOnboardingView
      key={epoch}
      data={journey}
      completingStep={null}
      onCompleteStep={complete}
      onUpdateStep={update}
      onOpenPortal={() => navigate("/ae/demo-portal")}
      sandbox
      headerRight={<SandboxHeaderControls cards={cardList} onReset={reset} onExit={exit} exitLabel="Exit" />}
    />
  );
}
