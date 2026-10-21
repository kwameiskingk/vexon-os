import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ButtonV2, Chip, Eyebrow, HealthLabel, Panel, Pill, Row, RowList, RowName, RowNum } from "@/components/ui-v2";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isFuture } from "date-fns";
import { toast } from "sonner";
import { CompletePitchCallDrawer } from "@/components/acquisition/CompletePitchCallDrawer";
import { NEEDS_OUTCOME_BANNER_THRESHOLD } from "@/hooks/useAeNeedsOutcomeCount";

import { CreatePitchCallModal } from "@/components/acquisition/CreatePitchCallModal";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useAuth } from "@/contexts/AuthContext";
import { ListSearchSort, applySearchSort } from "@/components/acquisition/ListSearchSort";


type CallFilter = "today" | "upcoming" | "overdue" | "completed";

export default function AEFollowUpCalls() {
  const queryClient = useQueryClient();
  const { user, userRole } = useAuth();
  // Admin tier inherits the whole book (2 Sep): with no AEs left, Marcus
  // must see follow-ups Oliver/Rory created — especially the overdue
  // dead-zone. Mirrors the isAdminTier widening PR #202 gave discoveries.
  const isAdminTier = userRole === "admin" || userRole === "dev";
  const [filter, setFilter] = useState<CallFilter>("today");
  const [selectedPitchCall, setSelectedPitchCall] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCallsOpen, setIsCallsOpen] = usePersistedState('ae-followup-calls-open', true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("pitch_call_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");


  // Fetch pitch calls — an AE sees their own; admin tier sees every
  // follow-up (RLS already grants the read; only this filter hid them).
  const { data: pitchCalls, isLoading } = useQuery({
    queryKey: ["ae-pitch-calls", user?.id, isAdminTier],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) return [];
      let query = supabase.from("pitch_calls").select("*");
      if (!isAdminTier) query = query.eq("created_by", user.id);
      const { data, error } = await query
        .order("pitch_call_date", { ascending: true })
        .order("pitch_call_time", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Filter pitch calls
  const filteredCalls = useMemo(() => {
    if (!pitchCalls) return [];
    return pitchCalls.filter((pc) => {
      const callDate = new Date(pc.pitch_call_date);
      const isTodayCall = isToday(callDate);
      const isUpcomingCall = isFuture(callDate) && !isTodayCall;
      const isCompleted = pc.status === "completed" || pc.converted_to_client;
      const isDismissed = pc.status === "closed_external" || pc.marked_not_proceeding;

      switch (filter) {
        case "today":
          return isTodayCall && !isCompleted;
        case "upcoming":
          return isUpcomingCall && !isCompleted;
        case "overdue":
          // The former dead zone: past-dated, never completed, not dismissed.
          return !isTodayCall && !isUpcomingCall && !isCompleted && !isDismissed;
        case "completed":
          return isCompleted;
        default:
          return true;
      }
    });
  }, [pitchCalls, filter]);

  // Overdue bucket: past-dated, never completed, not dismissed. These rows
  // match none of the Today/Upcoming/Completed filters (the dead zone found
  // in the 2026-07-30 audit) — surfaced here, newest-first, threshold-gated
  // like the Discovery Needs Outcome banner. 'closed_external' is the
  // quick-dismiss state: deliberately NOT 'completed' (which counts as a SAT
  // pitch in the CEO closing-rate denominator) and NOT marked_not_proceeding
  // (which means LOST and drives the referral-outcome trigger).
  const overdueCalls = useMemo(() => {
    if (!pitchCalls) return [];
    return pitchCalls
      .filter((pc) => {
        const callDate = new Date(pc.pitch_call_date);
        const isPastCall = !isToday(callDate) && !isFuture(callDate);
        const resolved =
          pc.status === "completed" ||
          pc.status === "closed_external" ||
          pc.converted_to_client ||
          pc.marked_not_proceeding;
        return isPastCall && !resolved;
      })
      .reverse();
  }, [pitchCalls]);

  // Rows already linked to a client record (client_profile_id back-filled)
  // are "already converted" — shown separately with dismiss only, never
  // asked for a full outcome.
  const overdueLinked = overdueCalls.filter((pc: any) => pc.client_profile_id != null);
  const overdueUnresolved = overdueCalls.filter((pc: any) => pc.client_profile_id == null);

  const handleDismissOverdue = async (pc: any) => {
    const stamp = `Closed externally — dismissed from Overdue on ${format(new Date(), "d MMM yyyy")} (already closed, no action needed).`;
    const { error } = await supabase
      .from("pitch_calls")
      .update({
        status: "closed_external",
        notes: pc.notes ? `${pc.notes}\n\n${stamp}` : stamp,
      })
      .eq("id", pc.id);
    if (error) {
      console.error(error);
      toast.error("Could not dismiss this follow-up");
      return;
    }
    queryClient.setQueryData(["ae-pitch-calls", user?.id], (old: any[] | undefined) =>
      old?.map((row) => (row.id === pc.id ? { ...row, status: "closed_external" } : row)),
    );
    queryClient.invalidateQueries({ queryKey: ["ae-pitch-calls"] });
    toast.success("Marked as already closed");
  };

  // Today's count for badge
  const todayCount = useMemo(() => {
    if (!pitchCalls) return 0;
    return pitchCalls.filter(
      (pc) => isToday(new Date(pc.pitch_call_date)) && pc.status !== "completed" && !pc.converted_to_client
    ).length;
  }, [pitchCalls]);

  // Apply search + sort
  const displayedCalls = useMemo(() => {
    return applySearchSort(
      filteredCalls,
      search,
      (pc: any) => [pc.client_name, pc.client_email, pc.company_name],
      sortBy,
      sortDir,
      (pc: any, key) => {
        switch (key) {
          case "pitch_call_date":
            return new Date(`${pc.pitch_call_date}T${pc.pitch_call_time || "00:00:00"}`);
          case "client_name":
            return (pc.client_name || "").toLowerCase();
          case "company_name":
            return (pc.company_name || "").toLowerCase();
          case "contract_value":
            return Number(pc.contract_value) || 0;
          default:
            return null;
        }
      },
    );
  }, [filteredCalls, search, sortBy, sortDir]);


  const handlePitchCallClick = (pitchCall: any) => {
    setSelectedPitchCall(pitchCall);
    setIsDrawerOpen(true);
  };

  // ---- Row helpers (15 Oct UI pass: rows, not cards) ----

  const whenRow = (date: string, time?: string | null) =>
    `${format(new Date(`${date}T12:00:00`), 'EEE d MMM')}${time ? ` · ${String(time).slice(0, 5)}` : ''}`;

  const interestLabel = (interest: string | null) => {
    switch (interest) {
      case 'interested':
        return <HealthLabel health="ok">Interested</HealthLabel>;
      case 'unsure':
        return <HealthLabel health="warn">Unsure</HealthLabel>;
      case 'not_interested':
        return <HealthLabel health="bad">Not interested</HealthLabel>;
      default:
        return <span className="text-[12.5px] text-[var(--dim)]">{interest || '—'}</span>;
    }
  };

  const pitchStatusPill = (pc: { converted_to_client: boolean | null; marked_not_proceeding: boolean | null; status: string | null; pitch_call_date: string }) => {
    if (pc.converted_to_client) return <Pill variant="ok">Converted</Pill>;
    if (pc.marked_not_proceeding) return <Pill variant="bad">Not proceeding</Pill>;
    if (pc.status === 'completed') return <Pill variant="info">Completed</Pill>;
    if (isToday(new Date(pc.pitch_call_date))) return <Pill variant="warn">Today</Pill>;
    return <Pill variant="info">Scheduled</Pill>;
  };

  const collapseToggle = (open: boolean) => (
    <CollapsibleTrigger asChild>
      <ButtonV2 variant="ghost" size="sm" aria-expanded={open}>{open ? 'Hide' : 'Show'}</ButtonV2>
    </CollapsibleTrigger>
  );

  const skeletonRows = (
    <div className="space-y-2 pt-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded bg-[var(--surf2)]" />
      ))}
    </div>
  );

  const emptyText = (text: string) => <p className="py-[26px] text-center text-[12px] text-[var(--dim)]">{text}</p>;

  const CALL_FILTERS: { id: CallFilter; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <DashboardLayout role="admin">
      <PageContainer wide>
        <PageHeader
          title="Follow-Up Calls"
          subtitle="Manage follow-up calls and conversions"
          actions={
            <ButtonV2 variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              New Follow-Up
            </ButtonV2>
          }
        />

        <div className="space-y-6">
          {/* Overdue: threshold-gated backlog (matches Discovery's Needs Outcome
              pattern; the header count pill stays the true total regardless) */}
          {overdueCalls.length > NEEDS_OUTCOME_BANNER_THRESHOLD && (
            <Panel
              title="Overdue"
              aside={
                <Pill variant="bad">
                  {overdueCalls.length} follow-up{overdueCalls.length !== 1 ? "s" : ""} need
                  {overdueCalls.length === 1 ? "s" : ""} an outcome
                </Pill>
              }
            >
              {overdueLinked.length > 0 && (
                <>
                  <Eyebrow className="pb-1 pt-3">Already converted · linked to a client</Eyebrow>
                  <RowList columns="140px minmax(0,1fr) auto">
                    {overdueLinked.map((pc) => (
                      <Row key={pc.id} health="ok">
                        <RowNum className="text-[var(--dim)]">{format(new Date(pc.pitch_call_date), "EEE d MMM")}</RowNum>
                        <RowName
                          primary={
                            <span className="flex flex-wrap items-center gap-2">
                              {pc.company_name || pc.client_name}
                              <Pill variant="ok">Linked to active client</Pill>
                            </span>
                          }
                          secondary="this deal already closed — no outcome needed"
                        />
                        <div className="flex justify-end">
                          <ButtonV2 size="sm" onClick={() => handleDismissOverdue(pc)}>Close it out</ButtonV2>
                        </div>
                      </Row>
                    ))}
                  </RowList>
                </>
              )}
              {overdueUnresolved.length > 0 && (
                <RowList columns="140px minmax(0,1fr) auto" className={overdueLinked.length > 0 ? "pt-3" : undefined}>
                  {overdueUnresolved.map((pc) => (
                    <Row key={pc.id} health="warn" focus onClick={() => handlePitchCallClick(pc)}>
                      <RowNum className="text-[var(--dim)]">{whenRow(pc.pitch_call_date, pc.pitch_call_time)}</RowNum>
                      <RowName primary={pc.company_name || pc.client_name} secondary={pc.client_email} />
                      <div className="flex flex-wrap items-center justify-end gap-[8px]" onClick={(e) => e.stopPropagation()}>
                        <ButtonV2 variant="primary" size="sm" onClick={() => handlePitchCallClick(pc)}>Log outcome</ButtonV2>
                        <ButtonV2 variant="ghost" size="sm" onClick={() => handleDismissOverdue(pc)}>Already closed — no action needed</ButtonV2>
                      </div>
                    </Row>
                  ))}
                </RowList>
              )}
            </Panel>
          )}

          {/* Follow-up calls (collapsible, state persisted) */}
          <Collapsible open={isCallsOpen} onOpenChange={setIsCallsOpen}>
            <Panel
              title="Follow-up calls"
              meta={`${displayedCalls.length} follow-up call${displayedCalls.length !== 1 ? "s" : ""}`}
              aside={
                <div className="flex items-center gap-2">
                  {pitchCalls && pitchCalls.length > 0 && <Pill>{pitchCalls.length}</Pill>}
                  {todayCount > 0 && <Pill variant="bad">{todayCount} today</Pill>}
                  {collapseToggle(isCallsOpen)}
                </div>
              }
            >
              <CollapsibleContent>
                <div className="flex flex-wrap items-center gap-2 py-3">
                  {CALL_FILTERS.map((f) => (
                    <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>
                  ))}
                </div>

                <ListSearchSort
                  search={search}
                  onSearchChange={setSearch}
                  sortBy={sortBy}
                  onSortByChange={setSortBy}
                  sortDir={sortDir}
                  onSortDirChange={setSortDir}
                  options={[
                    { value: "pitch_call_date", label: "Call date & time" },
                    { value: "client_name", label: "Client name" },
                    { value: "company_name", label: "Company name" },
                    { value: "contract_value", label: "Contract value" },
                  ]}
                  placeholder="Search client, company, email…"
                />

                {isLoading ? skeletonRows : displayedCalls.length === 0 ? (
                  emptyText(
                    search
                      ? "No follow-up calls match your search."
                      : filter === "today"
                      ? "No follow-up calls scheduled for today."
                      : "No follow-up calls match the selected filter.",
                  )
                ) : (
                  <RowList
                    columns="140px minmax(0,1fr) 130px 90px auto"
                    head={['When', 'Client', 'Interest', <span key="v" className="text-right">Value</span>, <span key="s" className="text-right">Status</span>]}
                  >
                    {displayedCalls.map((pc) => {
                      const isCompleted = pc.status === 'completed';
                      const isTodayCall = isToday(new Date(pc.pitch_call_date));
                      const outcome = pc.pitch_outcome || pc.original_outcome;
                      const canLog = !isCompleted && !pc.converted_to_client && !pc.marked_not_proceeding;
                      return (
                        <Row key={pc.id} focus={isTodayCall && !isCompleted} onClick={() => handlePitchCallClick(pc)}>
                          <RowNum className="text-[var(--dim)]">{whenRow(pc.pitch_call_date, pc.pitch_call_time)}</RowNum>
                          <RowName
                            primary={pc.client_name}
                            secondary={[pc.client_email, pc.company_name, outcome ? `outcome ${outcome.replace(/_/g, ' ')}` : null].filter(Boolean).join(' · ')}
                          />
                          <div>{interestLabel(pc.pitch_interest || pc.original_interest)}</div>
                          <RowNum className="pr-0">{pc.contract_value ? `£${pc.contract_value.toLocaleString()}` : '—'}</RowNum>
                          <div className="flex items-center justify-end gap-[8px]">
                            {pitchStatusPill(pc)}
                            {canLog && (
                              <ButtonV2 size="sm" onClick={(e) => { e.stopPropagation(); handlePitchCallClick(pc); }}>Log outcome</ButtonV2>
                            )}
                          </div>
                        </Row>
                      );
                    })}
                  </RowList>
                )}
              </CollapsibleContent>
            </Panel>
          </Collapsible>
        </div>
      </PageContainer>

        {/* Modals & Drawers */}
        <CompletePitchCallDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          pitchCall={selectedPitchCall}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["ae-pitch-calls"] });
          }}
        />


        <CreatePitchCallModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["ae-pitch-calls"] });
          }}
        />

    </DashboardLayout>
  );
}
