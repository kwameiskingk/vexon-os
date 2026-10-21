// Navigation config for the shell (extracted from AppSidebar on 14 Oct 2026
// so the top bar can derive its breadcrumb from the same source of truth).
// Pure data: no hooks, no JSX. AppSidebar decides which list a user sees.

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  FlaskConical,
  Award,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarClock,
  CalendarOff,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Flame,
  FolderKanban,
  FolderOpen,
  Handshake,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  Phone,
  PhoneCall,
  Radio,
  Receipt,
  Rocket,
  Trophy,
  UserCheck,
  UserCog,
  UserPlus,
  UserSearch,
  Users,
  Wrench,
} from "lucide-react";
import type { Department } from "@/contexts/DepartmentContext";
import { CLIENT_DEMO_BASE, SETTER_DEMO_BASE } from "@/lib/actingAs";

export type NavItem = {
  /** Stable ID used for tab visibility restrictions */
  id: string;
  title: string;
  url: string;
  icon: LucideIcon;
  /** Optional coloured dot rendered before the label (used by CEO nav). */
  dotColor?: string;
};

export type NavGroup = {
  /** Distinguishes a parent group from a leaf NavItem */
  type: "group";
  /** Stable key (used for localStorage and React keys) */
  key: string;
  title: string;
  icon: LucideIcon;
  /**
   * Optional landing page URL. When provided, clicking the parent row
   * navigates here; the chevron toggles the child dropdown separately.
   * When omitted, clicking the parent just toggles the dropdown.
   */
  landingUrl?: string;
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export const isGroup = (entry: NavEntry): entry is NavGroup =>
  (entry as NavGroup).type === "group";

// Sales Department
export const salesItems: NavEntry[] = [
  // 14 Oct 2026 (the owner): metrics left the dashboard. Morning Meeting, the AE
  // group, AE management and Reporting are gone from this nav; Appointments
  // stands on its own; Sales Tools is a plain entry.
  { id: "overview", title: "Overview", url: "/admin", icon: LayoutDashboard },
  { id: "setters", title: "Setters", url: "/admin/sales/setters", icon: UserCheck },
  { id: "meetings", title: "Appointments", url: "/admin/sales/meetings", icon: Calendar },
  { id: "sales-tools", title: "Sales Tools", url: "/admin/sales/sales-tools", icon: DollarSign },
];

// Operations Department
export const operationsItems: NavEntry[] = [
  // 14 Oct 2026 (the owner): Client Health, Appointment Scoring, Leaderboard,
  // Achievements, Manager Reviews, Second Line Management, Reporting and the
  // Tasks link are gone from this nav. Tools stay.
  { id: "dashboard", title: "Overview", url: "/admin/operations/dashboard", icon: LayoutDashboard },
  {
    type: "group",
    key: "ops-clients",
    title: "Clients",
    icon: Users,
    landingUrl: "/admin/operations/clients",
    children: [
      { id: "onboarding", title: "Onboarding", url: "/admin/operations/onboarding", icon: UserPlus },
      { id: "offboarding", title: "Offboarding", url: "/admin/operations/offboarding", icon: UserCog },
    ],
  },
  {
    type: "group",
    key: "ops-setters",
    title: "Setter Management",
    icon: UserCheck,
    landingUrl: "/admin/operations/setters",
    children: [
      { id: "meetings", title: "Appointments", url: "/admin/meetings", icon: Calendar },
      { id: "warm-leads", title: "Warm Leads", url: "/admin/operations/warm-leads", icon: Flame },
    ],
  },
  { id: "resources", title: "Resources", url: "/admin/operations/resources", icon: FolderOpen },
  { id: "forms", title: "Forms", url: "/forms", icon: ClipboardList },
];

// Accounting Department
export const accountingItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/admin/accounting/overview", icon: LayoutDashboard },
  {
    type: "group",
    key: "accounting-payments",
    title: "Payments",
    icon: CreditCard,
    landingUrl: "/admin/accounting/payments",
    children: [
      { id: "payments", title: "Payment Tracker", url: "/admin/accounting/payments", icon: DollarSign },
    ],
  },
  {
    type: "group",
    key: "accounting-invoices",
    title: "Invoices",
    icon: FileText,
    landingUrl: "/admin/accounting/invoices",
    children: [
      { id: "costs", title: "Operating Costs", url: "/admin/accounting/costs", icon: Receipt },
      { id: "invoice-submissions", title: "Invoice Submissions", url: "/admin/accounting/invoice-submissions", icon: ClipboardList },
    ],
  },
  { id: "templates", title: "Templates & Docs", url: "/admin/accounting/templates", icon: FolderOpen },
];

