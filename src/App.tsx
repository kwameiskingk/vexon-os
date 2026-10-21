import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./contexts/AuthContext";
import { DepartmentProvider } from "./contexts/DepartmentContext";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { SystemBroadcastBanner } from "./components/SystemBroadcastBanner";
import { ImpersonationBanner } from "./components/ImpersonationBanner";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { ForcePasswordChangeGate } from "./components/auth/ForcePasswordChangeGate";

// Direct imports — no lazy loading, instant navigation
import Index from "./pages/Index";
import ClientAuth from "./pages/ClientAuth";
import PartnerAuth from "./pages/PartnerAuth";
import NotFound from "./pages/NotFound";
import BookingPage from "./pages/public/BookingPage";
import BookingConfirmPage from "./pages/public/BookingConfirmPage";
import FulfilmentHubPage from "./pages/public/FulfilmentHubPage";
import ConnectCalendarPage from "./pages/public/ConnectCalendarPage";
import WelcomePage from "./pages/public/WelcomePage";
import PrivacyPage from "./pages/public/PrivacyPage";
import BookingsHomePage from "./pages/public/BookingsHomePage";

// Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminClients from "./pages/admin/AdminClients";
import ClientProfile from "./pages/admin/ClientProfile";
import CampaignManager from "./pages/admin/CampaignManager";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminMeetings from "./pages/admin/AdminMeetings";
import AdminLeads from "./pages/admin/AdminLeads";
import AdminSetters from "./pages/admin/AdminSetters";
import AdminResources from "./pages/admin/AdminResources";
import AdminSettings from "./pages/admin/AdminSettings";

// Operations
// OperationsOverview merged into OperationsDashboard — kept import removed
import OperationsDashboard from "./pages/admin/operations/Dashboard";
import OperationsClients from "./pages/admin/operations/Clients";
import OperationsResources from "./pages/admin/operations/Resources";
import OperationsObjectionsReport from "./pages/admin/operations/ObjectionsReport";
import OperationsOnboarding from "./pages/admin/operations/Onboarding";
import OperationsOffboarding from "./pages/admin/operations/Offboarding";
import OperationsWarmLeads from "./pages/admin/operations/WarmLeads";
import OperationsHourlyFeedback from "./pages/admin/operations/HourlyFeedback";

// Acquisition
import AcquisitionMeetings from "./pages/admin/acquisition/AcquisitionMeetings";
import SalesTools from "./pages/admin/acquisition/SalesTools";
import AcquisitionMetrics from "./pages/admin/acquisition/Metrics";

// Accounting
import AccountingOverview from "./pages/admin/accounting/Overview";
import AccountingPayments from "./pages/admin/accounting/Payments";
import AccountingInvoices from "./pages/admin/accounting/Invoices";
import AccountingCashflow from "./pages/admin/accounting/Cashflow";
import InvoiceSubmissions from "./pages/admin/accounting/InvoiceSubmissions";
import AccountingCosts from "./pages/admin/accounting/Costs";
import AccountingTemplates from "./pages/admin/accounting/Templates";

// HR
import HROverview from "./pages/admin/hr/Overview";
import HRAttendance from "./pages/admin/hr/Attendance";
import HRHiring from "./pages/admin/hr/Hiring";
import HRJobApplications from "./pages/admin/hr/JobApplications";
import HRCandidateAssessments from "./pages/admin/hr/CandidateAssessments";
import HROnboarding from "./pages/admin/hr/Onboarding";
import HROffboarding from "./pages/admin/hr/Offboarding";
import HREmployeeHub from "./pages/admin/hr/EmployeeHub";
import HREmployeeProfile from "./pages/admin/hr/EmployeeProfile";
import HRDocuments from "./pages/admin/hr/Documents";
import HRPayslips from "./pages/admin/hr/Payslips";
import HRUserManagement from "./pages/admin/hr/UserManagement";

// Setter
import SetterDashboard from "./pages/setter/SetterDashboard";
import SetterClientResponsibility from "./pages/setter/SetterClientResponsibility";
import SetterMeetings from "./pages/setter/SetterMeetings";
import SetterWarmLeads from "./pages/setter/SetterWarmLeads";
import SetterEnrichment from "./pages/setter/SetterEnrichment";
import SetterSettings from "./pages/setter/SetterSettings";
import SetterHeyreachReply from "./pages/setter/SetterHeyreachReply";
import SetterCoaching from "./pages/setter/SetterCoaching";

// Client
import ClientDashboard from "./pages/client/ClientDashboard";
import ClientMeetings from "./pages/client/ClientMeetings";
import ClientWarmLeads from "./pages/client/ClientWarmLeads";
import ClientMetrics from "./pages/client/ClientMetrics";
import ClientCommunications from "./pages/client/ClientCommunications";
import ClientResources from "./pages/client/ClientResources";
import ClientSettings from "./pages/client/ClientSettings";
import ClientLeadLists from "./pages/client/ClientLeadLists";
import ClientDocuments from "./pages/client/ClientDocuments";
import ClientOnboarding from "./pages/client/ClientOnboarding";

// Partner (Partnerships Portal)
import PartnerDashboard from "./pages/partner/PartnerDashboard";
import PartnerReferences from "./pages/partner/PartnerReferences";
import PartnerDetails from "./pages/partner/PartnerDetails";
import PartnerDocuments from "./pages/partner/PartnerDocuments";
import PartnerSettings from "./pages/partner/PartnerSettings";


// New-starter onboarding surface
import OnboardingHome from "./pages/onboarding/OnboardingHome";
import TrialHome from "./pages/trial/TrialHome";
import TrialSandbox from "./pages/trial/TrialSandbox";
import OnboardingSandbox from "./pages/onboarding/OnboardingSandbox";
import ClientOnboardingSandbox from "./pages/client/ClientOnboardingSandbox";
import SetterDemoPortal from "./pages/setter/demo/SetterDemoPortal";


