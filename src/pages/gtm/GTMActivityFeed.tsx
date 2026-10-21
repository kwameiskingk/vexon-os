import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Linkedin, Building2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const eventTypeStyles: Record<string, { label: string; dotColor: string; bgColor: string }> = {
  connection_request_accepted: { label: "Connected", dotColor: "bg-blue-400", bgColor: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
  connection_accepted: { label: "Connected", dotColor: "bg-blue-400", bgColor: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
  reply: { label: "Replied", dotColor: "bg-emerald-400", bgColor: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" },
  replied: { label: "Replied", dotColor: "bg-emerald-400", bgColor: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" },
  message_reply: { label: "Reply", dotColor: "bg-emerald-400", bgColor: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" },
  inmail_reply: { label: "InMail Reply", dotColor: "bg-purple-400", bgColor: "bg-purple-400/10 text-purple-400 border-purple-400/20" },
  connection_request_sent: { label: "Request Sent", dotColor: "bg-sky-400", bgColor: "bg-sky-400/10 text-sky-400 border-sky-400/20" },
  message_sent: { label: "Message Sent", dotColor: "bg-muted-foreground", bgColor: "bg-muted/50 text-muted-foreground border-border" },
  inmail_sent: { label: "InMail Sent", dotColor: "bg-muted-foreground", bgColor: "bg-muted/50 text-muted-foreground border-border" },
  // Setter action outcomes
  setter_action_meeting_booked: { label: "📅 Meeting Booked", dotColor: "bg-emerald-500", bgColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  setter_action_not_booked: { label: "Not Booked", dotColor: "bg-amber-400", bgColor: "bg-amber-400/10 text-amber-400 border-amber-400/20" },
  setter_action_no_answer: { label: "No Answer", dotColor: "bg-muted-foreground", bgColor: "bg-muted/50 text-muted-foreground border-border" },
  setter_action_not_interested: { label: "Not Interested", dotColor: "bg-red-400", bgColor: "bg-red-400/10 text-red-400 border-red-400/20" },
  setter_action_needs_nurturing: { label: "Needs Nurturing", dotColor: "bg-blue-400", bgColor: "bg-blue-400/10 text-blue-400 border-blue-400/20" },
};

const getStyle = (eventType: string) => {
  const key = eventType.toLowerCase().replace(/\s+/g, "_");
  for (const [k, v] of Object.entries(eventTypeStyles)) {
    if (key.includes(k)) return v;
  }
  return { label: eventType, dotColor: "bg-muted-foreground", bgColor: "bg-muted/50 text-muted-foreground border-border" };
};

const GTMActivityFeed = () => {
  const [search, setSearch] = useState("");

  const { data: events, isLoading } = useQuery({
    queryKey: ["gtm-activity-feed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gtm_heyreach_events")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const filtered = events?.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.event_type?.toLowerCase().includes(s) ||
      e.prospect_name?.toLowerCase().includes(s) ||
      e.prospect_company?.toLowerCase().includes(s) ||
      e.sender_name?.toLowerCase().includes(s) ||
      e.campaign_name?.toLowerCase().includes(s)
    );
  });

  // Group events by date
  const groupedEvents: Record<string, typeof filtered> = {};
  filtered?.forEach((event) => {
    const dateKey = format(new Date(event.received_at), "yyyy-MM-dd");
    if (!groupedEvents[dateKey]) groupedEvents[dateKey] = [];
    groupedEvents[dateKey]!.push(event);
  });

  return (
    <DashboardLayout role="admin">
      <div className="space-y-5">
        <PageHeader title="Activity Feed" subtitle="Real-time webhook events from HeyReach" />

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, sender..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {format(new Date(dateKey), "EEEE, d MMMM yyyy")}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground tabular-nums">{dayEvents?.length}</span>
                </div>

                <div className="space-y-1.5">
                  {dayEvents?.map((event) => {
                    const style = getStyle(event.event_type);
                    // Extract extra data from payload if available
                    const payload = event.payload as any;
                    const position = payload?.lead?.position || "";
                    const location = payload?.lead?.location || "";
                    const summary = payload?.lead?.summary || "";

                    return (
                      <div
                        key={event.id}
                        className="glass-card p-4 flex items-start gap-4 group hover:bg-white/[0.06] transition-all"
                      >
                        {/* Event type badge */}
                        <Badge variant="outline" className={`text-[10px] border flex-shrink-0 mt-0.5 ${style.bgColor}`}>
                          {style.label}
                        </Badge>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {event.prospect_name || "Unknown"}
                            </span>
                            {event.prospect_company && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Building2 className="h-3 w-3" /> {event.prospect_company}
                              </span>
                            )}
                          </div>

                          {/* Rich context from payload */}
                          {(position || summary) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {position}{position && summary ? " · " : ""}{summary}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {event.campaign_name && (
                              <span className="text-[10px] text-muted-foreground">{event.campaign_name}</span>
                            )}
                            {event.sender_name && (
                              <span className="text-[10px] text-muted-foreground">· via {event.sender_name}</span>
                            )}
                            {location && (
                              <span className="text-[10px] text-muted-foreground hidden lg:inline">· {location}</span>
                            )}
                          </div>

                          {event.message_preview && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">"{event.message_preview}"</p>
                          )}
                        </div>

                        {/* LinkedIn */}
                        {event.prospect_linkedin_url && (
                          <a
                            href={event.prospect_linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors opacity-60 group-hover:opacity-100"
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        )}

                        {/* Timestamp */}
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                          {formatDistanceToNow(new Date(event.received_at), { addSuffix: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-12 text-center">
            <p className="text-sm text-muted-foreground">{search ? "No matching events" : "No events received yet"}</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default GTMActivityFeed;
