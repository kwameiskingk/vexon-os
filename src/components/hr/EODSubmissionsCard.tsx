import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Smile, Meh, Frown, SmilePlus, Angry } from "lucide-react";
import { format, subDays } from "date-fns";
import { capitalizeSetterName } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  TeamFeedbackFilters,
  FeedbackPeriod,
  getEffectiveRangeStrings,
} from "@/components/feedback/TeamFeedbackFilters";

const moodIcons = {
  very_happy: SmilePlus,
  happy: Smile,
  neutral: Meh,
  unhappy: Frown,
  very_unhappy: Angry,
};

const moodColors = {
  very_happy: "text-green-500",
  happy: "text-green-400",
  neutral: "text-yellow-500",
  unhappy: "text-orange-500",
  very_unhappy: "text-red-500",
};

export const EODSubmissionsCard = () => {
  const [period, setPeriod] = useState<FeedbackPeriod>("today");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<any>(null);

  const { data: eodEntries, isLoading } = useQuery({
    queryKey: ['hr-eod-entries', period, customRange.from?.toISOString(), customRange.to?.toISOString()],
    queryFn: async () => {
      const { start: startDate, end: endDate } = getEffectiveRangeStrings(period, customRange);

      const { data, error } = await supabase
        .from('setter_feedback')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Batch-fetch profiles for performance
      const setterIds = Array.from(new Set((data || []).map((d) => d.setter_id).filter(Boolean)));
      const { data: profs } = await supabase
        .from('setters_profiles')
        .select('user_id, full_name, email, department')
        .in('user_id', setterIds);

      const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));

      return (data || []).map((entry) => ({
        ...entry,
        setters_profiles: profMap.get(entry.setter_id) || null,
      })) as any[];
    }
  });

  const { data: performanceData } = useQuery({
    queryKey: ['hr-performance-for-eod', period, customRange.from?.toISOString(), customRange.to?.toISOString()],
    queryFn: async () => {
      const { start: startDate, end: endDate } = getEffectiveRangeStrings(period, customRange);
      const { data, error } = await supabase
        .from('performance')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) throw error;
      return data || [];
    }
  });

  const { data: rolesMap } = useQuery({
    queryKey: ['hr-eod-roles', (eodEntries || []).map((e: any) => e.setter_id).join(',')],
    queryFn: async () => {
      const ids = Array.from(new Set((eodEntries || []).map((e: any) => e.setter_id).filter(Boolean)));
      if (!ids.length) return new Map<string, string>();
      const { data } = await supabase.from('user_roles').select('user_id, role').in('user_id', ids);
      const m = new Map<string, string>();
      (data || []).forEach((r: any) => {
        if (!m.has(r.user_id)) m.set(r.user_id, r.role);
      });
      return m;
    },
    enabled: (eodEntries || []).length > 0,
  });

  const calculateDailyScore = (mood: string) => {
    const moodScores: Record<string, number> = {
      very_happy: 10, happy: 8, neutral: 5, unhappy: 3, very_unhappy: 1,
    };
    return moodScores[mood] || 0;
  };

  const getKPIs = (email: string, entryDate: string) => {
    if (!performanceData) return null;
    const perf = performanceData.find(p => p.email?.toLowerCase() === email?.toLowerCase() && p.date === entryDate);
    if (!perf) return null;
    return {
      callsMade: perf.dials_made || 0,
      callTime: perf.talk_time || 0,
      warmLeads: perf.conversations || 0,
      meetingsBooked: perf.meetings_booked || 0,
    };
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getDisplayName = (entry: any) => {
    if (entry.setters_profiles?.full_name) return entry.setters_profiles.full_name;
    if (entry.email) return capitalizeSetterName(entry.email);
    return "Unknown User";
  };

  const hasLegacySetterResponses = (entry: any) =>
    entry?.role === 'setter' && (
      entry?.hit_goal !== null ||
      !!entry?.hit_goal_note ||
      !!entry?.anything_else
    );

  const hasNewSetterResponses = (entry: any) =>
    entry?.role === 'setter' && (
      entry?.emails_sent_today !== null ||
      !!entry?.objections_struggled ||
      !!entry?.training_needed
    );

  // Build user options for filter
  const userOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; department: string | null; role: string | null }>();
    (eodEntries || []).forEach((e: any) => {
      if (!seen.has(e.setter_id)) {
        seen.set(e.setter_id, {
          id: e.setter_id,
          name: getDisplayName(e),
          department: e.setters_profiles?.department || null,
          role: rolesMap?.get(e.setter_id) || e.role || null,
        });
      }
    });
    return Array.from(seen.values());
  }, [eodEntries, rolesMap]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    userOptions.forEach((u) => u.department && set.add(u.department));
    return Array.from(set);
  }, [userOptions]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    userOptions.forEach((u) => u.role && set.add(u.role));
    return Array.from(set);
  }, [userOptions]);

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase();
    return (eodEntries || []).filter((e: any) => {
      const opt = userOptions.find((u) => u.id === e.setter_id);
      if (selectedUserIds.size > 0 && !selectedUserIds.has(e.setter_id)) return false;
      if (departmentFilter && opt?.department !== departmentFilter) return false;
      if (roleFilter && opt?.role !== roleFilter) return false;
      if (q && !(opt?.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [eodEntries, userOptions, selectedUserIds, departmentFilter, roleFilter, search]);

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <TeamFeedbackFilters
        showDepartment
        showRole
        period={period}
        onPeriodChange={setPeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        search={search}
        onSearchChange={setSearch}
        users={userOptions}
        selectedUserIds={selectedUserIds}
        onUserToggle={toggleUser}
        onUserClear={() => setSelectedUserIds(new Set())}
        departments={departments}
        departmentFilter={departmentFilter}
        onDepartmentChange={setDepartmentFilter}
        roles={roles}
        roleFilter={roleFilter}
        onRoleChange={setRoleFilter}
      />

      {isLoading ? (
        <div className="text-center text-muted-foreground py-4">Loading...</div>
      ) : filteredEntries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntries.map((entry) => {
            const MoodIcon = moodIcons[entry.mood as keyof typeof moodIcons];
            const moodColor = moodColors[entry.mood as keyof typeof moodColors];
            const dailyScore = calculateDailyScore(entry.mood);
            const displayName = getDisplayName(entry);

            return (
              <Card
                key={entry.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedEntry(entry)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{getInitials(displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{displayName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-xs">{entry.role || 'setter'}</Badge>
                        <span className="text-[10px] text-muted-foreground">{entry.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Mood:</span>
                    {MoodIcon && <MoodIcon className={`h-5 w-5 ${moodColor}`} />}
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Score:</span>
                    <span className="font-bold">{dailyScore}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-8">
          No EOD submissions for the selected filters
        </div>
      )}

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry && getDisplayName(selectedEntry)} — EOD Details · {selectedEntry?.date}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              {selectedEntry.role === 'setter' ? (
                <>
                  <div>
                    <h3 className="font-semibold mb-2">How many meetings did you book today?</h3>
                    <p className="text-muted-foreground">{selectedEntry.meetings_booked_today ?? 'No response'}</p>
                  </div>

                  {hasNewSetterResponses(selectedEntry) ? (
                    <>
                      <div>
                        <h3 className="font-semibold mb-2">How many emails did you send out today?</h3>
                        <p className="text-muted-foreground">{selectedEntry.emails_sent_today ?? 'No response'}</p>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Which objections did you struggle with today?</h3>
                        <p className="text-muted-foreground">{selectedEntry.objections_struggled || 'No response'}</p>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">What do you think you need training on and why?</h3>
                        <p className="text-muted-foreground">{selectedEntry.training_needed || 'No response'}</p>
                      </div>
                    </>
                  ) : hasLegacySetterResponses(selectedEntry) ? (
                    <>
                      <div>
                        <h3 className="font-semibold mb-2">Did they hit their goal today?</h3>
                        <p className="text-muted-foreground">
                          {selectedEntry.hit_goal === true ? 'Yes' : selectedEntry.hit_goal === false ? 'No' : 'No response'}
                        </p>
                      </div>
                      {selectedEntry.hit_goal_note && (
                        <div>
                          <h3 className="font-semibold mb-2">Goal note</h3>
                          <p className="text-muted-foreground">{selectedEntry.hit_goal_note}</p>
                        </div>
                      )}
                      {selectedEntry.anything_else && (
                        <div>
                          <h3 className="font-semibold mb-2">Anything else?</h3>
                          <p className="text-muted-foreground">{selectedEntry.anything_else}</p>
                        </div>
                      )}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold mb-2">What did you do today?</h3>
                    <p className="text-muted-foreground">{selectedEntry.what_you_did || 'No response'}</p>
                  </div>
                  {selectedEntry.role === 'sdr_manager' && (
                    <div>
                      <h3 className="font-semibold mb-2">How many calls did you review today?</h3>
                      <p className="text-muted-foreground">
                        {typeof selectedEntry.calls_reviewed === 'number' ? selectedEntry.calls_reviewed : 'No response'}
                      </p>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold mb-2">What went well today?</h3>
                    <p className="text-muted-foreground">{selectedEntry.what_went_well || 'No response'}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">What did you struggle with today?</h3>
                    <p className="text-muted-foreground">{selectedEntry.what_you_struggled_with || 'No response'}</p>
                  </div>
                </>
              )}

              {selectedEntry.role === 'setter' && getKPIs(selectedEntry.setters_profiles?.email, selectedEntry.date) && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">KPIs for {selectedEntry.date}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Calls Made</p>
                      <p className="text-2xl font-bold">{getKPIs(selectedEntry.setters_profiles?.email, selectedEntry.date)?.callsMade}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Talk Time</p>
                      <p className="text-2xl font-bold">
                        {(() => {
                          const totalMins = getKPIs(selectedEntry.setters_profiles?.email, selectedEntry.date)?.callTime || 0;
                          const hours = Math.floor(totalMins / 60);
                          const mins = totalMins % 60;
                          return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Warm Leads</p>
                      <p className="text-2xl font-bold">{getKPIs(selectedEntry.setters_profiles?.email, selectedEntry.date)?.warmLeads}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Meetings Booked</p>
                      <p className="text-2xl font-bold">{getKPIs(selectedEntry.setters_profiles?.email, selectedEntry.date)?.meetingsBooked}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
