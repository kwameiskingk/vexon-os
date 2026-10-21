// Dev Center module for the client onboarding flow: author the flow, track
// journeys, and — the bit the owner asked for by name — a TEST tab that creates a
// fake client and runs the whole trigger chain without any impersonation.

import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FlowBuilder } from "@/components/client-onboarding/FlowBuilder";
import { JourneysPanel } from "@/components/client-onboarding/JourneysPanel";
import { useJourneyAdminAction, useJourneysOverview } from "@/hooks/useClientOnboardingAdmin";

type Tab = "flow" | "journeys" | "test";

export function ClientOnboardingModule() {
  const [tab, setTab] = useState<Tab>("flow");
  const tabs: { id: Tab; label: string }[] = [
    { id: "flow", label: "Flow builder" },
    { id: "journeys", label: "Journeys" },
    { id: "test", label: "Test" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? "dc-btn dc-btn-primary" : "dc-btn"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "flow" && <FlowBuilder />}
      {tab === "journeys" && <JourneysPanel />}
      {tab === "test" && <TestTab />}
    </div>
  );
}

function TestTab() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("Sample Client Ltd");
  const act = useJourneyAdminAction();
  const { data } = useJourneysOverview();
  const testJourneys = (data?.journeys ?? []).filter((j) => j.is_test);

  const create = async () => {
    try {
      await act.mutateAsync({ action: "create_test_client", email, company_name: company });
      toast.success("Test client created — it's now in Journeys with a 'Confirm paid' button");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the test client");
    }
  };

  return (
    <div className="dc-surface p-4 space-y-4 max-w-xl">
      {/* The instant path (3 Sep sandbox, replacing the 2 Sep fixture
          preview): the real deck over the LIVE flow templates, driven by an
          in-memory engine. Uploads keep filenames only, the booking card
          shows live availability but confirming simulates. The harness below
          stays for testing the actual pipes (welcome email, login, bookings). */}
      <div className="flex items-center justify-between gap-3 rounded border border-[var(--dc-border)] px-3 py-2.5">
        <span className="text-sm">
          Run the <b>real</b> deck on the live flow, every card completable, nothing saved.
          Finishing opens the demo portal:
        </span>
        <a className="dc-btn dc-btn-primary shrink-0" href="/client/onboarding/sandbox" target="_blank" rel="noreferrer">
          Run the flow (sandbox) ↗
        </a>
      </div>
      <p className="text-sm flex items-start gap-2">
        <FlaskConical className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Full-pipes test</b> (only when you need the real emails/login/bookings):
          creates a fake client (flagged <span className="dc-mono">is_test_account</span> — never counted
          in CEO tiles or client health) and starts its journey exactly as a signed contract would.
          Use an inbox you control: <b>Confirm paid</b> in the Journeys tab sends the real welcome
          email there, then you walk the whole flow as the client. Delete cleans up everything,
          including the login and any demo bookings on the CSM's calendar.
        </span>
      </p>
      <div className="space-y-2">
        <label className="dc-label">Your test inbox</label>
        <input
          className="dc-input w-full"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="dc-label">Company name</label>
        <input
          className="dc-input w-full"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>
      <button
        className="dc-btn dc-btn-primary"
        disabled={!email.includes("@") || act.isPending}
        onClick={create}
      >
        {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create test client & start journey"}
      </button>

      {testJourneys.length > 0 && (
        <div className="pt-2 border-t border-[var(--dc-border)] space-y-1">
          <p className="dc-label">Live test clients</p>
          {testJourneys.map((j) => (
            <p key={j.client_profile_id} className="text-xs dc-mono">
              {j.company_name} · {j.status} · {j.progress_pct}% — manage in the Journeys tab
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
