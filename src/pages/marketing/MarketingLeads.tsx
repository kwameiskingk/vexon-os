import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Target, Megaphone, Linkedin, CalendarCheck2, CircleDashed, Check, ExternalLink,
  Mail, Phone, Banknote, Globe, FileText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  MarketingLead, useMarketingLeads, useMarkLeadsSeen, useToggleLeadActioned,
} from "@/hooks/useMarketingLeads";
import { useForms } from "@/hooks/useForms";
import { useAuth } from "@/contexts/AuthContext";

// Who may open the Enquire responses screen (App.tsx FORM_MANAGER_ROLES).
const FORM_MANAGER_ROLES = ["admin", "dev", "hr", "ops", "sdr_manager"];

const answerText = (v: unknown): string =>
  Array.isArray(v) ? v.map(answerText).join(", ")
  : v && typeof v === "object" ? ((v as { name?: string }).name ?? Object.values(v as Record<string, unknown>).map(answerText).filter(Boolean).join(" "))
  : v == null ? "" : String(v);

const QUAL_STYLES: Record<string, { label: string; cls: string }> = {
  qualified: { label: "Qualified", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  price_qualified: { label: "Price qualified", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  unqualified: { label: "Unqualified", cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  incomplete: { label: "Incomplete", cls: "bg-muted text-muted-foreground border-border" },
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "🟢 Positive",
  interested: "🟡 Interested",
  more_info: "🔵 Wants more info",
};

type SourceFilter = "all" | "website" | "meta_ads" | "heyreach";

const MarketingLeads = () => {
  const { data: leads, isLoading } = useMarketingLeads();
  const markSeen = useMarkLeadsSeen();
  const toggleActioned = useToggleLeadActioned();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { userRoles } = useAuth();
  const canOpenEnquire = userRoles.some((r) => FORM_MANAGER_ROLES.includes(r));
  // Enquire form slug → id, for the "open the response" link.
  const { data: forms = [] } = useForms();
  const formIdBySlug = useMemo(() => Object.fromEntries(forms.map((f) => [f.slug, f.id])), [forms]);

  // Opening the tab clears the "unseen" state (rows stay highlighted until the
  // list refetches, so Tom can still see what was new this visit).
  useEffect(() => {
    markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => (leads || []).filter((l) => sourceFilter === "all" || l.source === sourceFilter),
    [leads, sourceFilter],
  );
  const unseenIds = useMemo(
    () => new Set((leads || []).filter((l) => !l.seen_at).map((l) => l.id)),
    [leads],
  );

  return (
    <MarketingLayout>
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/30 ring-1 ring-white/15">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-[26px] font-bold tracking-tight leading-tight bg-gradient-to-br from-foreground via-foreground to-orange-300/80 bg-clip-text text-transparent">Leads</h1>
            <p className="text-[13px] text-muted-foreground">Every new lead from Enquire (the website form), the ads funnel and HeyReach, the moment it lands.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {([
          { key: "all", label: "All", icon: Target },
          { key: "website", label: "Enquire", icon: Globe },
          { key: "meta_ads", label: "Ads", icon: Megaphone },
          { key: "heyreach", label: "HeyReach", icon: Linkedin },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setSourceFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
              sourceFilter === f.key
                ? "bg-gradient-to-r from-orange-500/20 to-amber-500/10 border-orange-500/40 text-orange-400"
                : "border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
            )}
          >
            <f.icon className="h-3.5 w-3.5" />
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground/70 uppercase tracking-[0.14em]">
          {filtered.length} lead{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
          <Target className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No leads yet — they'll appear here the moment someone comes through the funnel.</p>
        </Card>
      ) : (
        <Card className="p-0 border-white/[0.06] overflow-hidden bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl">
          <div className="divide-y divide-white/[0.04]">
            {filtered.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                isUnseen={unseenIds.has(lead.id)}
                expanded={expandedId === lead.id}
                onToggleExpand={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                onToggleActioned={() =>
                  toggleActioned.mutate({ id: lead.id, actioned: !lead.actioned_at })
                }
                enquireHref={canOpenEnquire && lead.raw?.form && formIdBySlug[lead.raw.form] && lead.typeform_response_token?.startsWith("form:")
                  ? `/admin/forms/${formIdBySlug[lead.raw.form]}/responses?open=${encodeURIComponent(lead.typeform_response_token.slice(5))}`
                  : null}
              />
            ))}
          </div>
        </Card>
      )}
    </MarketingLayout>
  );
};

const LeadRow = ({
  lead, isUnseen, expanded, onToggleExpand, onToggleActioned, enquireHref,
}: {
  lead: MarketingLead;
  isUnseen: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActioned: () => void;
  enquireHref: string | null;
}) => {
  const qual = QUAL_STYLES[lead.qualification || "incomplete"] || QUAL_STYLES.incomplete;
  const isAds = lead.source === "meta_ads";
  const isHeyReach = lead.source === "heyreach";
  // Every answer they gave on the form, as "Question title → answer" (Enquire leads only).
  const answers = Object.entries(lead.raw?.answers ?? {}).map(([q, v]) => [q, answerText(v)] as const).filter(([, a]) => a !== "");
  const booked = lead.outcome === "meeting_booked";
  const displayName = lead.name || lead.email || "Unknown";
  const ts = lead.submitted_at || lead.created_at;

  return (
    <div className={cn("transition-colors", isUnseen && "bg-orange-500/[0.06]", lead.actioned_at && "opacity-60")}>
      <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30" onClick={onToggleExpand}>
        {isUnseen && <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0 animate-pulse" />}
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-white/10",
          isHeyReach ? "bg-[#0A66C2]/15 text-[#6b7a90]" : isAds ? "bg-orange-500/15 text-orange-400" : "bg-violet-500/15 text-violet-400",
        )}>
          {isHeyReach ? <Linkedin className="h-3.5 w-3.5" /> : isAds ? <Megaphone className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{displayName}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {lead.company_name || "—"}{lead.campaign_name ? ` • ${lead.campaign_name}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isHeyReach ? (
            <>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold", qual.cls)}>{qual.label}</span>
              <span className={cn(
                "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-semibold",
                booked
                  ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                  : "bg-muted text-muted-foreground border-border",
              )}>
                {booked ? <CalendarCheck2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                {booked ? "Booked themselves in" : "No meeting yet"}
              </span>
            </>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-[#0A66C2]/10 text-[#6b7a90] border-[#0A66C2]/30 font-semibold">
              {SENTIMENT_LABELS[lead.sentiment || ""] || "Reply"}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap hidden sm:inline">
            {formatDistanceToNow(new Date(ts), { addSuffix: true })}
          </span>
          <Button
            size="sm"
            variant={lead.actioned_at ? "secondary" : "outline"}
            className="h-7 px-2 text-[11px]"
            onClick={(e) => { e.stopPropagation(); onToggleActioned(); }}
          >
            <Check className="h-3 w-3 mr-1" />
            {lead.actioned_at ? "Actioned" : "Mark actioned"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pl-[60px] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {lead.email && (
            <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" /><span className="text-foreground select-all">{lead.email}</span></div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" /><span className="text-foreground select-all">{lead.phone}</span></div>
          )}
          {lead.revenue_band && (
            <div className="flex items-center gap-1.5 text-muted-foreground"><Banknote className="h-3 w-3" />Revenue: <span className="text-foreground">{lead.revenue_band}</span></div>
          )}
          {lead.is_partial && (
            <div className="text-amber-500">Partial submission — they gave details but didn't finish the form.</div>
          )}
          {answers.length > 0 && (
            <div className="sm:col-span-2 mt-1 space-y-1 border-t border-white/[0.06] pt-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Everything they answered</p>
              {answers.map(([q, a]) => (
                <div key={q} className="grid grid-cols-1 sm:grid-cols-[minmax(140px,1fr)_2fr] gap-x-3">
                  <span className="text-muted-foreground">{q}</span>
                  <span className="text-foreground whitespace-pre-line">{a}</span>
                </div>
              ))}
            </div>
          )}
          {enquireHref && (
            <Link to={enquireHref} className="flex items-center gap-1.5 text-violet-400 hover:underline" onClick={(e) => e.stopPropagation()}>
              <FileText className="h-3 w-3" />Open the Enquire response
            </Link>
          )}
          {lead.booking_url && (
            <a
              href={lead.booking_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-violet-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />View booking
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketingLeads;