// HR Department
export const hrItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/admin/hr/overview", icon: LayoutDashboard },
  { id: "task-management", title: "Task Management", url: "/admin/hr/task-management", icon: ClipboardList },
  { id: "attendance", title: "Team Feedback", url: "/admin/hr/attendance", icon: MessageSquare },
  {
    type: "group",
    key: "hr-hiring",
    title: "Hiring Management",
    icon: UserPlus,
    landingUrl: "/admin/hr/hiring",
    children: [
      { id: "employees", title: "Employee Hub", url: "/admin/hr/employees", icon: Users },
      { id: "onboarding", title: "Employee Onboarding", url: "/admin/hr/onboarding", icon: Briefcase },
      { id: "offboarding", title: "Employee Offboarding", url: "/admin/hr/offboarding", icon: UserCog },
      { id: "payslips", title: "Payslips", url: "/admin/hr/payslips", icon: Receipt },
    ],
  },
  { id: "documents", title: "Document Storage", url: "/admin/hr/documents", icon: FileText },
  { id: "user-management", title: "User Management", url: "/admin/hr/user-management", icon: UserCheck },
];

// GTM Department
export const gtmItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/gtm", icon: LayoutDashboard },
  { id: "inbox", title: "LinkedIn Inbox", url: "/gtm/inbox", icon: MessageSquare },
  { id: "email", title: "Email Inbox", url: "/gtm/email", icon: MessageSquare },
  { id: "campaigns", title: "Campaigns", url: "/gtm/campaigns", icon: Radio },
  { id: "senders", title: "Senders", url: "/gtm/senders", icon: Users },
  { id: "activity-feed", title: "Activity Feed", url: "/gtm/activity-feed", icon: Activity },
  { id: "reporting", title: "Reporting", url: "/gtm/reporting", icon: BarChart3 },
];

// CEO Department — Marcus + can_view_ceo_dashboard holders. "Projects" (13 Sep
// 2026) also follows can_view_projects on its own: a holder without CEO
// access sees this department with only that entry.
export const ceoItems: NavEntry[] = [
  // 14 Oct 2026 (the owner): the CEO department is Projects plus a Tools dropdown.
  // The metric tabs (Overview, Sales, Client Health, Fulfilment, HR & Hiring,
  // Finance) and the Meetings hub are gone; those numbers live on the Sheets.
  { id: "projects", title: "Projects", url: "/admin/ceo/projects", icon: FolderKanban, dotColor: "#9e9e9e" },
  {
    type: "group",
    key: "ceo-tools",
    title: "Tools",
    icon: Wrench,
    children: [
      { id: "event-bookings", title: "Kronos", url: "/admin/ceo/event-bookings", icon: CalendarClock, dotColor: "#9e9e9e" },
      { id: "form-builder", title: "Enquire", url: "/admin/forms", icon: FileText, dotColor: "#9e9e9e" },
      { id: "invoices", title: "Invoice generator", url: "/admin/ceo/invoices", icon: Receipt, dotColor: "#7d8a99" },
      { id: "referrals", title: "Referrals", url: "/admin/ceo/referrals", icon: Handshake, dotColor: "#a3a3a8" },
    ],
  },
];