// AE
import AELeaderboard from "./pages/ae/AELeaderboard";
import AEAchievements from "./pages/ae/AEAchievements";
import AECommissions from "./pages/ae/AECommissions";
import AEDiscoveryCalls from "./pages/ae/AEDiscoveryCalls";
import AEFollowUpCalls from "./pages/ae/AEFollowUpCalls";
import AEMetrics from "./pages/ae/AEMetrics";
import {
  DemoDashboard,
  DemoMeetings,
  DemoWarmLeads,
  DemoLeadLists,
  DemoMetrics,
  DemoCommunications,
  DemoDocuments,
  DemoOnboarding,
} from "./pages/ae/demo-portal/DemoPortalPages";
import {
  DemoSetterDashboard,
  DemoSetterCoaching,
  DemoSetterClientResponsibility,
  DemoSetterMeetings,
  DemoSetterWarmLeads,
  DemoSetterEnrichment,
  DemoSetterSettings,
} from "./pages/setter/demo/DemoSetterPages";

// CSM
import CSMDashboard from "./pages/csm/CSMDashboard";
import CSMClients from "./pages/csm/CSMClients";
import CSMAppointments from "./pages/csm/CSMAppointments";
import CSMOnboarding from "./pages/csm/CSMOnboarding";
import CSMOffboarding from "./pages/csm/CSMOffboarding";
import CSMSetters from "./pages/csm/CSMSetters";

// SDR Manager
import SDRManagerDashboard from "./pages/sdr-manager/SDRManagerDashboard";
import SDRManagerMeetings from "./pages/sdr-manager/SDRManagerMeetings";
import SDRManagerSetters from "./pages/sdr-manager/SDRManagerSetters";
import SetterProfilePage from "./pages/sdr-manager/SetterProfilePage";
import SDRManagerCoaching from "./pages/sdr-manager/SDRManagerCoaching";
import SDRManagerOnboarding from "./pages/sdr-manager/SDRManagerOnboarding";
import SDRManagerOffboarding from "./pages/sdr-manager/SDRManagerOffboarding";
import SDRManagerResources from "./pages/sdr-manager/SDRManagerResources";
import SDRManagerAttendance from "./pages/sdr-manager/SDRManagerAttendance";
import SDRManagerObjectionsReport from "./pages/sdr-manager/SDRManagerObjectionsReport";
import SDRManagerHourlyFeedback from "./pages/sdr-manager/SDRManagerHourlyFeedback";
import SDRManagerSettings from "./pages/sdr-manager/SDRManagerSettings";

// Admin Morning Meeting

// GTM
import GTMDashboard from "./pages/gtm/GTMDashboard";
import GTMCampaigns from "./pages/gtm/GTMCampaigns";
import GTMSenders from "./pages/gtm/GTMSenders";
import GTMActivityFeed from "./pages/gtm/GTMActivityFeed";
import GTMSOPs from "./pages/gtm/GTMSOPs";
import GTMSocialMedia from "./pages/gtm/GTMSocialMedia";
import GTMReporting from "./pages/gtm/GTMReporting";
import GTMInbox from "./pages/gtm/GTMInbox";
import GTMEmail from "./pages/gtm/GTMEmail";
import AdminGTMOverview from "./pages/admin/gtm/Overview";

// Ops Assistant
import OpsAssistantDashboard from "./pages/ops-assistant/OpsAssistantDashboard";
import OpsAssistantMetricsInput from "./pages/ops-assistant/OpsAssistantMetricsInput";
import OpsAssistantSettings from "./pages/ops-assistant/OpsAssistantSettings";

// Marketing Hub (Tom Reilly) — formerly Cold Outbound
import MarketingOverview from "./pages/marketing/MarketingOverview";
import MarketingLeads from "./pages/marketing/MarketingLeads";
import FormPage from "./pages/public/FormPage";
import FormBuilderListPage from "./pages/admin/forms/FormsPage";
import FormEditorPage from "./pages/admin/forms/FormEditorPage";
import FormResponsesPage from "./pages/admin/forms/FormResponsesPage";
import MarketingLinkedIn from "./pages/marketing/MarketingLinkedIn";
import MarketingEmail from "./pages/marketing/MarketingEmail";


// Common
import FormsPage from "./pages/common/FormsPage";
import TasksPage from "./pages/common/TasksPage";
import HRTaskManagement from "./pages/admin/hr/TaskManagement";

// CEO
import CEOReferrals from "./pages/admin/ceo/CEOReferrals";
import DevCenter from "./pages/dev/DevCenter";
import BrandPreview from "./pages/dev/BrandPreview";
import UiPreview from "./pages/dev/UiPreview";
import CEOEventBookings from "./pages/admin/ceo/CEOEventBookings";
import CEOProjects from "./pages/admin/ceo/CEOProjects";
import CEOProjectDetail from "./pages/admin/ceo/CEOProjectDetail";
import CEOInvoices from "./pages/admin/ceo/CEOInvoices";
import OpsCommandAttendance from "./pages/ops-command/OpsCommandAttendance";
import OpsCommandTalentAcquisition from "./pages/ops-command/OpsCommandTalentAcquisition";
import OpsCommandLeave from "./pages/ops-command/OpsCommandLeave";
import OpsCommandTrialLeads from "./pages/ops-command/OpsCommandTrialLeads";
import OpsCommandPayslips from "./pages/ops-command/OpsCommandPayslips";
import OpsCommandKronos from "./pages/ops-command/OpsCommandKronos";


