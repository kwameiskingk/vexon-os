import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, ButtonV2, Chip, DetailHeader, Panel, Pill, Row, RowList, RowNum, StatStrip } from "@/components/ui-v2";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, ExternalLink, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { useState } from "react";

// Assigned Clients, rebuilt 12 Oct 2026 (SDR streamline PR 5).
//
// A fulfilment setter needs three things from this page: which client they
// are on (today and the rest of the week), how to book for that client
// (the client's own Kronos page), and what the client has given us (source
// materials). Everything that measured the setter against a pace (progress
// bar, days remaining, required pace, assignment timeline) is gone; tracking
// lives on the team's Sheets. The Calendly link is replaced by Kronos.

export interface ClientProfile {
  id: string;
  company_name: string;
  logo: string | null;
  industry?: string | null;
  website?: string | null;
  country?: string | null;
  size?: string | null;
  email?: string | null;
  contact_name?: string | null;
  calendly_link?: string | null;
}

export interface Assignment {
  id: string;
  setter_id: string;
  client_id: string;
  meeting_target: number;
  duration_days: number;
  meetings_completed: number;
  started_at: string;
  ends_at: string;
  status: string;
  client_profiles?: ClientProfile;
}

export interface RosterEntry {
  id: string;
  roster_date: string;
  client_profile_id: string;
  client_profiles: ClientProfile | null;
}

type MeetingLite = { id: string; company_name: string; meeting_date: string; status: string };

export interface RosterDetailPreload {
  myMeetings: MeetingLite[];
  otherSetterMeetings: MeetingLite[];
  otherRosteredSetters: Array<{ setter_id: string; setter_name: string; days_rostered: number }>;
}

export interface AssignmentDetailPreload {
  myMeetings: MeetingLite[];
  otherSetterMeetings: MeetingLite[];
  otherAssignments: Array<{ setter_id: string; setter_name: string; meetings_completed: number; status: string }>;
}

export interface SourceMaterial { id: string; title: string; file_path: string; file_name: string; category: string }

/** The client's Kronos booking event, when one exists. */
export interface ClientBookingLink { slug: string; accepting: boolean }

/** Demo surface only (3 Sep): pre-supplied detail data keyed by client id, so
 *  the detail cards render on fixtures instead of querying. */
export interface ClientResponsibilityDemoDetails {
  roster: Record<string, RosterDetailPreload>;
  assignments: Record<string, AssignmentDetailPreload>;
  materials: Record<string, SourceMaterial[]>;
}

export interface SetterClientResponsibilityViewProps {
  /** `{ id: auth uid, profile: setters_profiles row }` or null while loading. */
  currentUser: any | null | undefined;
  assignments: Assignment[] | undefined;
  rosterEntries: RosterEntry[] | undefined;
  /** Kronos event per client id. Missing entry = no booking page for that client. */
  bookingLinks: Record<string, ClientBookingLink> | undefined;
  isLoading: boolean;
  demoDetails?: ClientResponsibilityDemoDetails;
}

/**
 * Pure rendering (3 Sep): shared by the live page and the setter demo
 * surface (acting-as SDR on fixtures).
 */
