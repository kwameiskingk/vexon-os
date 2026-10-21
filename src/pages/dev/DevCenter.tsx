// Dev Centre (regrouped 15 Oct 2026, the owner's rulings): three groups.
//   Build: what we build and bill for (Overview, Build log, Mandate until the
//          build log replaces it, Tickets).
//   Tools I maintain: Kronos, Enquire, Client onboarding flow, SDR onboarding
//          flow, Trialist access, Payslip generator, Invoice generator.
//   Platform: Users & access, Impersonate, Settings, Integrations, Broadcast,
//          Health, Audit.
// Gone: Targets (retired metrics targets), Releases (an unread changelog).
// Module ids are stable because MandateModule opens "projects" by event.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/dev-console.css";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3, Ticket, UserCog, Settings as SettingsIcon, Zap, ClipboardList,
  Radio, ArrowLeft, FolderKanban, Target, VenetianMask,
  ListChecks, CalendarClock, Handshake, FlaskConical, MessageSquareText, Plug, Receipt, FileText,
} from "lucide-react";
import { MandateModule } from "@/components/dev/MandateModule";
import { MissionControl } from "@/components/dev/MissionControl";
import { TicketsConsole } from "@/components/dev/TicketsConsole";
import { BuildLogModule } from "@/components/dev/BuildLogModule";
import { ReportsModule } from "@/components/dev/ReportsModule";
import { UserAccessConsole } from "@/components/dev/UserAccessConsole";
import { ImpersonationModule } from "@/components/dev/ImpersonationModule";
import { SystemDefaultsModule } from "@/components/dev/SystemDefaultsModule";
import { EdgeFunctionsModule } from "@/components/dev/EdgeFunctionsModule";
import { AuditModule } from "@/components/dev/AuditModule";
import { BroadcastModule } from "@/components/dev/BroadcastModule";
import { OnboardingFlowModule } from "@/components/dev/OnboardingFlowModule";
import { BookingsModule } from "@/components/dev/BookingsModule";
import { ClientOnboardingModule } from "@/components/dev/ClientOnboardingModule";
import { TrialistAccessModule } from "@/components/dev/TrialistAccessModule";
import { EnquireModule } from "@/components/dev/EnquireModule";
import { IntegrationsModule } from "@/components/dev/IntegrationsModule";
import { PayslipStudio } from "@/components/payslips/PayslipStudio";
import { InvoicesWorkspace } from "@/components/invoices/InvoicesWorkspace";
import logoWhite from "@/assets/vexon-logo-white.svg";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import { useTheme } from "next-themes";

type Module = { id: string; label: string; icon: LucideIcon; comp: React.ComponentType };
type Group = { label: string; items: Module[] };

const InvoicesModule = () => <InvoicesWorkspace canIssue showHeader={false} />;

const GROUPS: Group[] = [
  {
    label: "Build",
    items: [
      { id: "mission", label: "Overview", icon: Activity, comp: MissionControl },
      { id: "projects", label: "Build log", icon: FolderKanban, comp: BuildLogModule },
      { id: "reports", label: "Reports", icon: BarChart3, comp: ReportsModule },
      { id: "mandate", label: "Mandate", icon: Target, comp: MandateModule },
      { id: "tickets", label: "Tickets", icon: Ticket, comp: TicketsConsole },
    ],
  },
  {
    label: "Tools I maintain",
    items: [
      { id: "bookings", label: "Kronos", icon: CalendarClock, comp: BookingsModule },
      { id: "enquire", label: "Enquire", icon: MessageSquareText, comp: EnquireModule },
      { id: "client-onboarding", label: "Client onboarding flow", icon: Handshake, comp: ClientOnboardingModule },
      { id: "onboarding-flow", label: "SDR onboarding flow", icon: ListChecks, comp: OnboardingFlowModule },
      { id: "trialists", label: "Trialist access", icon: FlaskConical, comp: TrialistAccessModule },
      { id: "payslips", label: "Payslip generator", icon: Receipt, comp: PayslipStudio },
      { id: "invoices", label: "Invoice generator", icon: FileText, comp: InvoicesModule },
    ],
  },
  {
    label: "Platform",
    items: [
      { id: "access", label: "Users & access", icon: UserCog, comp: UserAccessConsole },
      { id: "impersonate", label: "Impersonate", icon: VenetianMask, comp: ImpersonationModule },
      { id: "system", label: "Settings", icon: SettingsIcon, comp: SystemDefaultsModule },
      { id: "integrations", label: "Integrations", icon: Plug, comp: IntegrationsModule },
      { id: "broadcast", label: "Broadcast", icon: Radio, comp: BroadcastModule },
      { id: "edge", label: "Health", icon: Zap, comp: EdgeFunctionsModule },
      { id: "audit", label: "Audit", icon: ClipboardList, comp: AuditModule },
    ],
  },
];
const MODULES: Module[] = GROUPS.flatMap((g) => g.items);

export default function DevCenter() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const [active, setActive] = useState("mission");
  const current = MODULES.find((m) => m.id === active) ?? MODULES[0];
  const Module = current.comp;
  const group = GROUPS.find((g) => g.items.some((m) => m.id === current.id))?.label ?? "";

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ module?: string }>).detail;
      if (detail?.module && MODULES.some((m) => m.id === detail.module)) setActive(detail.module);
    };
    window.addEventListener("dev-center:open", handler);
    return () => window.removeEventListener("dev-center:open", handler);
  }, []);

  return (
    <div className="dev-console">
      <div className="flex">
        {/* Side rail */}
        <aside className="dc-rail w-60 min-h-screen p-3 pl-4 sticky top-0 self-start">
          <div className="mb-5 px-2 pt-2">
            <img
              src={resolvedTheme === "light" ? logoGradient : logoWhite}
              alt="Vexon OS"
              className="h-[18px] w-auto object-contain mb-3"
            />
            <p className="dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-text-dim)]">Dev Centre</p>
          </div>
          <button onClick={() => navigate("/admin")} className="dc-rail-btn mb-4">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Vexon OS</span>
          </button>
          <nav className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <p className="dc-mono mb-1 px-2 text-[10px] uppercase tracking-[0.12em] text-[var(--dc-text-dim)]">{g.label}</p>
                <div className="space-y-[2px]">
                  {g.items.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setActive(m.id)}
                      className={`dc-rail-btn ${active === m.id ? "active" : ""}`}
                    >
                      <m.icon className="h-4 w-4" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-6">
          <div className="mb-5">
            <p className="dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-text-dim)]">{group}</p>
            <h1 className="mt-1 font-head text-[24px] font-medium tracking-[-0.02em] text-[var(--dc-text)]">{current.label}</h1>
          </div>
          <Module />
        </main>
      </div>
    </div>
  );
}