// All roles that have admin-level access
const ADMIN_ROLES = ["admin", "dev", "ops", "finance", "csm", "account_executive", "accounting", "hr", "sdr_manager"];
const FORM_MANAGER_ROLES = ["admin", "dev", "hr", "ops", "sdr_manager"];
const FORM_MANAGER_CAPS = ["can_screen_candidates", "can_view_ops_command"];
const SETTER_MANAGEMENT_ROLES = ["admin", "dev", "ops", "finance", "csm"];
const ACCOUNTING_ROLES = ["admin", "dev", "ops", "finance", "accounting", "csm"];
const HR_ROLES = ["admin", "dev", "ops", "hr", "csm"];
// Onboarding sandboxes (3 Sep). Each list mirrors the RLS on the tables that
// sandbox reads, so nobody lands on a misleading empty deck:
//   client sandbox reads client_flow_stages/steps (20260826130000: dev/admin/ops/csm)
//   SDR sandbox reads onboarding_step_templates (2026-08-18 builder: admin/dev/ops/hr
//   plus the can_screen_candidates capability, which is how Elena gets in)
// 11 Sep (Marcus, 8 Sep): Marcus (sdr_manager), Elena (hr) and Daniel (csm)
// can all run both simulations; migration 20260911120000 gives hr and
// sdr_manager the matching read on client_flow_stages/steps, and enabled SDR
// templates are readable by every signed-in user since 20260907120000.
const CLIENT_SANDBOX_ROLES = ["admin", "dev", "ops", "csm", "hr", "sdr_manager"];
const SDR_SANDBOX_ROLES = ["admin", "dev", "ops", "hr", "csm", "sdr_manager"];
const SDR_SANDBOX_CAPABILITY = "can_screen_candidates";
// The demo lenses are fixture-only (no RLS), and each is where a sandbox's
// finish card lands, so everyone who can run either sandbox can see them.
const SANDBOX_ROLES = ["admin", "dev", "ops", "csm", "hr", "sdr_manager"];
const DEMO_PORTAL_ROLES = ["account_executive", ...SANDBOX_ROLES];
const SDR_MANAGER_ROLES = ["admin", "dev", "ops", "sdr_manager"];
// 14 Oct 2026 (the owner): GTM is dev-only until it is rebuilt around Kit + Enquire leads.
const GTM_ROLES = ["dev"];
const OPS_ASSISTANT_ROLES = ["ops_assistant", "admin", "dev"];
// Demo surfaces rendered on fixtures for acting-as (3 Sep): never a real setter/client login.
const DEMO_SURFACE_ROLES = ["admin", "dev"];

const queryClient = new QueryClient();