// Ops Command — dedicated workspace for Ops leadership (Elena)
// Rendered in place of the CEO department for users with can_view_ops_command
// but without full CEO access. 11 Sep (the owner): Meetings lives in the CEO
// department only, and the old Hiring board is retired in favour of
// Talent Acquisition → Candidate Tracking, so neither is listed here.
export const opsCommandItems: NavEntry[] = [
  // 14 Oct 2026 (the owner, Elena's walkthrough): two groups. Employee Management
  // holds the people work; Tools holds Enquire, her own Kronos door and the
  // payslip generator. Metrics (on the Sheet now), AE Oversight (no AEs) and
  // the duplicate Employee Hub (it lives in Human Resources) are gone;
  // Performance Review is hidden in case it comes back.
  {
    type: "group",
    key: "oc-people",
    title: "Employee Management",
    icon: Users,
    landingUrl: "/ops-command/talent-acquisition",
    children: [
      { id: "talent-acquisition", title: "Talent Acquisition", url: "/ops-command/talent-acquisition", icon: UserSearch, dotColor: "#dedede" },
      { id: "attendance", title: "Attendance", url: "/ops-command/attendance", icon: ClipboardCheck, dotColor: "#dedede" },
      { id: "leave", title: "Employee Leave", url: "/ops-command/leave", icon: CalendarOff, dotColor: "#dedede" },
      // 16 Oct 2026 (the owner): meeting-ready leads from trial day, booked from here.
      { id: "trialist-leads", title: "Trialist leads", url: "/ops-command/trialist-leads", icon: FlaskConical, dotColor: "#dedede" },
    ],
  },
  {
    type: "group",
    key: "oc-tools",
    title: "Tools",
    icon: Wrench,
    children: [
      { id: "form-builder", title: "Enquire", url: "/admin/forms", icon: FileText, dotColor: "#dedede" },
      { id: "kronos", title: "Kronos", url: "/ops-command/kronos", icon: CalendarClock, dotColor: "#dedede" },
      { id: "payslips", title: "Payslip generator", url: "/ops-command/payslips", icon: Receipt, dotColor: "#dedede" },
    ],
  },
];



// Ops Assistant navigation items
export const opsAssistantItems: NavEntry[] = [
  { id: "dashboard", title: "Dashboard", url: "/ops-assistant", icon: LayoutDashboard },
  { id: "tasks", title: "Tasks & Responsibilities", url: "/tasks", icon: ClipboardCheck },
  { id: "metrics-input", title: "Metrics Input", url: "/ops-assistant/metrics", icon: ClipboardCheck },
];

// AE-specific navigation items
export const aeItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/admin", icon: LayoutDashboard },
  { id: "tasks", title: "Tasks & Responsibilities", url: "/tasks", icon: ClipboardCheck },
  { id: "discovery-calls", title: "Discovery Calls", url: "/ae/discovery-calls", icon: Phone },
  { id: "follow-up-calls", title: "Follow-Up Calls", url: "/ae/follow-up-calls", icon: PhoneCall },
  { id: "commissions", title: "Commissions", url: "/ae/commissions", icon: DollarSign },
  { id: "leaderboard", title: "Leaderboard", url: "/ae/leaderboard", icon: Trophy },
  { id: "achievements", title: "Achievements", url: "/ae/achievements", icon: Award },
  { id: "sales-tools", title: "Sales Tools", url: "/admin/sales/sales-tools", icon: Briefcase },
  { id: "demo-portal", title: "Portal Demo", url: "/ae/demo-portal", icon: Rocket },
  { id: "metrics", title: "Metrics", url: "/ae/metrics", icon: BarChart3 },
  { id: "forms", title: "Forms", url: "/forms", icon: ClipboardList },
];

// Admin user acting as a closer (Sales → Closers View)
export const adminClosersItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/admin", icon: LayoutDashboard },
  { id: "discovery-calls", title: "Discovery Calls", url: "/ae/discovery-calls", icon: Phone },
  { id: "follow-up-calls", title: "Follow-Up Calls", url: "/ae/follow-up-calls", icon: PhoneCall },
  { id: "metrics", title: "Metrics", url: "/ae/metrics", icon: BarChart3 },
];

// CSM Command Centre navigation (flat, in workflow order)
export const csmItems: NavEntry[] = [
  // 14 Oct 2026 (the owner): Client Health, Appointment Scoring, Metrics and
  // Reporting are gone; Daniel works from Clients, Onboarding, Offboarding,
  // Setter Management and Appointments.
  { id: "overview", title: "Overview", url: "/csm", icon: LayoutDashboard },
  { id: "tasks", title: "Tasks & Responsibilities", url: "/tasks", icon: ClipboardCheck },
  { id: "clients", title: "Clients", url: "/csm/clients", icon: Users },
  { id: "onboarding", title: "Onboarding", url: "/csm/onboarding", icon: UserPlus },
  { id: "offboarding", title: "Offboarding", url: "/csm/offboarding", icon: UserCog },
  { id: "setters", title: "Setter Management", url: "/csm/setters", icon: UserCheck },
  { id: "meetings", title: "Appointments", url: "/csm/meetings", icon: Calendar },
  { id: "resources", title: "Resources", url: "/csm/resources", icon: FolderOpen },
  { id: "forms", title: "Forms", url: "/forms", icon: ClipboardList },
];

