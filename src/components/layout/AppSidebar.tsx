import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSetterOutboundReplies } from "@/hooks/useSetterOutboundReplies";
import { useNewCandidatesCount } from "@/hooks/useNewCandidatesCount";
import { usePushedTrialLeadsCount, useTrialLeadsToReviewCount } from "@/hooks/useTrialDay";
import { useOnboardingActiveCount } from "@/hooks/useOnboardingActiveCount";
import { useClientJourneyGate } from "@/hooks/useClientJourney";
import { useAeNeedsOutcomeCount } from "@/hooks/useAeNeedsOutcomeCount";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDepartment, Department } from "@/contexts/DepartmentContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  ACTING_HOME,
  ACTING_LABELS,
  ACTING_OPTIONS,
  SETTER_DEMO_BASE,
  CLIENT_DEMO_BASE,
  actingSetterDepartment,
  isDemoActingRole,
} from "@/lib/actingAs";
import {
  type NavEntry,
  type NavGroup,
  isGroup,
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
  getSetterItems,
  clientItems,
  partnerItems,
  DEPARTMENT_NAV_MAP,
  DEPARTMENT_LABELS,
  DEPARTMENT_DEFAULT_ROUTES,
  AE_DEPARTMENTS,
  CSM_DEPARTMENTS,
  ACCOUNTING_DEPARTMENTS,
  HR_DEPARTMENTS,
  GTM_DEPARTMENTS,
  ROLE_LABELS,
} from "./navConfig";
import { isCEOUser } from "@/lib/ceo";
import { useCanViewCEO, useCapability } from "@/hooks/useCapability";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useSdrManagerScope } from "@/hooks/useSdrManagerScope";
import { SidebarSkeleton } from "./SidebarSkeleton";
import { ReportIssueButton } from "@/components/dev/ReportIssueButton";
import logoWhite from "@/assets/vexon-logo-white.svg";
import logoGradient from "@/assets/vexon-logo-dark.svg";
import { DEPARTMENT_THEMES, resolveDepartmentKey } from "@/lib/departmentTheme";

interface AppSidebarProps {
  role: "admin" | "setter" | "client" | "partner";
}


/* ----------------------------------------------------------------- */
/*                       Group renderer (collapsible)                 */
/* ----------------------------------------------------------------- */

interface NavGroupRowProps {
  group: NavGroup;
  isCollapsed: boolean;
  currentPath: string;
  onNavigate: (url: string) => void;
}