import { useGlobalAutoRefresh } from "@/hooks/useGlobalAutoRefresh";
const GlobalAutoRefresh = () => { useGlobalAutoRefresh(); return null; };

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <AuthProvider>
          <DepartmentProvider>
            <WorkspaceProvider>
              <GlobalAutoRefresh />
              <Toaster />
              <Sonner />
              <BrowserRouter>
              <ImpersonationBanner />
              <SystemBroadcastBanner />
              <ForcePasswordChangeGate />
            <RouteErrorBoundary>
            <Routes>
              <Route path="/" element={<Index />} />
            <Route path="/client" element={<ClientAuth />} />
            <Route path="/partnerships" element={<PartnerAuth />} />
            {/* Public self-booking (meta-ads inbound) — no login by design */}
            <Route path="/bookings" element={<BookingsHomePage />} />
            <Route path="/bookings/confirm/:bookingId" element={<BookingConfirmPage />} />
            <Route path="/bookings/fulfilment" element={<FulfilmentHubPage />} />
            <Route path="/bookings/:slug" element={<BookingPage />} />
            {/* Vexon OS Forms (18 Sep): public renderer, one question per screen. */}
            <Route path="/f/:slug" element={<FormPage />} />
            <Route path="/connect-calendar" element={<ConnectCalendarPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            {/* Onboarding invite landing — the emailed set-password page.
                Public: the one-shot token in the URL fragment IS the auth. */}
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/dev" element={<ProtectedRoute allowedRoles={["dev"]}><DevCenter /></ProtectedRoute>} />
            {/* Meridian round 2: design-system sheet. Dev-guarded in production;
                open on a local `npm run dev` so it can be reviewed without a login. */}
            <Route
              path="/dev/brand-preview"
              element={
                import.meta.env.DEV ? (
                  <BrandPreview />
                ) : (
                  <ProtectedRoute allowedRoles={["dev"]}><BrandPreview /></ProtectedRoute>
                )
              }
            />

            {/* 14 Oct 2026: the ui-v2 kit on its own, same guard as the brand sheet. */}
            <Route
              path="/dev/ui-preview"
              element={
                import.meta.env.DEV ? (
                  <UiPreview />
                ) : (
                  <ProtectedRoute allowedRoles={["dev"]}><UiPreview /></ProtectedRoute>
                )
              }
            />

            {/* Ops Command — capability-gated dedicated workspace */}
            <Route path="/ops-command" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ops-command/metrics" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            {/* 11 Sep: the input surface lives behind the gear on the metrics board. */}
            <Route path="/ops-command/metrics/input" element={<Navigate to="/ops-command/metrics" replace />} />
            {/* 11 Sep: Meetings is a CEO-department page; Elena has CEO access. */}
            <Route path="/ops-command/meetings" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/ops-command/attendance" element={<ProtectedRoute allowedRoles={["dev", "admin"]} allowedCapability="can_view_ops_command"><OpsCommandAttendance /></ProtectedRoute>} />
            {/* 11 Sep: the old five-column hiring board did not match the stage-keyed pipeline; Candidate Tracking is the one board. */}
            <Route path="/ops-command/hiring" element={<Navigate to="/ops-command/talent-acquisition?tab=tracking" replace />} />
            <Route path="/ops-command/talent-acquisition" element={<ProtectedRoute allowedRoles={["dev", "admin"]} allowedCapability="can_view_ops_command"><OpsCommandTalentAcquisition /></ProtectedRoute>} />
            {/* 3 Sep: "Candidates" became the Call List tab of Talent Acquisition. */}
            <Route path="/ops-command/candidates" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ops-command/leave" element={<ProtectedRoute allowedRoles={["dev", "admin"]} allowedCapability="can_view_ops_command"><OpsCommandLeave /></ProtectedRoute>} />
            <Route path="/ops-command/trialist-leads" element={<ProtectedRoute allowedRoles={["dev", "admin"]} allowedCapability="can_view_ops_command"><OpsCommandTrialLeads /></ProtectedRoute>} />
            <Route path="/ops-command/employees" element={<Navigate to="/admin/hr/employees" replace />} />
            <Route path="/ops-command/employees/:employeeId" element={<Navigate to="/admin/hr/employees" replace />} />
            <Route path="/ops-command/ae-oversight" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ops-command/ae-oversight/:aeId" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ops-command/performance-review" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ops-command/payslips" element={<ProtectedRoute allowedRoles={["dev", "admin"]} allowedCapability="can_view_ops_command"><OpsCommandPayslips /></ProtectedRoute>} />
            {/* 14 Oct 2026: Elena's (and Daniel's) own Kronos door, scoped to the signed-in person. */}
            <Route path="/ops-command/kronos" element={<ProtectedRoute allowedRoles={["dev", "admin"]} allowedCapability="can_view_ops_command"><OpsCommandKronos /></ProtectedRoute>} />

            
            
            {/* Admin Routes */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/clients" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminClients /></ProtectedRoute>} />
            <Route path="/admin/clients/:id" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><ClientProfile /></ProtectedRoute>} />
            <Route path="/admin/health" element={<Navigate to="/admin/clients" replace />} />
            <Route path="/admin/campaigns/:id" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><CampaignManager /></ProtectedRoute>} />
            <Route path="/admin/meetings" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminMeetings /></ProtectedRoute>} />
            <Route path="/admin/leads" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminLeads /></ProtectedRoute>} />
            <Route path="/admin/setters" element={<ProtectedRoute allowedRoles={SETTER_MANAGEMENT_ROLES}><AdminSetters /></ProtectedRoute>} />
            <Route path="/admin/operations/setters" element={<ProtectedRoute allowedRoles={SETTER_MANAGEMENT_ROLES}><AdminSetters /></ProtectedRoute>} />
            <Route path="/admin/sales/setters" element={<ProtectedRoute allowedRoles={SETTER_MANAGEMENT_ROLES}><AdminSetters /></ProtectedRoute>} />
            <Route path="/admin/resources" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminResources /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/reporting" element={<Navigate to="/admin" replace />} />

            {/* Operations Routes */}
            <Route path="/admin/operations/overview" element={<Navigate to="/admin/operations/dashboard" replace />} />
            <Route path="/admin/operations/dashboard" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OperationsDashboard /></ProtectedRoute>} />
            <Route path="/admin/operations/clients" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OperationsClients /></ProtectedRoute>} />
            <Route path="/admin/operations/accounting" element={<Navigate to="/admin/accounting/payments" replace />} />
            <Route path="/admin/acquisition/meetings" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AcquisitionMeetings /></ProtectedRoute>} />
            <Route path="/admin/acquisition/sales-tools" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><SalesTools /></ProtectedRoute>} />
            <Route path="/admin/acquisition/metrics" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><AcquisitionMetrics /></ProtectedRoute>} />
            <Route path="/admin/sales/meetings" element={<Navigate to="/admin/acquisition/meetings" replace />} />
            <Route path="/admin/sales/sales-tools" element={<Navigate to="/admin/acquisition/sales-tools" replace />} />
            <Route path="/admin/sales/metrics" element={<Navigate to="/admin/acquisition/metrics" replace />} />
            <Route path="/admin/sales/pre-disco-insights" element={<Navigate to="/admin/acquisition/sales-tools" replace />} />
            <Route path="/admin/morning-meeting/sales" element={<Navigate to="/admin" replace />} />
            {/* sdr_manager only by design — page itself additionally requires the manager to
                HOLD the acquisition department (useSdrManagerScope). Deliberately
                NOT the Ops Command guard (hardcoded user + capability). */}
            <Route path="/admin/morning-meeting/sales/input" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/operations/reporting" element={<Navigate to="/admin/operations/dashboard" replace />} />
            <Route path="/admin/operations/hr-management" element={<Navigate to="/admin/hr/overview" replace />} />
            <Route path="/admin/operations/leaderboard" element={<Navigate to="/admin/operations/dashboard" replace />} />
            <Route path="/admin/operations/user-management" element={<Navigate to="/admin/hr/user-management" replace />} />
            <Route path="/admin/operations/resources" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OperationsResources /></ProtectedRoute>} />
            <Route path="/admin/operations/objections-report" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OperationsObjectionsReport /></ProtectedRoute>} />
            <Route path="/admin/operations/hiring" element={<Navigate to="/admin/hr/hiring" replace />} />
            <Route path="/admin/operations/client-health" element={<Navigate to="/admin/operations/clients" replace />} />
            <Route path="/admin/operations/achievements" element={<Navigate to="/admin/operations/dashboard" replace />} />
            <Route path="/admin/operations/client-health-parity" element={<Navigate to="/admin/operations/clients" replace />} />
            <Route path="/admin/operations/meeting-scores" element={<Navigate to="/admin/meetings" replace />} />
            <Route path="/csm/meeting-scores" element={<Navigate to="/csm/meetings" replace />} />
            <Route path="/sdr-manager/meeting-scores" element={<Navigate to="/sdr-manager/meetings" replace />} />
            <Route path="/admin/operations/onboarding" element={<ProtectedRoute allowedRoles={["admin", "dev", "ops", "csm"]}><OperationsOnboarding /></ProtectedRoute>} />
            <Route path="/admin/operations/offboarding" element={<ProtectedRoute allowedRoles={["admin", "dev", "ops", "csm"]}><OperationsOffboarding /></ProtectedRoute>} />
            <Route path="/admin/operations/sdr-management" element={<Navigate to="/admin/operations/dashboard" replace />} />
            <Route path="/admin/operations/warm-leads" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OperationsWarmLeads /></ProtectedRoute>} />
            <Route path="/admin/operations/hourly-feedback" element={<ProtectedRoute allowedRoles={ADMIN_ROLES}><OperationsHourlyFeedback /></ProtectedRoute>} />

            {/* Accounting Routes */}
            <Route path="/admin/accounting/overview" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AccountingOverview /></ProtectedRoute>} />
            <Route path="/admin/accounting/payments" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AccountingPayments /></ProtectedRoute>} />
            <Route path="/admin/accounting/invoices" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AccountingInvoices /></ProtectedRoute>} />
            <Route path="/admin/accounting/cashflow" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AccountingCashflow /></ProtectedRoute>} />
            <Route path="/admin/accounting/costs" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AccountingCosts /></ProtectedRoute>} />
            <Route path="/admin/accounting/templates" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><AccountingTemplates /></ProtectedRoute>} />
            <Route path="/admin/accounting/invoice-submissions" element={<ProtectedRoute allowedRoles={ACCOUNTING_ROLES}><InvoiceSubmissions /></ProtectedRoute>} />

            {/* HR Routes */}
            <Route path="/admin/hr/overview" element={<ProtectedRoute allowedRoles={HR_ROLES}><HROverview /></ProtectedRoute>} />
            <Route path="/admin/hr/attendance" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRAttendance /></ProtectedRoute>} />
            <Route path="/admin/hr/hiring" element={<ProtectedRoute allowedRoles={[...HR_ROLES, "sdr_manager"]}><HRHiring /></ProtectedRoute>} />
            <Route path="/admin/hr/job-applications" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRJobApplications /></ProtectedRoute>} />
            <Route path="/admin/hr/candidate-assessments" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRCandidateAssessments /></ProtectedRoute>} />
            <Route path="/admin/hr/onboarding" element={<ProtectedRoute allowedRoles={HR_ROLES}><HROnboarding /></ProtectedRoute>} />
            {/* 11 Sep: the new-starter deck builder outside the Dev Center, so Elena can author cards and quizzes. */}
            {/* New Starter Flow left HR on 14 Oct 2026 (the owner): it is edited in the Dev Centre. */}
            <Route path="/admin/hr/onboarding-flow" element={<Navigate to="/admin/hr/overview" replace />} />
            <Route path="/admin/hr/offboarding" element={<ProtectedRoute allowedRoles={HR_ROLES}><HROffboarding /></ProtectedRoute>} />
            <Route path="/admin/hr/employees" element={<ProtectedRoute allowedRoles={HR_ROLES}><HREmployeeHub /></ProtectedRoute>} />
            <Route path="/admin/hr/employees/:employeeId" element={<ProtectedRoute allowedRoles={HR_ROLES}><HREmployeeProfile /></ProtectedRoute>} />
            <Route path="/admin/hr/documents" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRDocuments /></ProtectedRoute>} />
            <Route path="/admin/hr/payslips" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRPayslips /></ProtectedRoute>} />
            <Route path="/admin/hr/user-management" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRUserManagement /></ProtectedRoute>} />

            {/* CEO Routes (gated to Marcus inside the page). 14 Oct 2026: the
                department is Projects + Tools (Kronos, Enquire, Invoice generator,
                Referrals). Every retired tab redirects to Projects so no bookmark dies. */}
            <Route path="/admin/ceo" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/dashboard" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/meetings" element={<Navigate to="/admin/ceo/projects" replace />} />
            {/* Kronos (was Event Bookings, 17 Sep 2026): the Dev Centre booking-event controls, Marcus's door */}
            <Route path="/admin/ceo/event-bookings" element={<ProtectedRoute allowedRoles={["admin", "dev"]} allowedCapability="can_view_ceo_dashboard"><CEOEventBookings /></ProtectedRoute>} />
            {/* Projects tab (13 Sep 2026): CEO parity holders + can_view_projects holders */}
            <Route path="/admin/ceo/projects" element={<ProtectedRoute allowedRoles={["admin", "dev"]} allowedCapability={["can_view_ceo_dashboard", "can_view_projects"]}><CEOProjects /></ProtectedRoute>} />
            <Route path="/admin/ceo/projects/:id" element={<ProtectedRoute allowedRoles={["admin", "dev"]} allowedCapability={["can_view_ceo_dashboard", "can_view_projects"]}><CEOProjectDetail /></ProtectedRoute>} />
            <Route path="/admin/ceo/appointment-setting" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/sales" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/client-health" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/fulfilment" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/operations" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/hr" element={<Navigate to="/admin/hr/hiring" replace />} />
            <Route path="/admin/ceo/finance" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/invoices" element={<ProtectedRoute allowedRoles={["admin", "dev"]} allowedCapability="can_view_ceo_dashboard"><CEOInvoices /></ProtectedRoute>} />
            <Route path="/admin/ceo/growth" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/goals" element={<Navigate to="/admin/ceo/projects" replace />} />
            <Route path="/admin/ceo/referrals" element={<ProtectedRoute allowedRoles={["admin", "dev"]} allowedCapability="can_view_ceo_dashboard"><CEOReferrals /></ProtectedRoute>} />



            {/* AE Routes */}
            <Route path="/ae/leaderboard" element={<ProtectedRoute allowedRoles={["account_executive", "admin", "dev"]}><AELeaderboard /></ProtectedRoute>} />
            <Route path="/ae/achievements" element={<ProtectedRoute allowedRoles={["account_executive", "admin", "dev"]}><AEAchievements /></ProtectedRoute>} />
            <Route path="/ae/commissions" element={<ProtectedRoute allowedRoles={["account_executive", "admin", "dev"]}><AECommissions /></ProtectedRoute>} />
            <Route path="/ae/discovery-calls" element={<ProtectedRoute allowedRoles={["account_executive", "admin", "dev"]}><AEDiscoveryCalls /></ProtectedRoute>} />
            <Route path="/ae/follow-up-calls" element={<ProtectedRoute allowedRoles={["account_executive", "admin", "dev"]}><AEFollowUpCalls /></ProtectedRoute>} />
            <Route path="/ae/metrics" element={<ProtectedRoute allowedRoles={["account_executive", "admin", "dev"]}><AEMetrics /></ProtectedRoute>} />
            {/* AE demo portal — the real client-portal views on fixture data (no client can reach /ae/*) */}
            <Route path="/ae/demo-portal" element={<Navigate to="/ae/demo-portal/dashboard" replace />} />
            <Route path="/ae/demo-portal/dashboard" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoDashboard /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/meetings" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoMeetings /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/warm-leads" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoWarmLeads /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/lead-lists" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoLeadLists /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/onboarding" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoOnboarding /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/metrics" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoMetrics /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/communications" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoCommunications /></ProtectedRoute>} />
            <Route path="/ae/demo-portal/documents" element={<ProtectedRoute allowedRoles={DEMO_PORTAL_ROLES}><DemoDocuments /></ProtectedRoute>} />
            <Route path="/ae/post-discovery" element={<ProtectedRoute allowedRoles={["account_executive"]}><Navigate to="/ae/discovery-calls?filter=feedback" replace /></ProtectedRoute>} />
            <Route path="/ae/pre-disco-insights" element={<Navigate to="/ae/dashboard" replace />} />
            <Route path="/ae/eod" element={<Navigate to="/forms" replace />} />

            {/* AE Management */}
            <Route path="/admin/sales/ae-management" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/sales/ae-management/:aeId" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/sales/ae-reviews" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/sales/ae-targets" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/operations/manager-reviews" element={<Navigate to="/admin/operations/dashboard" replace />} />

            {/* CSM Routes */}
            <Route path="/csm" element={<ProtectedRoute allowedRoles={["csm", "admin", "dev"]}><CSMDashboard /></ProtectedRoute>} />
            <Route path="/csm/clients" element={<ProtectedRoute allowedRoles={["csm", "admin", "dev"]}><CSMClients /></ProtectedRoute>} />
            <Route path="/csm/clients/:id" element={<ProtectedRoute allowedRoles={["csm", "admin", "dev", "ops", "sdr_manager"]}><ClientProfile /></ProtectedRoute>} />
            <Route path="/csm/client-health" element={<Navigate to="/csm/clients" replace />} />
            <Route path="/csm/client-health-parity" element={<Navigate to="/csm/clients" replace />} />
            <Route path="/csm/client-health/:id" element={<Navigate to="/csm/clients" replace />} />
            <Route path="/csm/campaigns/:id" element={<ProtectedRoute allowedRoles={["csm", "admin", "dev", "sdr_manager"]}><CampaignManager /></ProtectedRoute>} />
            <Route path="/csm/onboarding" element={<ProtectedRoute allowedRoles={["csm", "dev", "admin", "ops"]}><CSMOnboarding /></ProtectedRoute>} />
            <Route path="/csm/offboarding" element={<ProtectedRoute allowedRoles={["csm", "dev", "admin", "ops"]}><CSMOffboarding /></ProtectedRoute>} />
            <Route path="/csm/meetings" element={<ProtectedRoute allowedRoles={["csm", "dev", "admin", "ops"]}><CSMAppointments /></ProtectedRoute>} />
            <Route path="/csm/setters" element={<ProtectedRoute allowedRoles={["csm", "dev", "admin", "ops"]}><CSMSetters /></ProtectedRoute>} />
            <Route path="/csm/metrics" element={<Navigate to="/csm" replace />} />
            <Route path="/csm/reporting" element={<Navigate to="/csm" replace />} />
            <Route path="/csm/eod" element={<Navigate to="/forms" replace />} />
            <Route path="/csm/resources" element={<ProtectedRoute allowedRoles={["csm", "admin", "dev"]}><AdminResources /></ProtectedRoute>} />
            <Route path="/csm/settings" element={<ProtectedRoute allowedRoles={["csm", "admin", "dev"]}><AdminSettings /></ProtectedRoute>} />

            {/* SDR Manager Routes */}
            <Route path="/sdr-manager" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerDashboard /></ProtectedRoute>} />
            <Route path="/sdr-manager/meetings" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerMeetings /></ProtectedRoute>} />
            <Route path="/sdr-manager/setters" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerSetters /></ProtectedRoute>} />
            <Route path="/sdr-manager/setters/:setterProfileId" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SetterProfilePage /></ProtectedRoute>} />
            <Route path="/sdr-manager/aes" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/aes/:aeId" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/attendance" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerAttendance /></ProtectedRoute>} />
            <Route path="/sdr-manager/coaching" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerCoaching /></ProtectedRoute>} />
            <Route path="/sdr-manager/metrics" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/onboarding" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerOnboarding /></ProtectedRoute>} />
            <Route path="/sdr-manager/offboarding" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerOffboarding /></ProtectedRoute>} />
            <Route path="/sdr-manager/performance" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/performance-review" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/leaderboard" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/resources" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerResources /></ProtectedRoute>} />
            <Route path="/sdr-manager/achievements" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/objections-report" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerObjectionsReport /></ProtectedRoute>} />
            <Route path="/sdr-manager/eod" element={<Navigate to="/forms" replace />} />
            <Route path="/sdr-manager/client-campaigns" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/hourly-feedback" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerHourlyFeedback /></ProtectedRoute>} />
            
            <Route path="/sdr-manager/morning-meeting" element={<Navigate to="/sdr-manager" replace />} />
            <Route path="/sdr-manager/settings" element={<ProtectedRoute allowedRoles={SDR_MANAGER_ROLES}><SDRManagerSettings /></ProtectedRoute>} />

            {/* GTM Routes */}
            <Route path="/gtm" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMDashboard /></ProtectedRoute>} />
            <Route path="/gtm/inbox" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMInbox /></ProtectedRoute>} />
            <Route path="/gtm/email" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMEmail /></ProtectedRoute>} />
            <Route path="/gtm/campaigns" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMCampaigns /></ProtectedRoute>} />
            <Route path="/gtm/senders" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMSenders /></ProtectedRoute>} />
            <Route path="/gtm/activity-feed" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMActivityFeed /></ProtectedRoute>} />
            <Route path="/gtm/sops" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMSOPs /></ProtectedRoute>} />
            <Route path="/gtm/social-media" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMSocialMedia /></ProtectedRoute>} />
            <Route path="/gtm/reporting" element={<ProtectedRoute allowedRoles={GTM_ROLES}><GTMReporting /></ProtectedRoute>} />
            <Route path="/admin/gtm/overview" element={<ProtectedRoute allowedRoles={GTM_ROLES}><AdminGTMOverview /></ProtectedRoute>} />

            {/* Ops Assistant Routes */}
            <Route path="/ops-assistant" element={<ProtectedRoute allowedRoles={OPS_ASSISTANT_ROLES}><OpsAssistantDashboard /></ProtectedRoute>} />
            <Route path="/ops-assistant/metrics" element={<ProtectedRoute allowedRoles={OPS_ASSISTANT_ROLES}><OpsAssistantMetricsInput /></ProtectedRoute>} />
            <Route path="/ops-assistant/settings" element={<ProtectedRoute allowedRoles={OPS_ASSISTANT_ROLES}><OpsAssistantSettings /></ProtectedRoute>} />

            {/* Common */}
            <Route path="/leave" element={<Navigate to="/forms" replace />} />
            <Route path="/forms" element={<ProtectedRoute allowedRoles={["admin", "dev", "ops", "finance", "accounting", "hr", "csm", "account_executive", "sdr_manager", "setter", "gtm_engineer"]}><FormsPage /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute allowedRoles={["admin", "dev", "ops", "finance", "accounting", "hr", "csm", "account_executive", "sdr_manager", "setter", "gtm_engineer", "ops_assistant"]}><TasksPage /></ProtectedRoute>} />
            <Route path="/admin/hr/task-management" element={<ProtectedRoute allowedRoles={HR_ROLES}><HRTaskManagement /></ProtectedRoute>} />
            <Route path="/admin/eod" element={<Navigate to="/forms" replace />} />

            {/* Setter Routes */}
            <Route path="/setter" element={<ProtectedRoute allowedRoles={["setter"]}><SetterDashboard /></ProtectedRoute>} />
            {/* Setter demo lens: the real setter shell on fixture data, where the SDR onboarding sandbox lands (3 Sep). */}
            <Route path="/setter/demo" element={<ProtectedRoute allowedRoles={[...SANDBOX_ROLES, "account_executive"]} allowedCapability={SDR_SANDBOX_CAPABILITY}><SetterDemoPortal /></ProtectedRoute>} />
            <Route path="/setter/leaderboard" element={<Navigate to="/setter" replace />} />
            <Route path="/setter/achievements" element={<Navigate to="/setter" replace />} />
            <Route path="/setter/coaching" element={<ProtectedRoute allowedRoles={["setter"]}><SetterCoaching /></ProtectedRoute>} />
            <Route path="/setter/client-responsibility" element={<ProtectedRoute allowedRoles={["setter"]}><SetterClientResponsibility /></ProtectedRoute>} />
            <Route path="/setter/reporting" element={<Navigate to="/setter" replace />} />
            <Route path="/setter/meetings" element={<ProtectedRoute allowedRoles={["setter"]}><SetterMeetings /></ProtectedRoute>} />
            <Route path="/setter/warm-leads" element={<ProtectedRoute allowedRoles={["setter"]}><SetterWarmLeads /></ProtectedRoute>} />
            <Route path="/setter/enrichment" element={<ProtectedRoute allowedRoles={["setter"]}><SetterEnrichment /></ProtectedRoute>} />
            <Route path="/setter/eod" element={<Navigate to="/forms" replace />} />
            <Route path="/setter/forms" element={<Navigate to="/forms" replace />} />
            <Route path="/setter/invoice-submissions" element={<Navigate to="/setter" replace />} />
            <Route path="/setter/resources" element={<Navigate to="/setter" replace />} />
            <Route path="/setter/settings" element={<ProtectedRoute allowedRoles={["setter"]}><SetterSettings /></ProtectedRoute>} />
            <Route path="/setter/heyreach-reply/:eventId" element={<ProtectedRoute allowedRoles={["setter"]}><SetterHeyreachReply /></ProtectedRoute>} />

            {/* Setter demo surface (3 Sep): the real setter-portal views on fixture data, for
                "Acting as SDR (Fulfilment / Acquisition)". Admin/dev only; no setter can reach it. */}
            <Route path="/demo/setter" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterDashboard /></ProtectedRoute>} />
            <Route path="/demo/setter/coaching" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterCoaching /></ProtectedRoute>} />
            <Route path="/demo/setter/client-responsibility" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterClientResponsibility /></ProtectedRoute>} />
            <Route path="/demo/setter/meetings" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterMeetings /></ProtectedRoute>} />
            <Route path="/demo/setter/warm-leads" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterWarmLeads /></ProtectedRoute>} />
            <Route path="/demo/setter/enrichment" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterEnrichment /></ProtectedRoute>} />
            <Route path="/demo/setter/settings" element={<ProtectedRoute allowedRoles={DEMO_SURFACE_ROLES}><DemoSetterSettings /></ProtectedRoute>} />

            {/* Cold Outbound (Tom Reilly only) */}
            <Route path="/marketing" element={<ProtectedRoute allowedRoles={["setter","dev","admin"]}><MarketingOverview /></ProtectedRoute>} />
            <Route path="/marketing/leads" element={<ProtectedRoute allowedRoles={["setter","dev","admin"]}><MarketingLeads /></ProtectedRoute>} />
            {/* Vexon OS Forms builder: reviewer tier + Elena (screening) + Tom (ops-command capability). */}
            <Route path="/admin/forms" element={<ProtectedRoute allowedRoles={FORM_MANAGER_ROLES} allowedCapability={FORM_MANAGER_CAPS}><FormBuilderListPage /></ProtectedRoute>} />
            <Route path="/admin/forms/:id" element={<ProtectedRoute allowedRoles={FORM_MANAGER_ROLES} allowedCapability={FORM_MANAGER_CAPS}><FormEditorPage /></ProtectedRoute>} />
            <Route path="/admin/forms/:id/responses" element={<ProtectedRoute allowedRoles={FORM_MANAGER_ROLES} allowedCapability={FORM_MANAGER_CAPS}><FormResponsesPage /></ProtectedRoute>} />
            <Route path="/marketing/linkedin" element={<ProtectedRoute allowedRoles={["setter","dev","admin"]}><MarketingLinkedIn /></ProtectedRoute>} />
            {/* Email retired from nav (outreach stopped Aug 2026) but page kept reachable */}
            <Route path="/marketing/email" element={<ProtectedRoute allowedRoles={["setter","dev","admin"]}><MarketingEmail /></ProtectedRoute>} />
            {/* Old Cold Outbound URLs live on as redirects (house pattern) */}
            <Route path="/cold-outbound" element={<Navigate to="/marketing" replace />} />
            <Route path="/cold-outbound/linkedin" element={<Navigate to="/marketing/linkedin" replace />} />
            <Route path="/cold-outbound/email" element={<Navigate to="/marketing/email" replace />} />

            {/* Client Routes */}
            <Route path="/client/dashboard" element={<ProtectedRoute allowedRoles={["client"]}><ClientDashboard /></ProtectedRoute>} />
            <Route path="/client/meetings" element={<ProtectedRoute allowedRoles={["client"]}><ClientMeetings /></ProtectedRoute>} />
            <Route path="/client/warm-leads" element={<ProtectedRoute allowedRoles={["client"]}><ClientWarmLeads /></ProtectedRoute>} />
            <Route path="/client/lead-lists" element={<ProtectedRoute allowedRoles={["client"]}><ClientLeadLists /></ProtectedRoute>} />
            <Route path="/client/metrics" element={<ProtectedRoute allowedRoles={["client"]}><ClientMetrics /></ProtectedRoute>} />
            <Route path="/client/communications" element={<ProtectedRoute allowedRoles={["client"]}><ClientCommunications /></ProtectedRoute>} />
            <Route path="/client/resources" element={<ProtectedRoute allowedRoles={["client"]}><ClientResources /></ProtectedRoute>} />
            <Route path="/client/documents" element={<ProtectedRoute allowedRoles={["client"]}><ClientDocuments /></ProtectedRoute>} />
            <Route path="/client/settings" element={<ProtectedRoute allowedRoles={["client"]}><ClientSettings /></ProtectedRoute>} />
            <Route path="/client/onboarding" element={<ProtectedRoute allowedRoles={["client"]}><ClientOnboarding /></ProtectedRoute>} />
            <Route path="/client/onboarding/sandbox" element={<ProtectedRoute allowedRoles={CLIENT_SANDBOX_ROLES}><ClientOnboardingSandbox /></ProtectedRoute>} />

            {/* Partnerships Portal Routes */}
            <Route path="/partnerships/dashboard" element={<ProtectedRoute allowedRoles={["partner"]}><PartnerDashboard /></ProtectedRoute>} />
            {/* 18 Sep: partners are references, not referrers. Old link kept as a redirect. */}
            <Route path="/partnerships/references" element={<ProtectedRoute allowedRoles={["partner"]}><PartnerReferences /></ProtectedRoute>} />
            <Route path="/partnerships/details" element={<ProtectedRoute allowedRoles={["partner"]}><PartnerDetails /></ProtectedRoute>} />
            <Route path="/partnerships/referrals" element={<Navigate to="/partnerships/references" replace />} />
            <Route path="/partnerships/documents" element={<ProtectedRoute allowedRoles={["partner"]}><PartnerDocuments /></ProtectedRoute>} />
            <Route path="/partnerships/settings" element={<ProtectedRoute allowedRoles={["partner"]}><PartnerSettings /></ProtectedRoute>} />

            {/* Talent Acquisition portal retired 2 Sep — Elena runs
                recruiting from Ops Command under her own login. Old URLs
                (bookmarks, historical bell notifications) land on the ops
                equivalents. */}
            <Route path="/ta" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ta/screenings" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ta/typeform" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ta/headhunting" element={<Navigate to="/ops-command/talent-acquisition" replace />} />
            <Route path="/ta/tracking" element={<Navigate to="/ops-command/talent-acquisition?tab=tracking" replace />} />

            {/* The only surface an account in onboarding mode can reach.
                allowedRoles is unused for it — isOnboardingSurface gates on
                profiles.in_onboarding_mode instead, so a starter without a
                role assigned yet still lands somewhere sensible. */}
            {/* Sandbox previews (3 Sep): the real decks on in-memory state over
                the live templates. Nothing is written. The old fixture preview
                redirects here. */}
            <Route path="/onboarding/sandbox" element={<ProtectedRoute allowedRoles={SDR_SANDBOX_ROLES} allowedCapability={SDR_SANDBOX_CAPABILITY}><OnboardingSandbox /></ProtectedRoute>} />
            <Route path="/onboarding/preview" element={<Navigate to="/onboarding/sandbox" replace />} />
            <Route path="/onboarding" element={<ProtectedRoute allowedRoles={[]} isOnboardingSurface><OnboardingHome /></ProtectedRoute>} />
            {/* Trial Day (15 Sep): the only surface a trialist login can reach.
                Gated on profiles.in_trial_mode like onboarding, so it works
                even if the role row is missing. */}
            <Route path="/trial" element={<ProtectedRoute allowedRoles={[]} isTrialSurface><TrialHome /></ProtectedRoute>} />
            {/* The Trial Day sandbox: the whole hand-off on in-memory state,
                same gate as the SDR onboarding sandbox. */}
            <Route path="/trial/sandbox" element={<ProtectedRoute allowedRoles={SDR_SANDBOX_ROLES} allowedCapability={SDR_SANDBOX_CAPABILITY}><TrialSandbox /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
            </Routes>
            </RouteErrorBoundary>
          </BrowserRouter>
            </WorkspaceProvider>
          </DepartmentProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
