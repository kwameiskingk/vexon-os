import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, StatStrip } from "@/components/ui-v2";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, Building2, Calendar, TrendingUp, Users, Upload, Image as ImageIcon, Loader2, AlertTriangle, Clock, Activity, Settings2, Target, CreditCard, BarChart3, FileText, List, Flame, Shield, Lock, FolderOpen, Wrench, Video, CalendarCheck, Quote, Repeat, Rocket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { STANDARD_COUNTRIES } from "@/lib/utils";
import { CampaignEditor } from "@/components/admin/CampaignEditor";
import { StipulationManager } from "@/components/admin/StipulationManager";
import { CreateCampaignModal } from "@/components/admin/CreateCampaignModal";
import { ClientPayments } from "@/components/admin/ClientPayments";
import { CredentialsLocker } from "@/components/admin/CredentialsLocker";
import { ClientAccountCreator } from "@/components/admin/ClientAccountCreator";
import { PendingMeetingsSection } from "@/components/admin/PendingMeetingsSection";
import { ClientActivityTimeline } from "@/components/admin/ClientActivityTimeline";
import { CampaignHealthCard } from "@/components/admin/CampaignHealthCard";
import { computeClientHealth, computeCampaignHealth, getHealthColorClasses, CampaignHealthData } from "@/lib/clientHealth";
import { ClientManagementTab } from "@/components/admin/ClientManagementTab";
import { ClientProfileWarmLeads } from "@/components/admin/ClientProfileWarmLeads";
import { ClientSourceMaterialsTab } from "@/components/admin/ClientSourceMaterialsTab";
import { ClientDocumentsTab } from "@/components/admin/ClientDocumentsTab";
import { AdminLeadListsTab } from "@/components/admin/AdminLeadListsTab";
import { WeeklyCatchupsTab } from "@/components/admin/WeeklyCatchupsTab";
import { ClientFinancialDetailsTab } from "@/components/admin/ClientFinancialDetailsTab";
import { ClientRenewalsSection } from "@/components/admin/ClientRenewalsSection";
import { ClientTermsVacanciesTab } from "@/components/admin/ClientTermsVacanciesTab";
import { ClientTestimonialsSection } from "@/components/csm/ClientTestimonialsSection";
import { ClientRenewalTab } from "@/components/renewal/ClientRenewalTab";
import { useAuth } from "@/contexts/AuthContext";
import { CampaignWeeklyGoals } from "@/components/admin/CampaignWeeklyGoals";
import { CampaignDatesCard } from "@/components/admin/CampaignDatesCard";
import { useNativeClientHealth } from "@/hooks/useNativeClientHealth";
import { ClientBookingsSection } from "@/components/clients/ClientBookingsSection";
import { ClientJourneySection } from "@/components/client-onboarding/ClientJourneySection";
import { LucideIcon } from "lucide-react";

type NavCategory = "operations" | "leads" | "finance" | "config";

interface NavItem {
  value: string;
  label: string;
  icon: LucideIcon;
  roleGuard?: boolean;
}

