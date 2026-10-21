import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePersistedState } from "@/hooks/usePersistedState";
import { MeetingBoardFilterTabs } from "./MeetingBoardFilterTabs";
import { useMeetingBoardUsers, type MeetingBoardFilter } from "@/hooks/useMeetingBoardUsers";
import { UserAvatar } from "@/components/ui/user-avatar";

const formatRole = (role: string): string => {
  if (role === 'account_executive') return 'Account Executive';
  if (role === 'csm') return 'CSM';
  if (role === 'sdr_manager') return 'SDR Manager';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

interface MorningLog {
  meetings_goal?: number | null;
  conversations_goal?: number | null;
  goal?: string | null;
  blocker?: string | null;
}

interface EodLog {
  id?: string;
  achieved: boolean | null;
  reason_not_achieved: string | null;
}

export function EODMeetingBoard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [morningLogs, setMorningLogs] = useState<Record<string, MorningLog>>({});
  const [eodLogs, setEodLogs] = useState<Record<string, EodLog>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = usePersistedState('eod-meeting-board-open', false);
  const [filter, setFilter] = usePersistedState<MeetingBoardFilter>('eod-board-filter', 'sales');
  const { allUsers, isLoading, getFilteredUsers } = useMeetingBoardUsers();

  const filteredUsers = useMemo(
    () => getFilteredUsers(filter, searchQuery),
    [allUsers, filter, searchQuery, getFilteredUsers]
  );

  useEffect(() => {
    if (allUsers.length > 0) loadLogs();
  }, [selectedDate, allUsers]);

  const loadLogs = async () => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const userIds = allUsers.map(u => u.id);

    try {
      const [{ data: morningData }, { data: eodData }] = await Promise.all([
        supabase.from('meeting_logs').select('*').eq('meeting_type', 'morning').eq('date', dateStr).in('setter_id', userIds),
        supabase.from('meeting_logs').select('*').eq('meeting_type', 'eod').eq('date', dateStr).in('setter_id', userIds),
      ]);

      const mMap: Record<string, MorningLog> = {};
      (morningData || []).forEach(log => {
        mMap[log.setter_id] = {
          meetings_goal: log.meetings_goal,
          conversations_goal: log.conversations_goal,
          goal: log.goal,
          blocker: log.blocker,
        };
      });
      setMorningLogs(mMap);

      const eMap: Record<string, EodLog> = {};
      (eodData || []).forEach(log => {
        eMap[log.setter_id] = {
          id: log.id,
          achieved: log.achieved,
          reason_not_achieved: log.reason_not_achieved,
        };
      });
      setEodLogs(eMap);
    } catch (error) {
      console.error("Error loading logs:", error);
    }
  };

  const handleAchievedToggle = async (userId: string, achieved: boolean) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    setEodLogs(prev => ({
      ...prev,
      [userId]: { ...prev[userId], achieved, reason_not_achieved: prev[userId]?.reason_not_achieved || null },
    }));
    await saveEodLog(userId, { achieved }, dateStr);
  };

  const handleNotesChange = (userId: string, notes: string) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    setEodLogs(prev => ({
      ...prev,
      [userId]: { ...prev[userId], achieved: prev[userId]?.achieved ?? null, reason_not_achieved: notes },
    }));
    saveEodLog(userId, { reason_not_achieved: notes }, dateStr);
  };

  const saveEodLog = async (userId: string, updates: Record<string, any>, dateStr: string) => {
    const existingLog = eodLogs[userId];
    try {
      if (existingLog?.id) {
        await supabase.from('meeting_logs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', existingLog.id);
      } else {
        const { data } = await supabase.from('meeting_logs').insert({
          setter_id: userId, date: dateStr, meeting_type: 'eod',
          achieved: updates.achieved ?? null, reason_not_achieved: updates.reason_not_achieved ?? null,
        }).select().single();
        if (data) {
          setEodLogs(prev => ({ ...prev, [userId]: { ...prev[userId], id: data.id } }));
        }
      }
    } catch (error) {
      console.error("Error saving log:", error);
    }
  };

  const isNumeric = filter === 'sales' || filter === 'fulfillment';

  const getMorningGoalDisplay = (userId: string) => {
    const m = morningLogs[userId];
    if (!m) return "—";

    if (isNumeric) {
      const parts: string[] = [];
      if (m.meetings_goal != null) parts.push(`${m.meetings_goal} meetings`);
      if (m.conversations_goal != null) parts.push(`${m.conversations_goal} convos`);
      return parts.length > 0 ? parts.join(' · ') : "—";
    } else {
      const parts: string[] = [];
      if (m.goal) parts.push(m.goal);
      if (m.blocker) parts.push(`Challenges: ${m.blocker}`);
      return parts.length > 0 ? parts.join(' | ') : "—";
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-xl font-heading font-semibold hover:text-primary transition-colors">
            {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
            <CalendarIcon className="h-5 w-5 text-primary" />
            EOD Meeting Board
            <span className="text-sm font-normal text-muted-foreground ml-2">
              End-of-day review & reflection
            </span>
          </button>
        </CollapsibleTrigger>

        {isOpen && (
          <div className="flex items-center gap-3 flex-wrap">
            <MeetingBoardFilterTabs activeFilter={filter} onFilterChange={setFilter} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={selectedDate} onSelect={date => date && setSelectedDate(date)} initialFocus />
              </PopoverContent>
            </Popover>
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
            </div>
          </div>
        )}
      </div>

      <CollapsibleContent className="space-y-3">
        <div className="rounded-xl border border-border/40 overflow-hidden bg-card/30 backdrop-blur-sm">
          {/* Header */}
          <div className="grid grid-cols-[1fr_minmax(200px,2fr)_120px_minmax(180px,1.5fr)] gap-4 px-4 py-3 bg-muted/20 border-b border-border/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Team Member</div>
            <div>Goal From Morning</div>
            <div>Achieved?</div>
            <div>Notes</div>
          </div>

          {/* Body */}
          <div className="divide-y divide-border/20">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">
                No team members found
              </div>
            ) : (
              filteredUsers.map(user => {
                const eodLog = eodLogs[user.id];
                const achieved = eodLog?.achieved;

                return (
                  <div
                    key={user.id}
                    className={cn(
                      "grid grid-cols-[1fr_minmax(200px,2fr)_120px_minmax(180px,1.5fr)] gap-4 px-4 py-3 items-center transition-colors hover:bg-muted/10",
                      achieved === true && "bg-green-500/5",
                      achieved === false && "bg-red-500/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={user.name} avatarUrl={user.avatarUrl} className="h-8 w-8 text-xs" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">{user.name}</div>
                        <div className="text-[11px] text-muted-foreground">{formatRole(user.role)}</div>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground italic truncate">
                      {getMorningGoalDisplay(user.id)}
                    </div>

                    <div className="flex gap-1.5">
                      <Button
                        variant={achieved === true ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleAchievedToggle(user.id, true)}
                        className={cn("flex-1 h-8 text-xs", achieved === true && "bg-green-600 hover:bg-green-700 border-green-600")}
                      >
                        Yes
                      </Button>
                      <Button
                        variant={achieved === false ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleAchievedToggle(user.id, false)}
                        className={cn("flex-1 h-8 text-xs", achieved === false && "bg-red-600 hover:bg-red-700 border-red-600")}
                      >
                        No
                      </Button>
                    </div>

                    <Textarea
                      placeholder={achieved === false ? "Why not achieved..." : "Notes..."}
                      value={eodLog?.reason_not_achieved || ''}
                      onChange={e => handleNotesChange(user.id, e.target.value)}
                      className="min-h-[36px] h-9 resize-none text-sm bg-background/50 border-border/40"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