const NavGroupRow = ({ group, isCollapsed, currentPath, onNavigate }: NavGroupRowProps) => {
  const hasActiveChild = group.children.some((c) => c.url === currentPath);
  const isOnLanding = !!group.landingUrl && currentPath === group.landingUrl;
  const isParentActive = hasActiveChild || isOnLanding;
  const [open, setOpen] = usePersistedState<boolean>(`sidebar-group-${group.key}-open`, false);
  // Auto-expand when on a child route. When on landing page, leave it to the user.
  const isOpen = hasActiveChild || open;

  // Collapsed icon-rail mode: clicking the icon navigates to landingUrl (or first child).
  if (isCollapsed) {
    const target = group.landingUrl || group.children[0]?.url || "#";
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => onNavigate(target)}
          isActive={isParentActive}
          className={
            isParentActive
              ? "rr-nav-active"
              : "rr-nav-idle"
          }
          tooltip={group.title}
        >
          <group.icon className="rr-nav-ic stroke-[1.75]" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const parentClass = isParentActive
    ? "rr-nav-active"
    : "rr-nav-idle";

  // Render: when landingUrl exists, the row is a navigable button + a SEPARATE chevron toggle.
  // When no landingUrl, the whole row toggles (legacy behavior).
  if (group.landingUrl) {
    return (
      <SidebarMenuItem>
        <Collapsible open={isOpen} onOpenChange={setOpen}>
          <div className={`flex items-center w-full ${parentClass}`}>
            <button
              type="button"
              onClick={() => onNavigate(group.landingUrl!)}
              className="flex-1 flex items-center gap-[9px] text-left min-w-0"
            >
              <group.icon className="rr-nav-ic stroke-[1.75] shrink-0" />
              <span className="truncate">{group.title}</span>
            </button>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={isOpen ? `Collapse ${group.title}` : `Expand ${group.title}`}
                className="p-1 rounded hover:bg-msp-surf3 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <SidebarMenuSub className="mx-0 border-0 px-0 translate-x-0 gap-0.5">
              {group.children.map((child) => {
                const active = currentPath === child.url;
                return (
                  <SidebarMenuSubItem key={child.id}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={active}
                      className={`rr-nav-sub ${active ? "rr-nav-active" : "rr-nav-idle"}`}
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate(child.url)}
                        className="w-full flex items-center gap-[9px] text-left min-w-0"
                      >
                        <child.icon className="rr-nav-ic stroke-[1.75]" />
                        <span className="truncate">{child.title}</span>
                      </button>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>
    );
  }

  // No landing page — whole row toggles dropdown.
  return (
    <SidebarMenuItem>
      <Collapsible open={isOpen} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className={parentClass}>
            <group.icon className="rr-nav-ic stroke-[1.75]" />
            <span className="flex-1 text-left truncate">{group.title}</span>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 border-0 px-0 translate-x-0 gap-0.5">
            {group.children.map((child) => {
              const active = currentPath === child.url;
              return (
                <SidebarMenuSubItem key={child.id}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={active}
                    className={`rr-nav-sub ${active ? "rr-nav-active" : "rr-nav-idle"}`}
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate(child.url)}
                      className="w-full flex items-center gap-[9px] text-left min-w-0"
                    >
                      <child.icon className="rr-nav-ic stroke-[1.75]" />
                      <span className="truncate">{child.title}</span>
                    </button>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
};

/* ----------------------------------------------------------------- */

export function AppSidebar({ role }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, toggleSidebar, isMobile } = useSidebar();
  const { selectedDepartment, setSelectedDepartment } = useDepartment();
  const { user, userRole, userRoles, isLoading: isAuthLoading, actingAs, canActAs, setActingAs } = useAuth();
  const { has: canViewCEO } = useCanViewCEO();
  const { has: canViewOpsCommand, isLoading: isOpsCommandCapabilityLoading } = useCapability("can_view_ops_command");
  // Projects tab (13 Sep 2026): can_view_projects opens the CEO department
  // slot with just the Projects entry for holders who lack full CEO access.
  const { has: canViewProjects } = useCapability("can_view_projects");
  const hasCeoAccess = isCEOUser(user?.id) || canViewCEO;
  const isProjectsOnlySlot = !hasCeoAccess && canViewProjects;
  const { selectedWorkspace } = useWorkspace();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const {
    departments: sdrManagerDepartments,
    activeScope: sdrManagerScope,
    setActiveScope: setSdrManagerScope,
    isMultiDepartment: isSdrMultiDepartment,
  } = useSdrManagerScope();
  // Ops Command is a capability, not a person (8 Sep 2026): the slot follows
  // can_view_ops_command wherever it is granted — no user-id binding.
  const isOpsUser = userRole === "ops";
  const isOpsCommandSlot = canViewOpsCommand;

  // Fetch setter department for dynamic navigation
  const { data: setterProfile } = useQuery({
    queryKey: ['setter-sidebar-profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('setters_profiles')
        .select('department')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: role === 'setter'
  });

  // Setter demo surface (3 Sep): an admin acting as SDR has no setters_profiles
  // row, so the department that shapes the nav comes from the hat instead.
  const isSetterDemo = location.pathname.startsWith(SETTER_DEMO_BASE);
  const isClientDemo = location.pathname.startsWith(CLIENT_DEMO_BASE);
  const setterDepartment = isSetterDemo
    ? (actingSetterDepartment(actingAs) ?? 'fulfilment')
    : setterProfile?.department;

  const { data: outboundData } = useSetterOutboundReplies(
    role === 'setter' && setterProfile?.department === 'acquisition' && user?.id === '42292222-46a0-4b2c-85b8-ecf3fca6415b' ? user?.id : undefined
  );
  const unactionedReplyCount = outboundData?.unactionedCount || 0;

  const { data: journeyActive } = useClientJourneyGate(role === "client");
  const { data: onboardingActiveCount } = useOnboardingActiveCount(userRole === "csm" || actingAs === "csm");
  const onboardingBadgeCount = onboardingActiveCount || 0;

  const { data: aeNeedsOutcome } = useAeNeedsOutcomeCount(
    user?.id,
    userRole === "account_executive" || userRole === "admin" || userRole === "dev",
    userRole === "admin" || userRole === "dev",
  );
  const aeNeedsOutcomeCount = aeNeedsOutcome || 0;

  const { data: newCandidates } = useNewCandidatesCount(user?.id, isOpsCommandSlot);
  const newCandidatesCount = newCandidates || 0;

  // CEO's HR & Hiring badge: how many candidates have an LCT booked and
  // waiting for him (Run 5). Gated to CEO-visible sidebars only.

  // Trial Day (15 Sep): Daniel's Appointments pill = trialist leads waiting
  // for QA; a setter's Appointments pill = leads pushed to them, still to book.
  const { data: trialToReview } = useTrialLeadsToReviewCount(userRole === "csm" || actingAs === "csm");
  const trialToReviewCount = trialToReview || 0;
  const { data: pushedToMe } = usePushedTrialLeadsCount(user?.id, role === "setter" && userRole === "setter");
  const pushedToMeCount = pushedToMe || 0;

  const { data: userDepartmentAccess } = useQuery({
    queryKey: ['user-department-access', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_department_access')
        .select('department')
        .eq('user_id', user.id);
      if (error) return null;
      return data?.map(d => d.department as Department) || null;
    },
    enabled: !!user?.id && role !== 'client' && role !== 'partner'
  });

  // Footer: the signed-in person (name + avatar from profiles).
  const { data: meProfile } = useQuery({
    queryKey: ['sidebar-me-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  const [deptMenuOpen, setDeptMenuOpen] = useState(false);

  // Enforce AE restriction - lock to Sales
  useEffect(() => {
    if (userRole === 'account_executive' && selectedDepartment !== 'sales') {
      setSelectedDepartment('sales');
      navigate('/admin');
    }
  }, [userRole, selectedDepartment, setSelectedDepartment, navigate]);

  // Acting as CSM (3 Sep): same landing discipline as a real CSM — anything
  // outside the CSM portal (bar the shared Forms/Tasks/Leave pages) goes back
  // to /csm. "Switch back to Admin" clears the hat before navigating, so this
  // never fights the way out.
  // The demo hats (setter, client) get the same treatment: wandering onto an
  // admin page while "Acting as SDR" would show admin chrome under a setter
  // chip, so those paths go to the demo home instead.
  useEffect(() => {
    if (!actingAs) return;
    const p = location.pathname;
    const shared = p === '/leave' || p === '/forms' || p === '/tasks';
    if (shared) return;
    if (actingAs === 'csm' && !p.startsWith('/csm')) {
      navigate('/csm');
    } else if (isDemoActingRole(actingAs)) {
      const base = actingAs === 'client' ? CLIENT_DEMO_BASE : SETTER_DEMO_BASE;
      const realBase = actingAs === 'client' ? '/client' : '/setter';
      // ProtectedRoute already turns real portal paths into their demo twin.
      if (!p.startsWith(base) && !p.startsWith(realBase)) navigate(ACTING_HOME[actingAs]);
    }
  }, [actingAs, location.pathname, navigate]);

  useEffect(() => {
    if (userRole === 'csm') {
      const hasMultiDeptAccess = userDepartmentAccess && userDepartmentAccess.length > 1;
      if (!hasMultiDeptAccess && selectedDepartment !== 'operations') {
        setSelectedDepartment('operations');
      }
      if (
        selectedDepartment === 'operations' &&
        !location.pathname.startsWith('/csm') &&
        location.pathname !== '/leave' &&
        location.pathname !== '/forms' &&
        location.pathname !== '/tasks'
      ) {
        navigate('/csm');
      }
    }
  }, [userRole, selectedDepartment, setSelectedDepartment, navigate, location.pathname, userDepartmentAccess]);

  useEffect(() => {
    if ((userRole === 'accounting' || userRole === 'finance') && selectedDepartment !== 'accounting') {
      setSelectedDepartment('accounting');
      navigate('/admin/accounting/overview');
    }
  }, [userRole, selectedDepartment, setSelectedDepartment, navigate]);

  useEffect(() => {
    if (userRole === 'hr' && selectedDepartment !== 'hr') {
      setSelectedDepartment('hr');
      navigate('/admin/hr/overview');
    }
  }, [userRole, selectedDepartment, setSelectedDepartment, navigate]);

  useEffect(() => {
    if (userRole === 'gtm_engineer' && selectedDepartment !== 'gtm') {
      setSelectedDepartment('gtm');
      navigate('/gtm');
    }
  }, [userRole, selectedDepartment, setSelectedDepartment, navigate]);

  useEffect(() => {
    if (userRole === 'ops_assistant' && !location.pathname.startsWith('/ops-assistant')) {
      navigate('/ops-assistant');
    }
  }, [userRole, location.pathname, navigate]);

  useEffect(() => {
    if (!isOpsCommandSlot || !location.pathname.startsWith('/ops-command')) return;
    if (selectedDepartment !== 'ops_command') {
      setSelectedDepartment('ops_command');
    }
  }, [isOpsCommandSlot, location.pathname, selectedDepartment, setSelectedDepartment]);
  // ---------------- /enforcement effects ----------------

  const { data: userTabRestrictions } = useQuery({
    queryKey: ['user-tab-restrictions', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('user_tab_restrictions')
        .select('department, hidden_tabs')
        .eq('user_id', user.id);
      if (error) return null;
      const restrictionsMap: Record<string, string[]> = {};
      data?.forEach(row => {
        restrictionsMap[row.department] = row.hidden_tabs || [];
      });
      return restrictionsMap;
    },
    enabled: !!user?.id && !!userRole && !['admin', 'dev'].includes(userRole)
  });

  /** Filter NavEntries by hidden tab IDs. A group can be hidden wholesale by
   *  its key (that's the ID the access modal offers for group headers), and
   *  is otherwise kept only if at least one child remains. */
  const filterEntries = (entries: NavEntry[], hiddenTabs: string[]): NavEntry[] => {
    return entries
      .map((entry) => {
        if (isGroup(entry)) {
          if (hiddenTabs.includes(entry.key)) return null;
          const filteredChildren = entry.children.filter((c) => !hiddenTabs.includes(c.id));
          if (filteredChildren.length === 0) return null;
          return { ...entry, children: filteredChildren };
        }
        return hiddenTabs.includes(entry.id) ? null : entry;
      })
      .filter(Boolean) as NavEntry[];
  };

  /** Hide Forms tab for admin role specifically (still visible to dev/ops). */
  const hideFormsForAdmin = (entries: NavEntry[]): NavEntry[] => {
    if (userRole !== 'admin') return entries;
    return entries.filter((e) => isGroup(e) || e.id !== 'forms');
  };

  const getNavigationItems = (): NavEntry[] => {
    if (role === "partner") return partnerItems;
    if (role === "client") {
      // AE demo portal renders the real client shell at /ae/demo-portal/* —
      // remap nav targets so every click stays inside the demo (a
      // fixture-only surface; see AE_DEMO_PORTAL_REV2_DESIGN.md), and give
      // the AE a way back to their own portal when the demo is over.
      if (isClientDemo) {
        const remapped = clientItems.map((item) =>
          isGroup(item)
            ? item
            : { ...item, url: item.url.replace("/client/", `${CLIENT_DEMO_BASE}/`) },
        );
        // Acting as Client (3 Sep): the header chip is the way back, so the
        // AE-facing "Exit Demo" entry would only muddy the real client nav.
        // The AE demo (7 Sep) mirrors a client whose onboarding is complete,
        // so its Onboarding tab is hidden exactly as the live portal hides it.
        return actingAs === "client"
          ? remapped
          : [...remapped.filter((item) => isGroup(item) || item.id !== "onboarding"), { id: "exit-demo", title: "Exit Demo", url: "/admin", icon: LogOut }];
      }
      // The Onboarding tab exists only while their journey is running — once
      // the CSM releases them to the live portal it disappears (Daniel's
      // ruling, 26 Aug: "it can completely disappear").
      return journeyActive
        ? clientItems
        : clientItems.filter((item) => isGroup(item) || item.id !== "onboarding");
    }
    if (role === "setter") {
      const setterItems = getSetterItems(setterDepartment);
      // Setter demo surface (3 Sep): every click stays inside /demo/setter/*
      // so the acting admin never lands on the (empty) real setter routes.
      if (isSetterDemo) {
        return setterItems.map((item) =>
          isGroup(item) || !item.url.startsWith("/setter")
            ? item
            : { ...item, url: item.url.replace(/^\/setter/, SETTER_DEMO_BASE) },
        );
      }
      // Setter demo lens (/setter/demo, 3 Sep): one fixture page, so the nav
      // collapses to it plus a way out. Same idiom as the AE demo portal.
      if (location.pathname.startsWith("/setter/demo")) {
        return [
          { id: "overview", title: "Overview", url: "/setter/demo", icon: LayoutDashboard },
          { id: "exit-demo", title: "Exit Demo", url: "/admin", icon: LogOut },
        ];
      }
            return setterItems;
    }

    if (isOpsCommandSlot && selectedDepartment === 'ops_command') return opsCommandItems;
    if (isProjectsOnlySlot && selectedDepartment === 'ceo') {
      return ceoItems.filter((item) => !isGroup(item) && item.id === 'projects');
    }

    // Acting as CSM (3 Sep): the CSM Command nav, whole. The real-CSM branch
    // below keeps its department behaviour for genuine CSM logins.
    if (actingAs === 'csm') return csmItems;

    if (userRole === 'csm') {
      if (selectedDepartment === 'operations') return csmItems;
      let items = DEPARTMENT_NAV_MAP[selectedDepartment] || operationsItems;
      if (userTabRestrictions) {
        const hidden = userTabRestrictions[selectedDepartment] || [];
        if (hidden.length > 0) items = filterEntries(items, hidden);
      }
      return hideFormsForAdmin(items);
    }

    // actingAs (2 Sep): an admin/dev wearing another role's hat gets that
    // role's nav wholesale — the OR arms below. actingAs is null for
    // everyone else by construction (AuthContext), so these arms can never
    // fire for a real csm/sdr_manager/AE.
    if (userRole === 'sdr_manager' || actingAs === 'sdr_manager') {
      // 14 Oct 2026: nothing department-specific is left in this nav (Client
      // Health, Appointment Scoring and the AE bench are gone), so a single-
      // or dual-department manager sees the same list. The scope pill still
      // narrows the pages themselves.
      return sdrManagerItems;
    }
    if (userRole === 'account_executive' || actingAs === 'account_executive') return aeItems;
    if (userRole === 'gtm_engineer') return gtmItems;
    if (userRole === 'ops_assistant') return opsAssistantItems;

    if (userRole === 'admin' && selectedDepartment === 'sales' && selectedWorkspace === 'closers') {
      return adminClosersItems;
    }

    let items = DEPARTMENT_NAV_MAP[selectedDepartment] || operationsItems;

    if (selectedDepartment === 'sales' && selectedWorkspace === 'setters') {
      items = items.filter((item) => isGroup(item) || item.title !== 'Metrics');
    }

    if (userTabRestrictions && !['admin', 'dev'].includes(userRole || '')) {
      const hidden = userTabRestrictions[selectedDepartment] || [];
      if (hidden.length > 0) items = filterEntries(items, hidden);
    }

    return hideFormsForAdmin(items);
  };


  const getAvailableDepartments = (): Department[] => {
    // Canonical order: CEO first, then Ops Command (capability holders), then
    // Sales, Operations, Accounting, HR, GTM. CEO and Ops Command are
    // independent slots — Elena holds both (8 Sep 2026).
    const orderedAll: Department[] = ['ceo', 'ops_command', 'sales', 'operations', 'accounting', 'hr', 'gtm'];
    const orderBy = (arr: Department[]) => orderedAll.filter((d) => arr.includes(d));

    const hasCeoSlot = hasCeoAccess || canViewProjects;
    // 14 Oct 2026 (the owner): Accounting is hidden from everyone except the
    // accounting and finance roles (the Sheet replaced it; the finance login
    // keeps its door), and GTM is dev-only until it is rebuilt around Kit and
    // the Enquire leads.
    const roleCanSee = (d: Department) =>
      (d !== 'accounting' || userRole === 'accounting' || userRole === 'finance') &&
      (d !== 'gtm' || userRole === 'dev');
    if (userDepartmentAccess && userDepartmentAccess.length > 0) {
      const base = [...userDepartmentAccess];
      if (hasCeoSlot && !base.includes('ceo')) base.push('ceo');
      if (isOpsCommandSlot && !base.includes('ops_command')) base.push('ops_command');
      return orderBy(base).filter(roleCanSee);
    }
    if (userRole === 'csm') return CSM_DEPARTMENTS;
    if (userRole === 'account_executive') return AE_DEPARTMENTS;
    if (userRole === 'accounting' || userRole === 'finance') return ACCOUNTING_DEPARTMENTS;
    if (userRole === 'hr') return HR_DEPARTMENTS;
    if (userRole === 'gtm_engineer') return GTM_DEPARTMENTS;
    if (userRole === 'ops_assistant') return ['operations' as Department];
    // CEO and Ops Command slots each hide unless the user has that access.
    return orderedAll.filter(
      (d) => (d !== 'ceo' || hasCeoSlot) && (d !== 'ops_command' || isOpsCommandSlot) && roleCanSee(d),
    );
  };


  const items = getNavigationItems();
  const isCollapsed = state === "collapsed";
  const availableDepartments = getAvailableDepartments();
  // SDR managers never get the admin department switcher: their nav is the
  // sdr_manager list and their only switcher is the scope pill. Without this
  // guard, a dual-department manager's second user_department_access row
  // (Nadia post-flip: operations + sales) makes availableDepartments
  // multi-entry and surfaces the admin dropdown, which navigates into the
  // admin Sales/Operations dashboards.
  // Also hidden while acting as another role — the acting switcher replaces
  // it, and the acted role's nav has no department concept.
  const showDepartmentSelector =
    availableDepartments.length > 1 && userRole !== "sdr_manager" && !actingAs;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate(role === "partner" ? "/partnerships" : "/");
  };

  const isActive = (url: string) => location.pathname === url;

  const labelFor = (dept: Department) =>
    dept === 'operations' && (userRole === 'csm' || actingAs === 'csm')
      ? 'CSM Command'
      : dept === 'ceo' && isProjectsOnlySlot
        ? 'Projects'
        : DEPARTMENT_LABELS[dept];
  const routeFor = (dept: Department) =>
    dept === 'ceo' && isProjectsOnlySlot ? '/admin/ceo/projects' : DEPARTMENT_DEFAULT_ROUTES[dept];

  const handleDepartmentChange = (dept: Department) => {
    if (userRole === 'account_executive' && dept !== 'sales') return;
    if ((userRole === 'accounting' || userRole === 'finance') && dept !== 'accounting') return;
    if (userRole === 'hr' && dept !== 'hr') return;
    setSelectedDepartment(dept);
    if (userRole === 'csm') {
      if (dept === 'operations') navigate('/csm');
      else navigate(routeFor(dept));
      return;
    }
    navigate(routeFor(dept));
  };


  const meName =
    meProfile?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'You');
  const meInitials = meName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const meRole = userRole ? (ROLE_LABELS[userRole] ?? userRole) : '';
  const meRoleLine = actingAs ? `${meRole} · acting as ${ACTING_LABELS[actingAs]}` : meRole;

  const logo = (
    <div className="rr-sidebar-logo">
      <img src={resolvedTheme === 'light' ? logoGradient : logoWhite} alt="Vexon OS" />
    </div>
  );

  if (isAuthLoading || (isOpsUser && isOpsCommandCapabilityLoading)) {
    return (
      <Sidebar
        collapsible="icon"
        className="border-0"
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        <SidebarHeader className="px-3 pt-3 pb-0">{logo}</SidebarHeader>
        <SidebarContent className="py-2">
          <SidebarSkeleton />
        </SidebarContent>
      </Sidebar>
    );
  }

  const navCount = (n: number, urgent = false) =>
    n > 0 ? <span className={`rr-nav-count${urgent ? " is-urgent" : ""}`}>{n}</span> : null;

  return (
    <Sidebar
      collapsible="icon"
      className="border-0"
      style={{ background: "hsl(var(--sidebar-background))" }}
    >
      <SidebarHeader className="rr-sidebar-brand px-3 pt-3 pb-0 gap-0">
        {logo}

        {/* Acting-as switcher (2 Sep, extended 3 Sep): Marcus wears another
            role's hat from his own login. View switch only — identity,
            permissions and write attribution never change. Shown on the admin
            shell, and on whichever portal shell a hat has put him in so he can
            hop between hats without going back to Admin first. */}
        {/* Dev (the owner, 4 Sep): no hats, a Dev Centre button lives where the
            acting-as switcher sits for Marcus. Replaces the old floating
            "Developer" group at the foot of every department's nav. */}
        {!isCollapsed && userRoles.includes("dev") && !location.pathname.startsWith("/dev") && (
          <div className="pb-2">
            <button
              type="button"
              onClick={() => navigate("/dev")}
              className="rr-dev-btn"
            >
              <span><Rocket className="text-msp-lilac" /> Dev Centre</span>
              <ChevronRight className="text-msp-dim2" />
            </button>
          </div>
        )}

        {!isCollapsed && canActAs && (role === "admin" || actingAs) && (
          <div className="pb-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rr-dept-switch" aria-label="Acting as">
                  <span>
                    <span className="rr-sec !p-0">Acting as</span>
                    {actingAs ? ACTING_LABELS[actingAs] : "Admin"}
                  </span>
                  <ChevronDown className="text-msp-dim2" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60 bg-popover z-50">
                {ACTING_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.label}
                    onClick={() => {
                      setActingAs(opt.value);
                      navigate(opt.route);
                    }}
                    className={`cursor-pointer ${actingAs === opt.value ? "bg-msp-surf3 font-medium" : ""}`}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {!isCollapsed && role === "admin" && showDepartmentSelector && (
          <div className="pb-2">
            <DropdownMenu open={deptMenuOpen} onOpenChange={setDeptMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button className="rr-dept-switch" aria-label="Switch department">
                  <span>
                    <span className="rr-dept-dot" />
                    <span className="truncate">{labelFor(selectedDepartment)}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 bg-popover z-50">
                {availableDepartments.map((dept) => {
                  const theme = DEPARTMENT_THEMES[resolveDepartmentKey(routeFor(dept), dept)];
                  const current = selectedDepartment === dept;
                  return (
                    <DropdownMenuItem
                      key={dept}
                      onClick={() => handleDepartmentChange(dept)}
                      className={`cursor-pointer gap-2 ${current ? 'font-semibold bg-msp-surf3' : ''}`}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-[7px] w-[7px] rounded-full shrink-0"
                        style={{ backgroundColor: theme.accent }}
                      />
                      {labelFor(dept)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Scope pill — dual-department SDR managers only. Switches the
            department-aggregate surfaces (morning meeting, metrics, RAG,
            targets, team strip); person-level surfaces union and ignore it.
            Invisible to every single-department manager. */}
        {!isCollapsed && (userRole === "sdr_manager" || actingAs === "sdr_manager") && isSdrMultiDepartment && (
          <div className="pb-2">
            <div className="grid grid-cols-2 rounded-lg bg-msp-surf2 p-0.5">
              {sdrManagerDepartments.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSdrManagerScope(dept)}
                  className={
                    sdrManagerScope === dept
                      ? "px-2 py-1.5 rounded-md text-xs font-semibold bg-msp-surf3 text-foreground"
                      : "px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  }
                >
                  {dept === "fulfilment" ? "Fulfilment" : "Acquisition"}
                </button>
              ))}
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="py-0 gap-0">
        {role === "setter" && user?.id === "42292222-46a0-4b2c-85b8-ecf3fca6415b" && !isCollapsed && (
          <div className="px-3 pt-3">
            <button
              onClick={() => {
                localStorage.setItem("james_workspace_mode", "cold_outbound");
                navigate("/marketing");
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-msp-surf2 hover:bg-msp-surf3 transition-colors text-xs font-semibold text-msp-warn"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-msp-warn" />
              Switch to Marketing Hub
            </button>
          </div>
        )}
        <SidebarGroup className="p-0">
          {!isCollapsed && (
            <SidebarGroupLabel className="rr-sec">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-3 group-data-[collapsible=icon]:px-2">
              {items.map((entry) => {
                if (isGroup(entry)) {
                  return (
                    <NavGroupRow
                      key={entry.key}
                      group={entry}
                      isCollapsed={isCollapsed}
                      currentPath={location.pathname}
                      onNavigate={navigate}
                    />
                  );
                }
                const item = entry;
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.id || item.title}>
                    <SidebarMenuButton
                      onClick={() => navigate(item.url)}
                      isActive={active}
                      tooltip={isCollapsed ? item.title : undefined}
                      className={active ? "rr-nav-active" : "rr-nav-idle"}
                    >
                      <item.icon className="rr-nav-ic stroke-[1.75]" />
                      {!isCollapsed && (
                        <span className="rr-nav-label">
                          <span>{item.title}</span>
                          {item.title === "Warm Leads" && role === "setter" && setterProfile?.department === "acquisition" && (
                            navCount(unactionedReplyCount, true)
                          )}
                          {item.url === "/ae/discovery-calls" && (userRole === "account_executive" || userRole === "admin") && (
                            navCount(aeNeedsOutcomeCount, true)
                          )}
                          {item.url === "/ops-command/talent-acquisition" && navCount(newCandidatesCount)}
                          {item.url === "/csm/onboarding" && navCount(onboardingBadgeCount)}
                          {item.url === "/csm/meetings" && navCount(trialToReviewCount)}
                          {item.url === "/setter/meetings" && navCount(pushedToMeCount)}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Collapsed rail keeps a Dev Centre icon for dev (the expanded button lives at the top). */}
        {userRoles.includes("dev") && isCollapsed && !location.pathname.startsWith("/dev") && (
          <SidebarGroup className="p-0 pt-2">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5 px-2">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigate("/dev")}
                    tooltip="Dev Centre"
                    className="rr-nav-idle"
                  >
                    <Rocket className="rr-nav-ic stroke-[1.75] !text-msp-lilac !opacity-100" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-msp-line px-3 py-2 gap-0 group-data-[collapsible=icon]:px-2">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() =>
                navigate(
                  role === 'partner'
                    ? '/partnerships/settings'
                    : userRole === 'csm' || actingAs === 'csm'
                      ? '/csm/settings'
                      : userRole === 'ops_assistant'
                        ? '/ops-assistant/settings'
                        : isSetterDemo
                          ? `${SETTER_DEMO_BASE}/settings`
                          : `/${role}/settings`,
                )
              }
              tooltip={isCollapsed ? "Settings" : undefined}
              className="rr-nav-idle"
            >
              <Settings className="rr-nav-ic stroke-[1.75]" />
              {!isCollapsed && <span>Settings</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              tooltip={isCollapsed ? (resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
              className="rr-nav-idle"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="rr-nav-ic stroke-[1.75]" />
              ) : (
                <Moon className="rr-nav-ic stroke-[1.75]" />
              )}
              {!isCollapsed && (
                <span className="rr-nav-label">
                  <span>{resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                  <span
                    className="theme-toggle"
                    data-state={resolvedTheme === 'dark' ? 'dark' : 'light'}
                  />
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={toggleSidebar}
                tooltip={isCollapsed ? "Expand sidebar" : undefined}
                className="rr-nav-idle"
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="rr-nav-ic stroke-[1.75]" />
                ) : (
                  <PanelLeftClose className="rr-nav-ic stroke-[1.75]" />
                )}
                {!isCollapsed && <span>Collapse sidebar</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip={isCollapsed ? "Logout" : undefined}
              className="rr-nav-idle"
            >
              <LogOut className="rr-nav-ic stroke-[1.75]" />
              {!isCollapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ReportIssueButton collapsed={isCollapsed} />
        <div className="rr-me" title={meName}>
          <span className="rr-me-av" aria-hidden>
            {meProfile?.avatar_url ? <img src={meProfile.avatar_url} alt="" /> : meInitials}
          </span>
          <div className="min-w-0">
            <b>{meName}</b>
            {meRoleLine && <span>{meRoleLine}</span>}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
