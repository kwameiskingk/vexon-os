import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ChevronDown, ChevronRight, Calendar, Phone, CheckCircle, ArrowRight } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface CompanyStage {
  company_name: string;
  current_stage: "discovery" | "follow_up" | "client";
  discovery_date?: string;
  follow_up_date?: string;
  conversion_date?: string;
  contract_value?: number;
  client_name?: string;
}

export function CompanyPipelineView() {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  const { data: pipelineData, isLoading } = useQuery({
    queryKey: ["company-pipeline"],
    queryFn: async () => {
      const today = new Date();
      const start = format(startOfMonth(today), "yyyy-MM-dd");
      const end = format(endOfMonth(today), "yyyy-MM-dd");

      // Get all discovery logs this month
      const { data: discoveries } = await supabase
        .from("sales_discovery_logs")
        .select("*")
        .gte("meeting_at", `${start}T00:00:00`)
        .lte("meeting_at", `${end}T23:59:59`)
        .order("meeting_at", { ascending: false });

      // Get all pitch calls this month
      const { data: pitchCalls } = await supabase
        .from("pitch_calls")
        .select("*")
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59`)
        .order("created_at", { ascending: false });

      // Aggregate by company
      const companyMap = new Map<string, CompanyStage>();

      discoveries?.forEach((d) => {
        const key = d.client_name || "Unknown";
        const existing = companyMap.get(key);
        
        let stage: "discovery" | "follow_up" | "client" = "discovery";
        if (d.converted_to_client) {
          stage = "client";
        } else if (["interested", "unsure"].includes(d.client_interest || "")) {
          stage = "follow_up";
        }

        if (!existing || stage === "client" || (stage === "follow_up" && existing.current_stage === "discovery")) {
          companyMap.set(key, {
            company_name: key,
            current_stage: stage,
            discovery_date: d.meeting_at,
            conversion_date: d.converted_to_client ? d.updated_at : undefined,
            contract_value: d.contract_value,
            client_name: d.client_name,
          });
        }
      });

      // Add pitch call data
      pitchCalls?.forEach((pc) => {
        const key = pc.company_name || pc.client_name || "Unknown";
        const existing = companyMap.get(key);

        if (pc.converted_to_client) {
          companyMap.set(key, {
            ...existing,
            company_name: key,
            current_stage: "client",
            follow_up_date: pc.pitch_call_date,
            conversion_date: pc.updated_at,
            contract_value: pc.contract_value,
            client_name: pc.client_name,
          });
        } else if (!existing || existing.current_stage === "discovery") {
          companyMap.set(key, {
            ...existing,
            company_name: key,
            current_stage: "follow_up",
            follow_up_date: pc.pitch_call_date,
            client_name: pc.client_name,
          });
        }
      });

      return Array.from(companyMap.values());
    },
  });

  const discoveryCompanies = pipelineData?.filter((c) => c.current_stage === "discovery") || [];
  const followUpCompanies = pipelineData?.filter((c) => c.current_stage === "follow_up") || [];
  const clientCompanies = pipelineData?.filter((c) => c.current_stage === "client") || [];

  const toggleExpanded = (company: string) => {
    const newSet = new Set(expandedCompanies);
    if (newSet.has(company)) {
      newSet.delete(company);
    } else {
      newSet.add(company);
    }
    setExpandedCompanies(newSet);
  };

  const getStageBadge = (stage: string) => {
    switch (stage) {
      case "discovery":
        return <Badge variant="secondary">Discovery</Badge>;
      case "follow_up":
        return <Badge className="bg-amber-500/20 text-amber-400">Follow-up</Badge>;
      case "client":
        return <Badge className="bg-emerald-500/20 text-emerald-400">Client</Badge>;
      default:
        return <Badge variant="outline">{stage}</Badge>;
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return "—";
    if (value >= 1000) return `£${(value / 1000).toFixed(1)}k`;
    return `£${value.toLocaleString()}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Company Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{discoveryCompanies.length}</p>
            <p className="text-sm text-muted-foreground">In Discovery</p>
          </div>
          <div className="p-4 rounded-lg bg-amber-500/10 text-center">
            <p className="text-2xl font-bold text-amber-500">{followUpCompanies.length}</p>
            <p className="text-sm text-muted-foreground">In Follow-up</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10 text-center">
            <p className="text-2xl font-bold text-emerald-500">{clientCompanies.length}</p>
            <p className="text-sm text-muted-foreground">Converted</p>
          </div>
        </div>

        {/* Movement Summary */}
        {followUpCompanies.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
            <ArrowRight className="h-4 w-4 text-primary" />
            <span className="text-sm">
              <strong>{followUpCompanies.length}</strong> companies moved Discovery → Follow-up this month
            </span>
          </div>
        )}

        {/* Company Lists by Stage */}
        <Tabs defaultValue="discovery" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="discovery">Discovery ({discoveryCompanies.length})</TabsTrigger>
            <TabsTrigger value="follow_up">Follow-up ({followUpCompanies.length})</TabsTrigger>
            <TabsTrigger value="client">Converted ({clientCompanies.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="discovery" className="mt-4">
            <CompanyList companies={discoveryCompanies} expandedCompanies={expandedCompanies} toggleExpanded={toggleExpanded} getStageBadge={getStageBadge} formatCurrency={formatCurrency} />
          </TabsContent>

          <TabsContent value="follow_up" className="mt-4">
            <CompanyList companies={followUpCompanies} expandedCompanies={expandedCompanies} toggleExpanded={toggleExpanded} getStageBadge={getStageBadge} formatCurrency={formatCurrency} />
          </TabsContent>

          <TabsContent value="client" className="mt-4">
            <CompanyList companies={clientCompanies} expandedCompanies={expandedCompanies} toggleExpanded={toggleExpanded} getStageBadge={getStageBadge} formatCurrency={formatCurrency} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CompanyList({
  companies,
  expandedCompanies,
  toggleExpanded,
  getStageBadge,
  formatCurrency,
}: {
  companies: CompanyStage[];
  expandedCompanies: Set<string>;
  toggleExpanded: (company: string) => void;
  getStageBadge: (stage: string) => React.ReactNode;
  formatCurrency: (value?: number) => string;
}) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No companies in this stage</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {companies.map((company) => (
        <Collapsible
          key={company.company_name}
          open={expandedCompanies.has(company.company_name)}
          onOpenChange={() => toggleExpanded(company.company_name)}
        >
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                {expandedCompanies.has(company.company_name) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-medium">{company.company_name}</span>
              </div>
              <div className="flex items-center gap-3">
                {company.contract_value && (
                  <span className="text-sm font-medium text-primary">{formatCurrency(company.contract_value)}</span>
                )}
                {getStageBadge(company.current_stage)}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-11 mt-2 p-3 rounded-lg bg-background border">
              <div className="space-y-2 text-sm">
                {company.discovery_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Discovery: {format(new Date(company.discovery_date), "MMM d, yyyy")}
                  </div>
                )}
                {company.follow_up_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    Follow-up: {format(new Date(company.follow_up_date), "MMM d, yyyy")}
                  </div>
                )}
                {company.conversion_date && (
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle className="h-3 w-3" />
                    Converted: {format(new Date(company.conversion_date), "MMM d, yyyy")}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