interface NavCategoryConfig {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_STRUCTURE: Record<NavCategory, NavCategoryConfig> = {
  operations: {
    label: "Operations",
    icon: Activity,
    items: [
      { value: "campaigns", label: "Campaigns", icon: Target },
      { value: "onboarding", label: "Onboarding", icon: Rocket },
      { value: "appointments", label: "Appointments", icon: CalendarCheck },
      { value: "metrics", label: "Metrics", icon: BarChart3 },
      { value: "terms_vacancies", label: "Terms & Vacancies", icon: FileText },
      { value: "stipulations", label: "Stipulations", icon: Shield },
      { value: "weekly_catchups", label: "Weekly Catch-ups", icon: Video },
      { value: "testimonials", label: "Testimonials", icon: Quote },
      // Shows proposed renewal pricing + contract value: csm/admin/ops/dev only.
      { value: "renewal", label: "Renewal", icon: Repeat, roleGuard: true },
    ],
  },
  leads: {
    label: "Leads",
    icon: Flame,
    items: [
      { value: "warm_leads", label: "Warm Leads", icon: Flame },
      { value: "lead_lists", label: "Lead Lists", icon: List },
    ],
  },
  finance: {
    label: "Finance",
    icon: CreditCard,
    items: [
      { value: "payments", label: "Payments", icon: CreditCard },
      { value: "financial_details", label: "Financial Details", icon: CreditCard },
    ],
  },
  config: {
    label: "Config",
    icon: Settings2,
    items: [
      { value: "source_materials", label: "Source Material", icon: FolderOpen },
      { value: "bookings", label: "Bookings", icon: CalendarCheck },
      { value: "credentials", label: "Credentials", icon: Lock },
      { value: "documents", label: "Documents", icon: FileText },
      { value: "management", label: "Management", icon: Wrench, roleGuard: true },
    ],
  },
};

function findCategoryForSection(section: string): NavCategory {
  for (const [cat, config] of Object.entries(NAV_STRUCTURE)) {
    if (config.items.some((item) => item.value === section)) {
      return cat as NavCategory;
    }
  }
  return "operations";
}

interface ClientProfileNavProps {
  activeCategory: NavCategory;
  activeSection: string;
  onCategoryChange: (cat: NavCategory) => void;
  onSectionChange: (section: string) => void;
  isCSMOrAdmin: boolean;
}

const ClientProfileNav = ({
  activeCategory,
  activeSection,
  onCategoryChange,
  onSectionChange,
  isCSMOrAdmin,
}: ClientProfileNavProps) => {
  const categories = Object.entries(NAV_STRUCTURE) as [NavCategory, NavCategoryConfig][];
  const activeCategoryConfig = NAV_STRUCTURE[activeCategory];
  const visibleItems = activeCategoryConfig.items.filter(
    (item) => !item.roleGuard || isCSMOrAdmin
  );

  return (
    <div className="space-y-3">
      {/* Primary Category Segments */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
        {categories.map(([key, config]) => {
          const isActive = activeCategory === key;
          const Icon = config.icon;
          return (
            <button
              key={key}
              onClick={() => onCategoryChange(key)}
              className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                transition-all duration-200 ease-in-out
                ${isActive
                  ? "bg-card text-foreground shadow-sm border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }
              `}
            >
              <Icon className="h-4 w-4" />
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Secondary Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-px">
        {visibleItems.map((item) => {
          const isActive = activeSection === item.value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              onClick={() => onSectionChange(item.value)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                border-b-2 transition-all duration-150 -mb-px
                ${isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }
              `}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface Client {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  industry: string | null;
  country: string | null;
  size: string | null;
  logo?: string;
  team_network_member?: boolean;
  status?: string;
  admin_notes?: string;
  health_override?: string | null;
}

interface ClientProfile {
  id: string;
  user_id: string | null;
  company_name: string;
  credentials_encrypted?: string | null;
  logo?: string;
  team_network_member?: boolean;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  meetings_booked: number;
  meetings_sat: number;
  meeting_target: number;
  calls_outbound: number;
  call_target: number;
  start_date: string | null;
  end_date: string | null;
  progress_manual_pct: number;
  launch_date?: string;
  campaign_number?: number;
}

const ClientProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { userRoles } = useAuth();
  const isCSMRoute = location.pathname.startsWith("/csm");
  const isCSMOrAdmin = userRoles.includes("csm") || userRoles.includes("admin") || userRoles.includes("dev") || userRoles.includes("ops");
  const backToClientsPath = isCSMRoute ? "/csm/clients" : "/admin/clients";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assignedSetterNames, setAssignedSetterNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [kpis, setKpis] = useState({
    meetingsBooked: 0,
    meetingsSat: 0,
    meetingsApproved: 0,
    meetingsRejected: 0,
    opportunities: 0,
    meetingRequirements: 0
  });
  const [opportunityMetrics, setOpportunityMetrics] = useState({
    opportunitiesWon: 0,
    totalVacancies: 0,
    totalValue: 0,
  });
  const [editingKpis, setEditingKpis] = useState(false);
  const [editingClientInfo, setEditingClientInfo] = useState(false);
  const [editedClient, setEditedClient] = useState<Client | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [meetingsLast7Days, setMeetingsLast7Days] = useState(0);
  const [meetingsLast14Days, setMeetingsLast14Days] = useState(0);
  const [healthOverrideOpen, setHealthOverrideOpen] = useState(false);
  const [campaignMeetingsMap, setCampaignMeetingsMap] = useState<Record<string, number>>({});
  const [clientAccountStatus, setClientAccountStatus] = useState<{ hasAccount: boolean; onboarded: boolean }>({
    hasAccount: false,
    onboarded: false,
  });

  // Native Client Health snapshot — used to sync the profile header
  // (Revenue / Opportunities / Vacancies) so it matches the Client Health tab exactly.
  // 14 Oct 2026 (the owner: "why does a client profile take so long to open").
  // The health rows are the same computation the client list runs; reuse its
  // cached result (60 s) instead of recomputing all six source tables with
  // staleTime 0 on every open.
  const { data: healthData, dataUpdatedAt: healthUpdatedAt } = useNativeClientHealth();
  const healthSnapshot = healthData
    ? { rows: healthData.rows, fetchedAt: new Date(healthUpdatedAt).toISOString() }
    : undefined;
  const snapshotRow = healthSnapshot?.rows?.find((r) => r.clientProfileId === id) || null;

  // Parse initial section from URL hash
  const initialSection = location.hash ? location.hash.slice(1) : "campaigns";
  const initialCategory = findCategoryForSection(initialSection);
  const [activeCategory, setActiveCategory] = useState<NavCategory>(initialCategory);
  const [activeSection, setActiveSection] = useState(initialSection);

  useEffect(() => {
    if (id) {
      loadClientData();
    }
  }, [id]);

  const loadClientData = async () => {
    try {
      // Everything below depends only on the id, so it all runs at once
      // (it used to run one query after another, with an edge-function cold
      // start in the middle).
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const rosterSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [clientRes, statusRes, campaignsRes, sAssignmentsRes, rosterRes, recentRes, allMeetingsRes] = await Promise.all([
        supabase.from("client_profiles").select("*").eq("id", id).single(),
        supabase.functions.invoke("client-account-status", { body: { clientProfileId: id } }).catch((err: unknown) => ({ data: null, error: err })),
        supabase.from("campaigns").select("*").eq("client_id", id).order("campaign_number", { ascending: false }),
        supabase.from('setter_client_assignments').select('setter_id').eq('client_id', id!).eq('status', 'active'),
        supabase.from('roster_entries').select('setter_profile_id').eq('client_profile_id', id!).gte('roster_date', rosterSince),
        supabase.from("meetings").select("meeting_date, campaign_id").eq("client_profile_id", id).gte("meeting_date", fourteenDaysAgo.toISOString().split('T')[0]),
        // Only the columns the KPI tiles read; the old select("*") pulled every column of every meeting.
        supabase.from("meetings").select("attendance_status, approved_by_admin, status, client_outcome, vacancies_won, vacancies_value").or(`client_id.eq.${id},client_profile_id.eq.${id}`),
      ]);

      if (clientRes.error) throw clientRes.error;
      const clientData = clientRes.data;
      setClient(clientData);
      setNotes((clientData as any).admin_notes || "");

      // Client account setup status (created vs onboarded)
      if (statusRes.error) {
        console.error("Failed to load client account status", statusRes.error);
        setClientAccountStatus({ hasAccount: false, onboarded: false });
      } else {
        const statusData = statusRes.data as { hasAccount?: boolean; onboarded?: boolean } | null;
        setClientAccountStatus({
          hasAccount: !!statusData?.hasAccount,
          onboarded: !!statusData?.onboarded,
        });
      }

      setClientProfile(clientData as any);
      setCampaigns(campaignsRes.data || []);

      // Assigned setters (fixed assignments and the roster)
      const assignmentSetterIds = (sAssignmentsRes.data || []).map(a => a.setter_id);
      const rosterSetterIds = (rosterRes.data || []).map(r => r.setter_profile_id);
      const allSetterIds = Array.from(new Set([...assignmentSetterIds, ...rosterSetterIds]));

      if (allSetterIds.length > 0) {
        const { data: sProfiles } = await supabase
          .from('setters_profiles')
          .select('full_name')
          .in('id', allSetterIds);
        setAssignedSetterNames((sProfiles || []).map(s => s.full_name || 'Unknown'));
      } else {
        setAssignedSetterNames([]);
      }

      // Meetings from the last 7 and 14 days
      const recentMeetings = recentRes.data;
      if (recentMeetings) {
        const last7 = recentMeetings.filter(m => new Date(m.meeting_date) >= sevenDaysAgo).length;
        const last14 = recentMeetings.length;
        setMeetingsLast7Days(last7);
        setMeetingsLast14Days(last14);
      }

      // Per-campaign meetings this week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const campaignMeetingsThisWeek: Record<string, number> = {};
      if (recentMeetings) {
        for (const m of recentMeetings) {
          if (new Date(m.meeting_date) >= startOfWeek && m.campaign_id) {
            campaignMeetingsThisWeek[m.campaign_id] = (campaignMeetingsThisWeek[m.campaign_id] || 0) + 1;
          }
        }
      }
      setCampaignMeetingsMap(campaignMeetingsThisWeek);

      // Aggregated meeting data for KPIs
      const meetingsData = allMeetingsRes.data;
      let calculatedKpis = {
        meetingsBooked: 0,
        meetingsSat: 0,
        meetingsApproved: 0,
        meetingsRejected: 0,
        opportunities: 0,
        meetingRequirements: 0
      };

      if (meetingsData) {
        calculatedKpis = {
          meetingsBooked: meetingsData.length,
          meetingsSat: meetingsData.filter(m => m.attendance_status === 'sat').length,
          meetingsApproved: meetingsData.filter(m => m.approved_by_admin === true).length,
          meetingsRejected: meetingsData.filter(m => m.status === 'rejected' || m.status === 'cancelled').length,
          opportunities: meetingsData.filter(m => m.status === 'pending' || m.status === 'scheduled').length,
          meetingRequirements: 0
        };

        const wonMeetings = meetingsData.filter(m => m.client_outcome === 'won');
        setOpportunityMetrics({
          opportunitiesWon: wonMeetings.length,
          totalVacancies: wonMeetings.reduce((sum, m) => sum + (m.vacancies_won || 0), 0),
          totalValue: wonMeetings.reduce((sum, m) => sum + (m.vacancies_value || 0), 0),
        });
      }

      setKpis({
        // Live from meetings — kpi_* override columns are intentionally ignored.
        meetingsBooked: calculatedKpis.meetingsBooked,
        meetingsSat: calculatedKpis.meetingsSat,
        meetingsApproved: calculatedKpis.meetingsApproved,
        meetingsRejected: calculatedKpis.meetingsRejected,
        opportunities: calculatedKpis.opportunities,
        // meetingRequirements is a target, not a count — leave it manual.
        meetingRequirements: (clientData as any)?.kpi_meeting_requirements ?? 0
      });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({ admin_notes: notes } as any)
        .eq("id", id);

      if (error) throw error;
      toast.success("Notes saved successfully");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this campaign? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", campaignId);

      if (error) throw error;

      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
      toast.success("Campaign deleted successfully");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const saveClientInfo = async () => {
    if (!editedClient) return;
    
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({
          contact_name: editedClient.contact_name,
          email: editedClient.email,
          phone: editedClient.phone,
          website: editedClient.website,
          industry: editedClient.industry,
          country: editedClient.country,
          size: editedClient.size,
          logo: editedClient.logo,
        })
        .eq("id", id);

      if (error) throw error;
      
      setClient(editedClient);
      setEditingClientInfo(false);
      toast.success("Client information updated successfully");
      loadClientData();
    } catch (error: any) {
      toast.error(`Failed to update client: ${error.message}`);
    }
  };

  const toggleClientCountry = (country: string) => {
    if (!editedClient) return;
    const currentCountries = editedClient.country ? editedClient.country.split(',').map(c => c.trim()) : [];
    const newCountries = currentCountries.includes(country)
      ? currentCountries.filter(c => c !== country)
      : [...currentCountries, country];
    setEditedClient({
      ...editedClient,
      country: newCountries.join(', ')
    });
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB");
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('client_profiles')
        .update({ logo: publicUrl })
        .eq('id', id);

      if (updateError) throw updateError;

      setClient(prev => prev ? { ...prev, logo: publicUrl } : null);
      toast.success("Logo uploaded successfully");
      loadClientData();
    } catch (error: any) {
      toast.error(`Failed to upload logo: ${error.message}`);
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveKpis = async () => {
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({
          kpi_meetings_booked: kpis.meetingsBooked,
          kpi_meetings_sat: kpis.meetingsSat,
          kpi_meetings_approved: kpis.meetingsApproved,
          kpi_meetings_rejected: kpis.meetingsRejected,
          kpi_opportunities: kpis.opportunities,
          kpi_meeting_requirements: kpis.meetingRequirements,
          kpi_last_updated: new Date().toISOString()
        } as any)
        .eq("id", id);

      if (error) throw error;
      
      toast.success("KPIs saved successfully");
      setEditingKpis(false);
    } catch (error: any) {
      toast.error(`Failed to save KPIs: ${error.message}`);
    }
  };

  const handleMarkAsPaid = async () => {
    setIsMarkingPaid(true);
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({ status: 'active' as const })
        .eq("id", id);

      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action_type: "client_payment_confirmed",
          description: `Marked client "${client?.company_name}" as paid`,
          metadata: { client_id: id }
        });
      }

      toast.success("Client activated - payment confirmed");
      loadClientData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update client status");
    } finally {
      setIsMarkingPaid(false);
    }
  };

  const handleHealthOverride = async (override: 'healthy' | 'at_risk' | null) => {
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({ health_override: override })
        .eq("id", id);

      if (error) throw error;
      
      toast.success(override ? `Health status overridden to "${override}"` : "Health override removed - using auto-calculation");
      setHealthOverrideOpen(false);
      loadClientData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update health status");
    }
  };

  const handleStatusToggle = async (newStatus: 'active' | 'inactive') => {
    if (newStatus === 'inactive') {
      const ok = window.confirm(
        `Mark ${client?.company_name} as inactive? They'll be hidden from active counts but kept in the system and can be reactivated anytime.`
      );
      if (!ok) return;
    }
    try {
      const { error } = await supabase
        .from("client_profiles")
        .update({ status: newStatus } as any)
        .eq("id", id);

      if (error) throw error;
      toast.success(newStatus === 'active' ? "Client marked as active" : "Client marked as inactive");
      loadClientData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update client status");
    }
  };

  // Compute overall client health
  const campaignHealthData: CampaignHealthData[] = campaigns.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status || 'active',
    meetings_booked: c.meetings_booked || 0,
    meeting_target: c.meeting_target || 0,
    calls_outbound: c.calls_outbound || 0,
    call_target: c.call_target || 0,
    meetings_sat: c.meetings_sat || 0,
    launch_date: c.launch_date || null,
    end_date: c.end_date || null
  }));