// SDR Manager navigation items (mirrors Operations grouped layout)
export const sdrManagerItems: NavEntry[] = [
  // 14 Oct 2026 (the owner): Morning Meeting, Client Health, Appointment Scoring,
  // Leaderboard, Achievements, the AE bench, Performance (PIP), Performance
  // Review, Hiring Pipeline and Metrics & Insights are gone. Coaching is
  // Training & 1-to-1s. Offboarding (scoped to the manager's setters) joins
  // Setter Management.
  { id: "overview", title: "Overview", url: "/sdr-manager", icon: LayoutDashboard },
  { id: "tasks", title: "Tasks & Responsibilities", url: "/tasks", icon: ClipboardCheck },
  {
    type: "group",
    key: "sdr-setters",
    title: "Setter Management",
    icon: UserCheck,
    landingUrl: "/sdr-manager/setters",
    children: [
      { id: "meetings", title: "Appointments", url: "/sdr-manager/meetings", icon: Calendar },
      { id: "onboarding", title: "Onboarding", url: "/sdr-manager/onboarding", icon: UserPlus },
      { id: "offboarding", title: "Offboarding", url: "/sdr-manager/offboarding", icon: UserCog },
    ],
  },
  {
    type: "group",
    key: "sdr-management",
    title: "Management",
    icon: Briefcase,
    landingUrl: "/sdr-manager/coaching",
    children: [
      { id: "coaching", title: "Training & 1-to-1s", url: "/sdr-manager/coaching", icon: MessageSquare },
      { id: "attendance", title: "Team Feedback", url: "/sdr-manager/attendance", icon: ClipboardCheck },
    ],
  },
  { id: "forms", title: "Forms", url: "/forms", icon: ClipboardList },
];

// Setter items are dynamic based on department
export const getSetterItems = (department?: string): NavEntry[] => {
  const baseItems: NavEntry[] = [
    { id: "overview", title: "Overview", url: "/setter", icon: LayoutDashboard },
    { id: "tasks", title: "Tasks & Responsibilities", url: "/tasks", icon: ClipboardCheck },
    { id: "coaching", title: "Training", url: "/setter/coaching", icon: MessageSquare },
  ];

  if (department === "fulfilment") {
    baseItems.push({ id: "client-responsibility", title: "Assigned Clients", url: "/setter/client-responsibility", icon: Briefcase });
  }

  baseItems.push(
    { id: "meetings", title: "Appointments", url: "/setter/meetings", icon: Calendar },
    { id: "warm-leads", title: "Warm Leads", url: "/setter/warm-leads", icon: Flame },
    { id: "enrichment", title: "Tools", url: "/setter/enrichment", icon: Wrench },
    { id: "forms", title: "Forms", url: "/forms", icon: ClipboardList }
  );

  return baseItems;
};

export const clientItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/client/dashboard", icon: LayoutDashboard },
  { id: "meetings", title: "Meetings", url: "/client/meetings", icon: Calendar },
  { id: "warm-leads", title: "Warm Leads", url: "/client/warm-leads", icon: Flame },
  { id: "lead-lists", title: "Lead Lists", url: "/client/lead-lists", icon: FileText },
  { id: "onboarding", title: "Onboarding", url: "/client/onboarding", icon: Rocket },
  { id: "metrics", title: "Metrics", url: "/client/metrics", icon: BarChart3 },
  { id: "communications", title: "Communications", url: "/client/communications", icon: MessageSquare },
  { id: "documents", title: "Documents", url: "/client/documents", icon: Receipt },
];

// Partnerships Portal (external partner users)
export const partnerItems: NavEntry[] = [
  { id: "overview", title: "Overview", url: "/partnerships/dashboard", icon: LayoutDashboard },
  { id: "references", title: "References", url: "/partnerships/references", icon: Handshake },
  { id: "documents", title: "Documents", url: "/partnerships/documents", icon: FileText },
  { id: "details", title: "Your details", url: "/partnerships/details", icon: Landmark },
];


