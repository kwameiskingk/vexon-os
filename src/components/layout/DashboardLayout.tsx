import { CSSProperties, ReactNode, useMemo } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useClientJourneyGate } from "@/hooks/useClientJourney";
import { AppSidebar } from "./AppSidebar";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { TaskCenter } from "@/components/tasks/TaskCenter";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { useDepartment } from "@/contexts/DepartmentContext";
import { TeamBulletinTicker } from "./TeamBulletinTicker";
import { useEmbeddedLayout } from "@/contexts/EmbeddedLayoutContext";
import { pageTitleForPath } from "./navConfig";

import { StartOfDayModal } from "@/components/forms/StartOfDayModal";
import { EODModal } from "@/components/forms/EODModal";
import { HourlyUpdateModal } from "@/components/forms/HourlyUpdateModal";
import { ConfirmTodaysMeetingsModal } from "@/components/meetings/ConfirmTodaysMeetingsModal";
import { useDialingReminder } from "@/hooks/useDialingReminder";
import { ACTING_LABELS, isDemoActingRole } from "@/lib/actingAs";
import { DEPARTMENT_THEMES, departmentStyleVars, resolveDepartmentKey } from "@/lib/departmentTheme";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "admin" | "setter" | "client" | "partner";
  showWorkspaceSelector?: boolean;
}

// Sidebar width from the approved shell (spec section 4).
const SIDEBAR_STYLE = { "--sidebar-width": "236px" } as CSSProperties;

export const DashboardLayout = ({
  children,
  role,
  showWorkspaceSelector = false
}: DashboardLayoutProps) => {
  const { selectedDepartment } = useDepartment();
  const { actingAs, setActingAs } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useDialingReminder();
  const embedded = useEmbeddedLayout();
  // The shell stamps the department so its switcher dot wears the department
  // colour. Nothing else recolours (src/lib/departmentTheme.ts).
  const deptKey = resolveDepartmentKey(location.pathname, selectedDepartment, role);
  const deptStyle = useMemo(() => departmentStyleVars(deptKey) as CSSProperties, [deptKey]);
  const deptLabel = DEPARTMENT_THEMES[deptKey].label;
  const pageTitle = useMemo(() => pageTitleForPath(location.pathname), [location.pathname]);
  // A client whose onboarding journey is still in progress lives on the
  // journey page — the rest of the portal opens when the campaign is live.
  const { data: journeyActive } = useClientJourneyGate(role === "client");
  if (embedded) {
    return <>{children}</>;
  }
  if (role === "client" && journeyActive) {
    return <Navigate to="/client/onboarding" replace />;
  }

  // Clients and partners get none of the internal chrome (workspace selector,
  // task center, SOD/EOD compliance modals)
  const isExternalPortal = role === "client" || role === "partner";

  const shouldShowWorkspaceSelector = showWorkspaceSelector &&
    selectedDepartment === 'sales' &&
    !isExternalPortal;

  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      <div className="min-h-screen flex w-full" data-dept={deptKey} style={deptStyle}>
        <AppSidebar role={role} />
        <div className="flex-1 flex flex-col min-w-0 rr-shell-main">
          <header className="rr-topbar">
            <div className="rr-topbar-left">
              {/* Mobile hamburger trigger */}
              <SidebarTrigger className="md:hidden" />
              {/* Breadcrumb: Department / Page */}
              <nav className="rr-crumb" aria-label="Breadcrumb">
                {deptLabel}
                <span aria-hidden>/</span>
                <b>{pageTitle}</b>
              </nav>
              {/* Acting-as chip (2 Sep, extended 3 Sep): always-visible
                  reminder of which hat is on, with a one-click way back to
                  being the admin. Demo hats (setter, client) say so, because
                  nothing on those screens is real. actingAs is admin/dev-only
                  by construction. */}
              {actingAs && (
                <div className="rr-acting">
                  <span>
                    Acting as {ACTING_LABELS[actingAs]}
                    {isDemoActingRole(actingAs) && <em> · demo data</em>}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActingAs(null);
                      navigate("/admin");
                    }}
                    className="rr-acting-btn"
                  >
                    Switch back to Admin
                  </button>
                </div>
              )}
            </div>

            <div className="rr-topbar-right">
              {shouldShowWorkspaceSelector && <WorkspaceSelector />}
              {!isExternalPortal && (
                <span className="rr-top-ic">
                  <TaskCenter />
                </span>
              )}
              <span className="rr-top-ic">
                <NotificationCenter />
              </span>
            </div>
          </header>

          {role === "setter" && <TeamBulletinTicker />}

          <main className="flex-1 overflow-auto">
            <div className="rr-page space-y-6">
              {children}
            </div>
          </main>

          {!isExternalPortal && (
            <>

              <StartOfDayModal />
              <EODModal />
              <HourlyUpdateModal />
              {role === "setter" && <ConfirmTodaysMeetingsModal />}
            </>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};
