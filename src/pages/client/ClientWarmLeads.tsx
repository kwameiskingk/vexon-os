import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { User, Building2, Globe, Linkedin, ExternalLink, Briefcase, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { WarmLeadStatusBadge } from "@/components/warm-leads/WarmLeadStatusBadge";
import { formatDistanceToNow } from "date-fns";


export interface Lead {
  id: string;
  company_name: string;
  full_name: string | null;
  prospect_job_title: string | null;
  email: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  source: string | null;
  lead_status: string;
  last_status_update: string | null;
}

export interface ClientWarmLeadsViewProps {
  loading: boolean;
  leads: Lead[];
}

export const ClientWarmLeadsView = ({ loading, leads }: ClientWarmLeadsViewProps) => {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const getInitials = (name: string | null, company: string) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return company.slice(0, 2).toUpperCase();
  };

  return (
    <DashboardLayout role="client">
      <PageContainer>
        <PageHeader
          title="Warm Leads"
          subtitle="Contacts we're currently working on for you"
          gradient
        />

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12">
              <EmptyState
                icon={User}
                title="No warm leads yet"
                description="Your team is working on finding leads for you. They'll appear here once ready."
              />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {leads.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-center gap-4 p-4 hover:bg-accent/40 cursor-pointer transition-colors group"
                  onClick={() => setSelectedLead(lead)}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-primary">
                      {getInitials(lead.full_name, lead.company_name)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{lead.full_name || lead.company_name}</p>
                      {lead.full_name && (
                        <span className="text-sm text-muted-foreground truncate">· {lead.company_name}</span>
                      )}
                    </div>
                    {lead.prospect_job_title && (
                      <p className="text-xs text-muted-foreground truncate">{lead.prospect_job_title}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <WarmLeadStatusBadge status={lead.lead_status} />
                    {lead.last_status_update && (
                      <span className="hidden sm:inline text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lead.last_status_update), { addSuffix: true })}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}


        {/* Detail Modal */}
        <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {selectedLead && getInitials(selectedLead.full_name, selectedLead.company_name)}
                  </span>
                </div>
                <div>
                  <p>{selectedLead?.full_name || selectedLead?.company_name}</p>
                  {selectedLead?.full_name && (
                    <p className="text-sm font-normal text-muted-foreground">
                      {selectedLead.company_name}
                    </p>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>

            <Separator />

            {selectedLead && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <WarmLeadStatusBadge status={selectedLead.lead_status} />
                  {selectedLead.last_status_update && (
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDistanceToNow(new Date(selectedLead.last_status_update), { addSuffix: true })}
                    </span>
                  )}
                </div>
                {selectedLead.full_name && (
                  <DetailRow icon={User} label="Contact" value={selectedLead.full_name} />
                )}
                <DetailRow icon={Building2} label="Company" value={selectedLead.company_name} />
                {selectedLead.prospect_job_title && (
                  <DetailRow icon={Briefcase} label="Job Title" value={selectedLead.prospect_job_title} />
                )}
                {selectedLead.company_domain && (
                  <DetailRow
                    icon={Globe}
                    label="Website"
                    value={selectedLead.company_domain}
                    href={selectedLead.company_domain.startsWith("http") ? selectedLead.company_domain : `https://${selectedLead.company_domain}`}
                  />
                )}
                {selectedLead.linkedin_url && (
                  <DetailRow
                    icon={Linkedin}
                    label="LinkedIn"
                    value="View Profile"
                    href={selectedLead.linkedin_url}
                  />
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

      </PageContainer>
    </DashboardLayout>
  );
};

const ClientWarmLeads = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: linkedProfiles } = await supabase
        .from("client_profile_users")
        .select("client_profile_id")
        .eq("user_id", user.id);

      const { data: directProfile } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const allProfileIds = new Set<string>();
      linkedProfiles?.forEach(p => allProfileIds.add(p.client_profile_id));
      if (directProfile) allProfileIds.add(directProfile.id);

      const profileIdsArray = Array.from(allProfileIds);

      if (profileIdsArray.length === 0) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("warm_leads")
        .select("id, company_name, full_name, prospect_job_title, email, linkedin_url, company_domain, source, lead_status, last_status_update")
        .in("client_profile_id", profileIdsArray)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads((data || []) as Lead[]);
    } catch (error) {
      console.error("Failed to load leads:", error);
    } finally {
      setLoading(false);
    }
  };

  return <ClientWarmLeadsView loading={loading} leads={leads} />;
};

const DetailRow = ({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
}) => (
  <div className="flex items-center gap-3">
    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          {value}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className="text-sm font-medium truncate">{value}</p>
      )}
    </div>
  </div>
);

export default ClientWarmLeads;