export const DEPARTMENT_NAV_MAP: Record<Department, NavEntry[]> = {
  sales: salesItems,
  operations: operationsItems,
  accounting: accountingItems,
  hr: hrItems,
  gtm: gtmItems,
  ceo: ceoItems,
  ops_command: opsCommandItems,
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  sales: "Sales",
  operations: "Operations",
  accounting: "Accounting",
  hr: "Human Resources",
  gtm: "GTM",
  ceo: "CEO",
  ops_command: "Ops Command",
};

export const DEPARTMENT_DEFAULT_ROUTES: Record<Department, string> = {
  sales: "/admin",
  operations: "/admin/operations/dashboard",
  accounting: "/admin/accounting/overview",
  hr: "/admin/hr/overview",
  gtm: "/gtm",
  ceo: "/admin/ceo/projects",
  ops_command: "/ops-command/talent-acquisition",
};

export const AE_DEPARTMENTS: Department[] = ['sales'];
export const CSM_DEPARTMENTS: Department[] = ['operations'];
export const ACCOUNTING_DEPARTMENTS: Department[] = ['accounting'];
export const HR_DEPARTMENTS: Department[] = ['hr'];
export const GTM_DEPARTMENTS: Department[] = ['gtm'];

/** Role → the label shown under the signed-in person's name. */
export const ROLE_LABELS: Record<string, string> = {
  dev: "Dev",
  admin: "Admin",
  ops: "Ops",
  ops_assistant: "Ops Assistant",
  finance: "Finance",
  accounting: "Accounting",
  hr: "HR",
  csm: "CSM",
  sdr_manager: "SDR Manager",
  account_executive: "Account Executive",
  setter: "Setter",
  gtm_engineer: "GTM Engineer",
  talent_acquisition: "Talent Acquisition",
  partner: "Partner",
  trialist: "Trialist",
  client: "Client",
};

const ALL_NAV_LISTS: NavEntry[][] = [
  salesItems,
  operationsItems,
  accountingItems,
  hrItems,
  gtmItems,
  ceoItems,
  opsCommandItems,
  opsAssistantItems,
  aeItems,
  adminClosersItems,
  csmItems,
  sdrManagerItems,
  getSetterItems("fulfilment"),
  getSetterItems("acquisition"),
  clientItems,
  partnerItems,
];

const FIXED_TITLES: Record<string, string> = {
  "/admin": "Overview",
  "/csm": "Overview",
  "/setter": "Overview",
  "/sdr-manager": "Overview",
  "/gtm": "Overview",
  "/ops-assistant": "Dashboard",
  "/tasks": "Tasks & Responsibilities",
  "/forms": "Forms",
  "/leave": "Leave",
  "/dev": "Dev Centre",
  "/admin/settings": "Settings",
  "/setter/settings": "Settings",
  "/client/settings": "Settings",
  "/csm/settings": "Settings",
  "/ops-assistant/settings": "Settings",
  "/partnerships/settings": "Settings",
};

const humanise = (segment: string): string =>
  segment
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/**
 * The page name for the top-bar breadcrumb: the nav entry whose url matches
 * the path (demo paths are mapped back to their real portal first), else a
 * fixed title, else the last path segment humanised.
 */
export function pageTitleForPath(pathname: string): string {
  const p = (pathname || "/")
    .replace(/\/$/, "")
    .replace(SETTER_DEMO_BASE, "/setter")
    .replace(CLIENT_DEMO_BASE, "/client");
  if (FIXED_TITLES[p]) return FIXED_TITLES[p];
  for (const list of ALL_NAV_LISTS) {
    for (const entry of list) {
      if (isGroup(entry)) {
        if (entry.landingUrl === p) return entry.title;
        const child = entry.children.find((c) => c.url === p);
        if (child) return child.title;
      } else if (entry.url === p) {
        return entry.title;
      }
    }
  }
  const last = p.split("/").filter(Boolean).pop() || "";
  // UUIDs and numeric ids are detail pages: name the parent instead.
  if (!last || /^[0-9a-f-]{8,}$/i.test(last)) {
    const parent = p.split("/").filter(Boolean).slice(-2, -1)[0] || "";
    return parent ? humanise(parent) : "Overview";
  }
  return humanise(last);
}