  const launchDates = campaigns.filter(c => c.launch_date).map(c => new Date(c.launch_date!).getTime());
  const earliestLaunch = launchDates.length > 0 ? new Date(Math.min(...launchDates)).toISOString() : null;
  
  // Check for health override
  const hasHealthOverride = !!client?.health_override;
  const effectiveHealthStatus = hasHealthOverride 
    ? (client?.health_override === 'healthy' ? 'green' : 'red')
    : computeClientHealth(campaignHealthData, meetingsLast7Days, meetingsLast14Days, earliestLaunch).overallHealth;
  
  const clientHealth = computeClientHealth(campaignHealthData, meetingsLast7Days, meetingsLast14Days, earliestLaunch);
  const healthColors = getHealthColorClasses(hasHealthOverride ? effectiveHealthStatus as 'green' | 'red' | 'amber' : clientHealth.overallHealth);

  if (loading) {
    return (
      <DashboardLayout role="admin">
        <PageContainer>
          <div className="text-center py-8">Loading...</div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  if (!client) {
    return (
      <DashboardLayout role="admin">
        <PageContainer>
          <div className="text-center py-8">Client not found</div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  const latestCampaign = campaigns[0];

  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <div className="space-y-6 animate-fade-in">
          {/* Pending Payment Alert */}
          {client.status === 'pending' && (
            <div className="flex items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <span className="text-lg">⏳</span>
                </div>
                <div>
                  <p className="font-semibold text-yellow-400">Pending Payment</p>
                  <p className="text-sm text-muted-foreground">This client is awaiting first payment confirmation</p>
                </div>
              </div>
              <Button 
                onClick={handleMarkAsPaid}
                disabled={isMarkingPaid}
                className="bg-green-600 hover:bg-green-700"
              >
                {isMarkingPaid ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Mark as Paid
              </Button>
            </div>
          )}

          {/* Header with Overview */}
          <div className="flex items-start gap-6">
            <Button variant="outline" size="icon" onClick={() => navigate(backToClientsPath)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            <div className="relative group">
              {client.logo ? (
                <div className="relative">
                  <img src={client.logo} alt={client.company_name} className="w-16 h-16 rounded-lg object-cover border-2 border-border" />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-16 h-16 rounded-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold">{client.company_name}</h1>
                <Popover open={healthOverrideOpen} onOpenChange={setHealthOverrideOpen}>
                  <PopoverTrigger asChild>
                    <button type="button" className="focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full">
                      <Badge className={`${healthColors.bg} ${healthColors.text} ${healthColors.border} border cursor-pointer hover:opacity-80`}>
                        {hasHealthOverride ? (client.health_override === 'healthy' ? 'Healthy' : 'At Risk') : clientHealth.healthLabel}
                        <Settings2 className="h-3 w-3 ml-1" />
                      </Badge>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground mb-2">Override Health Status</p>
                      <Button size="sm" variant="ghost" className="w-full justify-start text-green-500" onClick={() => handleHealthOverride('healthy')}>
                        Healthy
                      </Button>
                      <Button size="sm" variant="ghost" className="w-full justify-start text-red-500" onClick={() => handleHealthOverride('at_risk')}>
                        At Risk
                      </Button>
                      <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => handleHealthOverride(null)}>
                        Auto (Calculated)
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                {isCSMOrAdmin && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full">
                        <Badge
                          className={
                            client.status === 'inactive'
                              ? "bg-muted text-muted-foreground border-border border cursor-pointer hover:opacity-80"
                              : "bg-green-500/10 text-green-500 border-green-500/30 border cursor-pointer hover:opacity-80"
                          }
                        >
                          {client.status === 'inactive' ? 'Inactive' : 'Active'}
                          <Settings2 className="h-3 w-3 ml-1" />
                        </Badge>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground mb-2">Set Client Status</p>
                        <Button size="sm" variant="ghost" className="w-full justify-start text-green-500" onClick={() => handleStatusToggle('active')}>
                          Active
                        </Button>
                        <Button size="sm" variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => handleStatusToggle('inactive')}>
                          Inactive
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {client.team_network_member && <Badge variant="outline" className="text-muted-foreground">Former Team Network*</Badge>}
              </div>
              <p className="text-muted-foreground">{client.contact_name} • {client.email}</p>
              {client.industry && <p className="text-sm text-muted-foreground mt-1">{client.industry}</p>}
            </div>
          </div>

          {/* Compact Performance Overview */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Pill variant={clientHealth.healthScore >= 70 ? "ok" : clientHealth.healthScore >= 40 ? "warn" : "bad"}>Health {clientHealth.healthScore}%</Pill>
              {snapshotRow && (
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">
                  Live from Vexon OS
                  {healthSnapshot?.fetchedAt && ` · synced ${new Date(healthSnapshot.fetchedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
                </span>
              )}
              {clientHealth.flags.map((flag, i) => (
                <Pill key={i} variant="bad">{flag}</Pill>
              ))}
            </div>
            <StatStrip
              stats={[
                { label: "Days live", value: clientHealth.daysLive },
                { label: "Active campaigns", value: clientHealth.activeCampaigns },
                { label: "Meetings · 7d", value: clientHealth.meetingsLast7Days },
                { label: "Opps won", value: snapshotRow?.opportunities ?? opportunityMetrics.opportunitiesWon },
                { label: "Placements", value: snapshotRow?.vacancies ?? opportunityMetrics.totalVacancies },
                { label: "Revenue", value: `£${(snapshotRow?.revenueGenerated ?? opportunityMetrics.totalValue).toLocaleString()}` },
              ]}
            />
          </div>

          {/* Collapsible Client Info - More Compact */}
          <details className="group">
            <summary className="flex items-center justify-between p-4 bg-card/50 border border-border rounded-lg cursor-pointer hover:bg-card/80 transition-colors">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Client Details</span>
                <span className="text-sm text-muted-foreground">
                  {client.contact_name} • {client.email} • {client.industry || 'No industry'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!editingClientInfo && (
                  <Button 
                    onClick={(e) => {
                      e.preventDefault();
                      setEditedClient(client);
                      setEditingClientInfo(true);
                    }}
                    variant="ghost"
                    size="sm"
                  >
                    Edit
                  </Button>
                )}
                <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▼</span>
              </div>
            </summary>
            <Card className="border-border shadow-card mt-2 border-t-0 rounded-t-none">
              <CardContent className="pt-4">
                {editingClientInfo && (
                  <div className="flex justify-end mb-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingClientInfo(false)}>Cancel</Button>
                      <Button size="sm" onClick={saveClientInfo}>Save Changes</Button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Contact</p>
                    {editingClientInfo ? (
                      <Input value={editedClient?.contact_name || ""} onChange={(e) => setEditedClient(prev => prev ? {...prev, contact_name: e.target.value} : null)} className="h-8" />
                    ) : (
                      <p className="font-medium truncate">{client.contact_name}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Email</p>
                    {editingClientInfo ? (
                      <Input type="email" value={editedClient?.email || ""} onChange={(e) => setEditedClient(prev => prev ? {...prev, email: e.target.value} : null)} className="h-8" />
                    ) : (
                      <p className="font-medium truncate">{client.email}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Mobile</p>
                    {editingClientInfo ? (
                      <Input value={editedClient?.phone || ""} onChange={(e) => setEditedClient(prev => prev ? {...prev, phone: e.target.value} : null)} className="h-8" />
                    ) : (
                      <p className="font-medium truncate">{client.phone || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Website</p>
                    {editingClientInfo ? (
                      <Input value={editedClient?.website || ""} onChange={(e) => setEditedClient(prev => prev ? {...prev, website: e.target.value} : null)} className="h-8" />
                    ) : (
                      <p className="font-medium truncate">{client.website || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Industry</p>
                    {editingClientInfo ? (
                      <Input value={editedClient?.industry || ""} onChange={(e) => setEditedClient(prev => prev ? {...prev, industry: e.target.value} : null)} className="h-8" />
                    ) : (
                      <p className="font-medium truncate">{client.industry || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Country/Region</p>
                    {editingClientInfo ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="h-8 w-full justify-start text-left font-normal" size="sm">
                            {editedClient?.country ? (editedClient.country.split(',').length > 1 ? `${editedClient.country.split(',').length} selected` : editedClient.country.split(',')[0].trim()) : "Select..."}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-3" align="start">
                          <div className="space-y-2">
                            {STANDARD_COUNTRIES.map((country) => (
                              <div key={country} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`client-${country}`}
                                  checked={editedClient?.country?.split(',').map(c => c.trim()).includes(country) || false}
                                  onCheckedChange={() => toggleClientCountry(country)}
                                />
                                <label htmlFor={`client-${country}`} className="text-xs font-normal cursor-pointer">{country}</label>
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <p className="font-medium truncate">{client.country || "—"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Company Size</p>
                    {editingClientInfo ? (
                      <Input value={editedClient?.size || ""} onChange={(e) => setEditedClient(prev => prev ? {...prev, size: e.target.value} : null)} className="h-8" />
                    ) : (
                      <p className="font-medium truncate">{client.size || "—"}</p>
                    )}
                  </div>
                  {client.team_network_member && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">Legacy Tag</p>
                      <p className="font-medium text-muted-foreground">Former Team Network*</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </details>

          {/* Pending Meetings moved to Operations > Appointments tab */}

          {/* Two-Level Segmented Navigation */}
          <ClientProfileNav
            activeCategory={activeCategory}
            activeSection={activeSection}
            onCategoryChange={(cat) => {
              setActiveCategory(cat);
              setActiveSection(NAV_STRUCTURE[cat].items[0].value);
            }}
            onSectionChange={setActiveSection}
            isCSMOrAdmin={isCSMOrAdmin}
          />

          {/* Section Content */}
          <div className="mt-6">
            {activeSection === "campaigns" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Campaign Health</h2>
                  <CreateCampaignModal clientId={id!} onSuccess={loadClientData} />
                </div>

                {campaigns.length === 0 ? (
                  <Card className="border-border shadow-card">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No campaigns created yet. Click "Create Campaign" to get started.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {campaigns.map((campaign) => {
                      const healthIndicator = computeCampaignHealth(
                        {
                          id: campaign.id,
                          name: campaign.name,
                          status: campaign.status || 'active',
                          meetings_booked: campaign.meetings_booked || 0,
                          meeting_target: campaign.meeting_target || 0,
                          calls_outbound: campaign.calls_outbound || 0,
                          call_target: campaign.call_target || 0,
                          meetings_sat: campaign.meetings_sat || 0,
                          launch_date: campaign.launch_date || null,
                          end_date: campaign.end_date || null
                        },
                        campaignMeetingsMap[campaign.id] || 0,
                        0, 0, 0
                      );

                      return (
                        <CampaignHealthCard
                          key={campaign.id}
                          campaign={{
                            id: campaign.id,
                            name: campaign.name,
                            status: campaign.status || 'active',
                            meetings_booked: campaign.meetings_booked || 0,
                            meeting_target: campaign.meeting_target || 0,
                            calls_outbound: campaign.calls_outbound || 0,
                            call_target: campaign.call_target || 0,
                            meetings_sat: campaign.meetings_sat || 0,
                            launch_date: campaign.launch_date || null
                          }}
                          healthIndicator={healthIndicator}
                          assignedSetters={assignedSetterNames}
                          onClick={() => navigate(`${isCSMRoute ? "/csm" : "/admin"}/campaigns/${campaign.id}`, { state: { fromClientPath: location.pathname } })}
                          onDelete={handleDeleteCampaign}
                        />
                      );
                    })}
                  </div>
                )}

                {campaigns.filter(c => c.start_date).map(campaign => (
                  <CampaignWeeklyGoals
                    key={`goals-${campaign.id}`}
                    campaignId={campaign.id}
                    campaignStartDate={campaign.start_date}
                    campaignStatus={campaign.status || 'active'}
                  />
                ))}

                {/* Key Campaign Dates - moved from Config/Management */}
                <CampaignDatesCard clientId={id!} onUpdate={loadClientData} />
              </div>
            )}

            {activeSection === "metrics" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="font-head text-[15px] font-medium">Client metrics</h2>
                  <Pill>Live from meetings</Pill>
                </div>

                <StatStrip
                  stats={[
                    { label: "Meetings booked", value: <button type="button" className="hover:text-[var(--accent)]" onClick={() => navigate(`/admin/meetings?clientId=${id}&filter=all`)}>{kpis.meetingsBooked}</button>, caption: "Total meetings scheduled" },
                    { label: "Meetings sat", value: <button type="button" className="hover:text-[var(--accent)]" onClick={() => navigate(`/admin/meetings?clientId=${id}&filter=sat`)}>{kpis.meetingsSat}</button>, caption: "Completed meetings" },
                    { label: "Meetings approved", value: kpis.meetingsApproved, caption: "Admin approved" },
                  ]}
                />
                <StatStrip
                  stats={[
                    { label: "Meetings rejected", value: kpis.meetingsRejected, caption: "Cancelled or rejected" },
                    { label: "Opportunities", value: kpis.opportunities, caption: "Pending and scheduled" },
                    { label: "Meeting requirements", value: editingKpis
                        ? <Input type="number" value={kpis.meetingRequirements} onChange={(e) => setKpis({...kpis, meetingRequirements: parseInt(e.target.value) || 0})} className="h-9 w-28 font-head text-[22px]" />
                        : kpis.meetingRequirements, caption: "Total meetings required for the client" },
                  ]}
                />

                <div className="flex justify-end">
                  <Button onClick={() => editingKpis ? saveKpis() : setEditingKpis(true)} variant={editingKpis ? "default" : "outline"} size="sm">
                    {editingKpis ? "Save target" : "Edit meeting requirement target"}
                  </Button>
                </div>
              </div>
            )}


            {activeSection === "appointments" && (
              <PendingMeetingsSection clientId={id!} onUpdate={loadClientData} />
            )}

            {activeSection === "lead_lists" && (
              <AdminLeadListsTab clientId={id!} />
            )}

            {activeSection === "terms_vacancies" && (
              <ClientTermsVacanciesTab clientId={id!} onUpdate={loadClientData} />
            )}

            {activeSection === "weekly_catchups" && (
              <WeeklyCatchupsTab clientId={id!} />
            )}

            {activeSection === "testimonials" && (
              <ClientTestimonialsSection clientId={id!} />
            )}

            {activeSection === "renewal" && isCSMOrAdmin && (
              <ClientRenewalTab clientId={id!} />
            )}

            {activeSection === "warm_leads" && (
              <ClientProfileWarmLeads clientId={id!} />
            )}

            {activeSection === "stipulations" && (
              <StipulationManager clientId={id!} />
            )}

            {activeSection === "payments" && (
              <ClientPayments clientId={id!} />
            )}

            {activeSection === "documents" && (
              <ClientDocumentsTab clientId={id!} />
            )}

            {activeSection === "financial_details" && (
              <div className="space-y-6">
                <ClientRenewalsSection clientId={id!} />
                <ClientFinancialDetailsTab clientId={id!} onUpdate={loadClientData} />
              </div>
            )}

            {activeSection === "source_materials" && (
              <ClientSourceMaterialsTab
                clientId={id!}
                calendlyLink={(client as any)?.calendly_link}
                onCalendlyUpdate={() => loadClientData()}
              />
            )}

            {activeSection === "onboarding" && (
              <ClientJourneySection clientId={id!} />
            )}

            {activeSection === "bookings" && (
              <ClientBookingsSection clientId={id!} />
            )}

            {activeSection === "credentials" && (
              <div className="space-y-4">
                <ClientAccountCreator
                  clientId={id!}
                  clientEmail={client.email}
                  hasAccount={clientAccountStatus.hasAccount}
                  isOnboarded={clientAccountStatus.onboarded}
                  onAccountCreated={loadClientData}
                />
                
                <CredentialsLocker 
                  clientProfileId={id!} 
                  initialCredentials={clientProfile?.credentials_encrypted}
                />

                <Card className="border-border shadow-card">
                  <CardHeader>
                    <CardTitle>Admin Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="Add notes or follow-up actions..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[120px]"
                    />
                    <Button onClick={saveNotes}>Save Notes</Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeSection === "management" && isCSMOrAdmin && (
              <ClientManagementTab clientId={id!} onUpdate={loadClientData} />
            )}
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

export default ClientProfile;