export const SetterClientResponsibilityView = ({ currentUser, assignments, rosterEntries, bookingLinks, isLoading, demoDetails }: SetterClientResponsibilityViewProps) => {
  const [activeTab, setActiveTab] = useState<string>("0");
  const [activeTodayClientId, setActiveTodayClientId] = useState<string | null>(null);

  if (isLoading || !currentUser) {
    return (
      <DashboardLayout role="setter">
        <PageContainer>
          <p className="py-8 text-center text-[12px] text-[var(--dim)]">Loading…</p>
        </PageContainer>
      </DashboardLayout>
    );
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaysRosterEntries = rosterEntries?.filter(e => e.roster_date === todayStr) || [];
  const todaysClients = Array.from(
    new Map(
      todaysRosterEntries
        .filter(e => !!e.client_profiles)
        .map(e => [e.client_profiles!.id, e.client_profiles!])
    ).values()
  );
  const activeTodaysClient = todaysClients.find(c => c.id === activeTodayClientId) || todaysClients[0] || null;
  const hasMultipleTodaysClients = todaysClients.length > 1;
  const hasAssignments = (assignments && assignments.length > 0) || (rosterEntries && rosterEntries.length > 0);

  if (!hasAssignments) {
    return (
      <DashboardLayout role="setter">
        <PageContainer>
          <PageHeader title="Assigned Clients" subtitle="Who you are booking for" />
          <div className="border-t border-[var(--line)] py-10 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="mb-1 font-head text-[15px] font-medium">Nothing on the roster this week</h3>
            <p className="text-muted-foreground mb-4">Daniel sets the roster each morning. Until then you can still book for any client from the booking hub.</p>
            <ButtonV2 variant="primary" size="sm" className="mt-3" onClick={() => window.open('/bookings/fulfilment', '_blank')}>
              Open the booking hub
            </ButtonV2>
          </div>
        </PageContainer>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="setter">
      <PageContainer>
        <PageHeader
          title="Assigned Clients"
          subtitle={
            activeTodaysClient
              ? hasMultipleTodaysClients
                ? `Today: ${todaysClients.map(c => c.company_name).join(' · ')}`
                : `Today: ${activeTodaysClient.company_name}`
              : "Who you are booking for this week"
          }
        />

        <div className="space-y-5 animate-fade-in">
          {/* This week's roster */}
          {rosterEntries && rosterEntries.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-[10px] bg-[var(--surf2)] px-4 py-3">
              <span className="w-full font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">This week</span>
              {rosterEntries.map((entry) => {
                const entryDate = new Date(entry.roster_date + 'T00:00:00');
                const isToday = entry.roster_date === todayStr;
                const clientName = entry.client_profiles?.company_name || 'Client';
                return (
                  <div
                    key={entry.id}
                    className={`flex min-w-[150px] flex-1 flex-col gap-[6px] rounded-[8px] px-3 py-2 ${isToday ? 'bg-[var(--sel)] [box-shadow:inset_2px_0_0_var(--brand-lilac)]' : ''}`}
                  >
                    <div className={`font-mono text-[10.5px] uppercase tracking-[0.06em] ${isToday ? 'text-[var(--ink)]' : 'text-[var(--dim)]'}`}>
                      {format(entryDate, 'EEE d MMM')}{isToday ? ' · today' : ''}
                    </div>
                    <div className="flex items-center gap-[8px]">
                      <Avatar name={clientName} src={entry.client_profiles?.logo} size={22} />
                      <p className="line-clamp-2 text-[12.5px] font-semibold leading-tight">{clientName}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Today's client */}
          {activeTodaysClient && (
            <div className="space-y-3">
              {hasMultipleTodaysClients && (
                <div className="flex flex-wrap items-center gap-[6px]">
                  <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">Today's clients</span>
                  {todaysClients.map((c) => (
                    <Chip key={c.id} selected={c.id === activeTodaysClient.id} onClick={() => setActiveTodayClientId(c.id)}>
                      {c.company_name}
                    </Chip>
                  ))}
                </div>
              )}
              <RosterClientDetail
                key={activeTodaysClient.id}
                clientProfile={activeTodaysClient}
                rosterEntries={rosterEntries || []}
                currentUser={currentUser}
                bookingLink={bookingLinks?.[activeTodaysClient.id]}
                preloaded={demoDetails?.roster[activeTodaysClient.id]}
                preloadedMaterials={demoDetails?.materials[activeTodaysClient.id]}
              />
            </div>
          )}

          {!activeTodaysClient && rosterEntries && rosterEntries.length > 0 && !assignments?.length && (
            <div className="border-t border-[var(--line)] py-10 text-center">
              <h3 className="mb-1 font-head text-[15px] font-medium">No client today</h3>
              <p className="text-[12px] text-[var(--dim)]">The roster above shows the rest of your week.</p>
            </div>
          )}

          {/* Long-term assignments (setter_client_assignments) */}
          {assignments && assignments.length > 0 && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {assignments.length > 1 && (
                <TabsList className="mb-4 flex-wrap">
                  {assignments.map((assignment, index) => (
                    <TabsTrigger key={assignment.id} value={String(index)}>
                      {assignment.client_profiles?.company_name || 'Unknown'}
                    </TabsTrigger>
                  ))}
                </TabsList>
              )}
              {assignments.map((assignment, index) => (
                <TabsContent key={assignment.id} value={String(index)}>
                  <AssignmentDetail
                    assignment={assignment}
                    currentUser={currentUser}
                    bookingLink={bookingLinks?.[assignment.client_id]}
                    preloaded={demoDetails?.assignments[assignment.client_id]}
                    preloadedMaterials={demoDetails?.materials[assignment.client_id]}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </PageContainer>
    </DashboardLayout>
  );
};

/** Client header: logo, name, meta, and the three actions a setter needs. */
const ClientHeaderCard = ({
  client, bookingLink, onMaterials, subtitle,
}: { client: ClientProfile; bookingLink?: ClientBookingLink; onMaterials: () => void; subtitle?: string }) => (
  <DetailHeader
    avatar={<Avatar name={client.company_name} src={client.logo} size={52} ring />}
    name={client.company_name}
    email={<>{subtitle}{subtitle && (client.industry || client.country || client.size) ? ' · ' : ''}{[client.industry, client.country, client.size].filter(Boolean).join(' · ')}</>}
    actions={<>
      {bookingLink ? (
        <ButtonV2
          variant="primary"
          size="sm"
          disabled={!bookingLink.accepting}
          title={bookingLink.accepting ? "Open this client's booking page" : "This client is not accepting bookings right now"}
          onClick={() => window.open(`/bookings/${bookingLink.slug}`, '_blank')}
        >
          Book a meeting
        </ButtonV2>
      ) : (
        <ButtonV2 size="sm" title="This client has no booking page yet; the hub lists every client" onClick={() => window.open('/bookings/fulfilment', '_blank')}>
          Booking hub
        </ButtonV2>
      )}
      <ButtonV2 size="sm" onClick={onMaterials}>Source materials</ButtonV2>
      {client.website && (
        <ButtonV2 size="sm" onClick={() => window.open(client.website!, '_blank', 'noopener,noreferrer')}>Website</ButtonV2>
      )}
    </>}
  />
);

/** Two numbers side by side: what I booked for this client against everyone else. */
const MeetingsComparison = ({ title, mine, others }: { title: string; mine: MeetingLite[] | undefined; others: MeetingLite[] | undefined }) => {
  const sat = (rows: MeetingLite[] | undefined) => rows?.filter(m => m.status === 'sat').length || 0;
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--dim)]">{title}</p>
      <StatStrip
        stats={[
          { label: 'Booked by me', value: mine?.length || 0, caption: `${sat(mine)} sat` },
          { label: 'Booked by other setters', value: others?.length || 0, caption: `${sat(others)} sat` },
        ]}
      />
    </div>
  );
};


// Today's rostered client
const RosterClientDetail = ({
  clientProfile, rosterEntries, currentUser, bookingLink, preloaded, preloadedMaterials,
}: {
  clientProfile: ClientProfile;
  rosterEntries: RosterEntry[];
  currentUser: any;
  bookingLink?: ClientBookingLink;
  preloaded?: RosterDetailPreload;
  preloadedMaterials?: SourceMaterial[];
}) => {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const daysOnClient = rosterEntries.filter(e => e.client_profile_id === clientProfile.id).length;

  const { data: liveMyMeetings } = useQuery({
    queryKey: ['setter-roster-client-meetings', clientProfile.id, currentUser?.id],
    enabled: !preloaded && !!clientProfile.id && !!currentUser?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, company_name, meeting_date, status')
        .eq('client_profile_id', clientProfile.id)
        .or(`setter_id.eq.${currentUser.id},logged_by_setter_id.eq.${currentUser.id}`)
        .gte('meeting_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('meeting_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('meeting_date', { ascending: false });
      return (data || []) as MeetingLite[];
    },
  });

  const { data: liveOtherSetterMeetings } = useQuery({
    queryKey: ['other-roster-client-meetings', clientProfile.id, currentUser?.id],
    enabled: !preloaded && !!clientProfile.id && !!currentUser?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, company_name, meeting_date, status')
        .eq('client_profile_id', clientProfile.id)
        .neq('setter_id', currentUser.id)
        .neq('logged_by_setter_id', currentUser.id)
        .gte('meeting_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('meeting_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('meeting_date', { ascending: false });
      return (data || []) as MeetingLite[];
    },
  });

  const { data: liveOtherRosteredSetters } = useQuery({
    queryKey: ['other-rostered-setters', clientProfile.id, currentUser?.profile?.id],
    enabled: !preloaded && !!clientProfile.id && !!currentUser?.profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('roster_entries')
        .select('setter_profile_id, roster_date, setters_profiles!inner (full_name, email)')
        .eq('client_profile_id', clientProfile.id)
        .neq('setter_profile_id', currentUser.profile.id)
        .gte('roster_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('roster_date', format(weekEnd, 'yyyy-MM-dd'));
      const setterMap = new Map<string, { name: string; days: number }>();
      (data || []).forEach((r: any) => {
        const id = r.setter_profile_id;
        const name = r.setters_profiles?.full_name || r.setters_profiles?.email?.split('@')[0] || 'Unknown';
        if (setterMap.has(id)) setterMap.get(id)!.days++; else setterMap.set(id, { name, days: 1 });
      });
      return Array.from(setterMap.entries()).map(([id, info]) => ({ setter_id: id, setter_name: info.name, days_rostered: info.days }));
    },
  });

  const myMeetings = preloaded ? preloaded.myMeetings : liveMyMeetings;
  const otherSetterMeetings = preloaded ? preloaded.otherSetterMeetings : liveOtherSetterMeetings;
  const otherRosteredSetters = preloaded ? preloaded.otherRosteredSetters : liveOtherRosteredSetters;
  const [showMaterials, setShowMaterials] = useState(false);

  return (
    <div className="space-y-4">
      <ClientHeaderCard
        client={clientProfile}
        bookingLink={bookingLink}
        onMaterials={() => setShowMaterials(true)}
        subtitle={`On the roster ${daysOnClient} day${daysOnClient === 1 ? '' : 's'} this week`}
      />
      <SourceMaterialsModal open={showMaterials} onOpenChange={setShowMaterials} clientId={clientProfile.id} clientName={clientProfile.company_name} preloadedMaterials={preloadedMaterials} />
      <MeetingsComparison title="Meetings this week" mine={myMeetings} others={otherSetterMeetings} />
      {otherRosteredSetters && otherRosteredSetters.length > 0 && (
        <Panel title="Also on this client this week">
          <RowList columns="1fr auto">
            {otherRosteredSetters.map((setter) => (
              <Row key={setter.setter_id}>
                <div className="flex items-center gap-3">
                  <Avatar name={setter.setter_name} size={28} /><p className="text-[12.5px] font-semibold">{setter.setter_name}</p>
                </div>
                <RowNum className="text-[var(--dim)]">{setter.days_rostered} day{setter.days_rostered === 1 ? '' : 's'}</RowNum>
              </Row>
            ))}
          </RowList>
        </Panel>
      )}
    </div>
  );
};

// Long-term assignment (setter_client_assignments)
const AssignmentDetail = ({
  assignment, currentUser, bookingLink, preloaded, preloadedMaterials,
}: {
  assignment: Assignment;
  currentUser: any;
  bookingLink?: ClientBookingLink;
  preloaded?: AssignmentDetailPreload;
  preloadedMaterials?: SourceMaterial[];
}) => {
  const { data: liveMyMeetings } = useQuery({
    queryKey: ['setter-my-client-meetings', assignment.client_id, currentUser?.id],
    enabled: !preloaded && !!assignment.client_id && !!currentUser?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, company_name, meeting_date, status')
        .eq('client_profile_id', assignment.client_id)
        .or(`setter_id.eq.${currentUser.id},logged_by_setter_id.eq.${currentUser.id}`)
        .order('meeting_date', { ascending: false });
      return (data || []) as MeetingLite[];
    },
  });

  const { data: liveOtherSetterMeetings } = useQuery({
    queryKey: ['other-setter-client-meetings', assignment.client_id, currentUser?.id],
    enabled: !preloaded && !!assignment.client_id && !!currentUser?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, company_name, meeting_date, status')
        .eq('client_profile_id', assignment.client_id)
        .neq('setter_id', currentUser.id)
        .neq('logged_by_setter_id', currentUser.id)
        .order('meeting_date', { ascending: false });
      return (data || []) as MeetingLite[];
    },
  });

  const { data: liveOtherAssignments } = useQuery({
    queryKey: ['other-client-assignments', assignment.client_id, currentUser?.profile?.id],
    enabled: !preloaded && !!assignment.client_id && !!currentUser?.profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('setter_client_assignments')
        .select('setter_id, meetings_completed, status, setters_profiles!inner (full_name, email)')
        .eq('client_id', assignment.client_id)
        .neq('setter_id', currentUser.profile.id);
      return (data || []).map((a: any) => ({
        setter_id: a.setter_id,
        setter_name: a.setters_profiles?.full_name || a.setters_profiles?.email?.split('@')[0] || 'Unknown',
        meetings_completed: a.meetings_completed || 0,
        status: a.status,
      }));
    },
  });

  const myMeetings = preloaded ? preloaded.myMeetings : liveMyMeetings;
  const otherSetterMeetings = preloaded ? preloaded.otherSetterMeetings : liveOtherSetterMeetings;
  const otherAssignments = preloaded ? preloaded.otherAssignments : liveOtherAssignments;
  const clientProfile = assignment.client_profiles;
  const [showMaterials, setShowMaterials] = useState(false);

  if (!clientProfile) return null;

  return (
    <div className="space-y-4">
      <ClientHeaderCard
        client={clientProfile}
        bookingLink={bookingLink}
        onMaterials={() => setShowMaterials(true)}
        subtitle={`Assigned since ${format(new Date(assignment.started_at), 'd MMM yyyy')}`}
      />
      <SourceMaterialsModal open={showMaterials} onOpenChange={setShowMaterials} clientId={assignment.client_id} clientName={clientProfile.company_name} preloadedMaterials={preloadedMaterials} />
      <MeetingsComparison title="Meetings on this client" mine={myMeetings} others={otherSetterMeetings} />
      {otherAssignments && otherAssignments.length > 0 && (
        <Panel title="Also assigned">
          <RowList columns="1fr auto">
            {otherAssignments.map((setter) => (
              <Row key={setter.setter_id}>
                <div className="flex items-center gap-3">
                  <Avatar name={setter.setter_name} size={28} /><p className="text-[12.5px] font-semibold">{setter.setter_name}</p>
                </div>
                <RowNum className="text-[var(--dim)]">{setter.meetings_completed} meetings</RowNum>
              </Row>
            ))}
          </RowList>
        </Panel>
      )}
    </div>
  );
};

// Source materials modal for setters
const SourceMaterialsModal = ({
  open, onOpenChange, clientId, clientName, preloadedMaterials,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; clientId: string; clientName: string;
  preloadedMaterials?: SourceMaterial[];
}) => {
  const { data: liveMaterials } = useQuery({
    queryKey: ['setter-source-materials', clientId],
    enabled: !preloadedMaterials && !!clientId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_source_materials')
        .select('id, title, file_path, file_name, category')
        .eq('client_profile_id', clientId)
        .order('created_at', { ascending: false });
      if (error) { console.error(error); return []; }
      return data || [];
    },
  });
  const materials = preloadedMaterials ?? liveMaterials;

  const handleViewFile = async (filePath: string) => {
    if (preloadedMaterials) {
      toast.message('Demo data: this file is a placeholder.');
      return;
    }
    const { data } = await supabase.storage.from('source-materials').createSignedUrl(filePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else toast.error('Failed to open file');
  };

  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = { call_sheet: 'Call Sheet', script: 'Script', training: 'Training', general: 'Document' };
    return map[cat] || cat;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {clientName}: source materials
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {(!materials || materials.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No source materials uploaded yet.</p>
            </div>
          ) : (
            materials.map((m: SourceMaterial) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => handleViewFile(m.file_path)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <Pill className="mt-0.5">{getCategoryLabel(m.category)}</Pill>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const SetterClientResponsibility = () => {
  const { data: currentUser } = useQuery({
    queryKey: ['setter-client-resp-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase.from('setters_profiles').select('*').eq('user_id', user.id).single();
      return { ...user, profile };
    }
  });

  const { data: assignments, isLoading } = useQuery({
    queryKey: ['setter-active-assignments', currentUser?.profile?.id],
    queryFn: async () => {
      if (!currentUser?.profile?.id) return [];
      const { data, error } = await supabase
        .from('setter_client_assignments')
        .select(`*, client_profiles ( id, company_name, logo, industry, website, country, size, email, contact_name, calendly_link )`)
        .eq('setter_id', currentUser.profile.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) { console.error("Error fetching assignments:", error); return []; }
      return data as Assignment[];
    },
    enabled: !!currentUser?.profile?.id
  });

  const { data: rosterEntries } = useQuery({
    queryKey: ['setter-roster-entries', currentUser?.profile?.id],
    queryFn: async () => {
      if (!currentUser?.profile?.id) return [];
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from('roster_entries')
        .select('id, roster_date, client_profile_id, client_profiles!inner(id, company_name, logo, industry, website, country, size, email, contact_name, calendly_link)')
        .eq('setter_profile_id', currentUser.profile.id)
        .gte('roster_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('roster_date', format(weekEnd, 'yyyy-MM-dd'))
        .order('roster_date', { ascending: true });
      if (error) { console.error("Error fetching roster entries:", error); return []; }
      return (data || []) as RosterEntry[];
    },
    enabled: !!currentUser?.profile?.id
  });

  // Kronos event per client on this page (same lookup as the fulfilment hub).
  const clientIds = Array.from(new Set([
    ...(rosterEntries || []).map(e => e.client_profile_id),
    ...(assignments || []).map(a => a.client_id),
  ].filter(Boolean)));
  const { data: bookingLinks } = useQuery({
    queryKey: ['setter-client-booking-links', clientIds.join(',')],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('booking_event_types')
        .select('client_id, slug, accepting_bookings')
        .in('client_id', clientIds)
        .eq('is_active', true);
      const map: Record<string, ClientBookingLink> = {};
      (data || []).forEach((e) => { if (e.client_id && !map[e.client_id]) map[e.client_id] = { slug: e.slug, accepting: e.accepting_bookings !== false }; });
      return map;
    },
  });

  if (currentUser?.profile && currentUser.profile.department !== 'fulfilment') {
    return <Navigate to="/setter" replace />;
  }

  return (
    <SetterClientResponsibilityView
      currentUser={currentUser}
      assignments={assignments}
      rosterEntries={rosterEntries}
      bookingLinks={bookingLinks}
      isLoading={isLoading}
    />
  );
};

export default SetterClientResponsibility;
