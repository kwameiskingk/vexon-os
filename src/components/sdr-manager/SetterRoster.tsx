import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filterToSetterRoleIds } from "@/lib/setterRoleFilter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ChevronLeft, ChevronRight, Plus, X, Building2, Search, 
  CalendarDays, Users, Trash2 
} from "lucide-react";
import { 
  startOfWeek, endOfWeek, addWeeks, subWeeks, format, 
  addDays, isToday, isSameWeek 
} from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SetterRoster = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [addClientSearch, setAddClientSearch] = useState("");
  const [showAddClient, setShowAddClient] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  // Fetch ALL roster clients (shared across SDR Managers and CSMs)
  const { data: rosterClients, isLoading: loadingClients } = useQuery({
    queryKey: ['roster-clients-global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roster_clients')
        .select(`
          id,
          client_profile_id,
          sort_order,
          manager_user_id,
          client_profiles (
            id,
            company_name,
            logo
          )
        `)
        .order('sort_order');
      if (error) throw error;
      // Deduplicate by client_profile_id (in case multiple managers added the same client)
      const seen = new Set<string>();
      return (data || []).filter(rc => {
        const cpId = rc.client_profile_id;
        if (seen.has(cpId)) return false;
        seen.add(cpId);
        return true;
      });
    }
  });

  // Fetch roster entries for this week
  const { data: rosterEntries, isLoading: loadingEntries } = useQuery({
    queryKey: ['roster-entries', format(currentWeekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
      const { data, error } = await supabase
        .from('roster_entries')
        .select(`
          id,
          client_profile_id,
          setter_profile_id,
          roster_date,
          setters_profiles (
            id,
            full_name,
            email
          )
        `)
        .gte('roster_date', format(currentWeekStart, 'yyyy-MM-dd'))
        .lte('roster_date', format(weekEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    }
  });

  // Always fetch all fulfilment setters so both SDR Manager and CSM see the same roster.
  // Role-gated to genuine setters: CSMs / ops / SDR managers share the
  // fulfilment department for scheduling but must never be assignable as the
  // setter on a client (this is why Daniel appeared here as an SDR).
  const { data: assignedSetters } = useQuery({
    queryKey: ['roster-setters-all-fulfilment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters_profiles')
        .select('id, user_id, full_name, email')
        .eq('department', 'fulfilment')
        .eq('active', true)
        .not('is_test_account', 'is', true)
        .order('full_name');
      if (error) throw error;
      const setterRoleIds = await filterToSetterRoleIds((data || []).map((s) => s.user_id));
      return (data || []).filter((s) => s.user_id && setterRoleIds.has(s.user_id));
    }
  });

  // Fetch all clients for the add-client dropdown
  const { data: allClients } = useQuery({
    queryKey: ['all-clients-for-roster'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('id, company_name, logo')
        .eq('status', 'active')
        .order('company_name');
      if (error) throw error;
      return data || [];
    }
  });

  // Add client to roster
  const addClientMutation = useMutation({
    mutationFn: async (clientProfileId: string) => {
      const { error } = await supabase.from('roster_clients').insert({
        client_profile_id: clientProfileId,
        manager_user_id: user?.id,
        sort_order: (rosterClients?.length || 0)
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Client added to roster');
      queryClient.invalidateQueries({ queryKey: ['roster-clients-global'] });
      setShowAddClient(false);
      setAddClientSearch("");
    },
    onError: () => toast.error('Failed to add client')
  });

  // Remove client from roster
  const removeClientMutation = useMutation({
    mutationFn: async (rosterClientId: string) => {
      const { error } = await supabase.from('roster_clients').delete().eq('id', rosterClientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Client removed from roster');
      queryClient.invalidateQueries({ queryKey: ['roster-clients-global'] });
    },
    onError: () => toast.error('Failed to remove client')
  });

  // Assign setter to cell
  const assignSetterMutation = useMutation({
    mutationFn: async ({ clientProfileId, setterProfileId, date }: { 
      clientProfileId: string; setterProfileId: string; date: string 
    }) => {
      // 7 Oct (the owner): a client can have several setters on the same day, so
      // this adds a setter to the cell instead of replacing the one there.
      // The same setter twice on one day is refused by the database (23505).
      const { error } = await supabase.from('roster_entries').insert({
        client_profile_id: clientProfileId,
        setter_profile_id: setterProfileId,
        roster_date: date,
        assigned_by: user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roster-entries'] });
    },
    onError: (e: { code?: string }) =>
      toast.error(e?.code === '23505' ? 'That setter is already on this client for the day' : 'Failed to assign setter')
  });

  // Remove setter from cell
  const removeEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from('roster_entries').delete().eq('id', entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roster-entries'] });
    },
    onError: () => toast.error('Failed to remove assignment')
  });

  const getEntries = (clientId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return (rosterEntries ?? []).filter(
      e => e.client_profile_id === clientId && e.roster_date === dateStr
    );
  };

  const existingClientIds = new Set(rosterClients?.map(rc => rc.client_profile_id) || []);
  const availableClients = allClients?.filter(c => 
    !existingClientIds.has(c.id) &&
    c.company_name.toLowerCase().includes(addClientSearch.toLowerCase())
  ) || [];

  const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 });

  const getInitials = (name: string) => 
    name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';

  return (
    <div className="space-y-5">
      {/* Week Navigation Header */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-sm">
                  {format(currentWeekStart, 'MMM d')} – {format(addDays(currentWeekStart, 4), 'MMM d, yyyy')}
                </h3>
                {isCurrentWeek && (
                  <Badge variant="outline" className="text-[10px] mt-0.5 bg-primary/10 text-primary border-primary/30">
                    Current Week
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" size="icon" className="h-8 w-8"
                onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {!isCurrentWeek && (
                <Button 
                  variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                >
                  Today
                </Button>
              )}
              <Button 
                variant="outline" size="icon" className="h-8 w-8"
                onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Roster Grid */}
      <div className="rounded-[18px] border border-border/50 bg-card/30 backdrop-blur overflow-hidden">
        {/* Column Headers */}
        <div className="grid grid-cols-[200px_repeat(5,1fr)] border-b border-border/30">
          <div className="p-3 flex items-center gap-2 border-r border-border/30">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</span>
          </div>
          {weekDays.map((day, i) => (
            <div 
              key={i}
              className={cn(
                "p-3 text-center border-r border-border/30 last:border-r-0",
                isToday(day) && "bg-primary/5"
              )}
            >
              <p className={cn(
                "text-xs font-semibold",
                isToday(day) ? "text-primary" : "text-foreground"
              )}>
                {format(day, 'EEE')}
              </p>
              <p className={cn(
                "text-[10px]",
                isToday(day) ? "text-primary/70" : "text-muted-foreground"
              )}>
                {format(day, 'MMM d')}
              </p>
            </div>
          ))}
        </div>

        {/* Client Rows */}
        {loadingClients || loadingEntries ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[200px_repeat(5,1fr)] border-b border-border/20">
              <div className="p-3"><Skeleton className="h-8 w-full" /></div>
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="p-2"><Skeleton className="h-8 w-full" /></div>
              ))}
            </div>
          ))
        ) : rosterClients && rosterClients.length > 0 ? (
          rosterClients.map((rc) => {
            const client = rc.client_profiles as any;
            return (
              <div 
                key={rc.id} 
                className="grid grid-cols-[200px_repeat(5,1fr)] border-b border-border/20 last:border-b-0 group/row hover:bg-muted/10 transition-colors"
              >
                {/* Client Name */}
                <div className="p-3 flex items-center gap-2 border-r border-border/30 min-h-[56px]">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {client?.logo ? (
                      <img src={client.logo} alt="" className="w-5 h-5 rounded object-cover" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <span className="text-xs font-medium truncate flex-1">{client?.company_name}</span>
                  <Button
                    variant="ghost" size="icon"
                    className="h-5 w-5 opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => removeClientMutation.mutate(rc.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Day Cells */}
                {weekDays.map((day, dayIdx) => {
                  const entries = getEntries(rc.client_profile_id, day);
                  const onDay = new Set(entries.map(e => e.setter_profile_id));
                  const pickable = (assignedSetters ?? []).filter(s => !onDay.has(s.id));

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "p-1.5 border-r border-border/20 last:border-r-0 min-h-[56px] flex flex-col items-stretch justify-center gap-1",
                        isToday(day) && "bg-primary/5"
                      )}
                    >
                      {entries.map(entry => {
                        const setter = entry.setters_profiles as { full_name?: string | null } | null;
                        if (!setter) return null;
                        return (
                          <div key={entry.id} className="group/cell relative w-full">
                            <div className={cn(
                              "flex items-center gap-1.5 px-2 py-1.5 rounded-lg",
                              "bg-primary/10 border border-primary/20",
                              "transition-all duration-150"
                            )}>
                              <Avatar className="h-6 w-6 flex-shrink-0">
                                <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-medium">
                                  {getInitials(setter.full_name ?? '')}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-[11px] font-medium truncate">
                                {setter.full_name?.split(' ')[0]}
                              </span>
                              <Button
                                variant="ghost" size="icon"
                                className="h-4 w-4 ml-auto opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => removeEntryMutation.mutate(entry.id)}
                              >
                                <X className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                      {(entries.length === 0 || pickable.length > 0) && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              aria-label={entries.length ? 'Add another setter' : 'Assign setter'}
                              className={cn(
                                "w-full rounded-lg border border-dashed border-border/40",
                                entries.length ? "min-h-[24px]" : "h-full min-h-[40px]",
                                "hover:border-primary/40 hover:bg-primary/5 transition-all duration-150",
                                "flex items-center justify-center cursor-pointer group/empty"
                              )}
                            >
                              <Plus className="h-3.5 w-3.5 text-muted-foreground/40 group-hover/empty:text-primary/60 transition-colors" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="center">
                            <p className="text-xs font-medium mb-2 px-1 text-muted-foreground">
                              {entries.length ? 'Add another setter' : 'Assign setter'} for {format(day, 'EEE, MMM d')}
                            </p>
                            <div className="space-y-0.5 max-h-48 overflow-y-auto">
                              {pickable.map(setter => (
                                <button
                                  key={setter.id}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-left"
                                  onClick={() => {
                                    assignSetterMutation.mutate({
                                      clientProfileId: rc.client_profile_id,
                                      setterProfileId: setter.id,
                                      date: format(day, 'yyyy-MM-dd')
                                    });
                                  }}
                                >
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                      {getInitials(setter.full_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs">{setter.full_name}</span>
                                </button>
                              ))}
                              {(!assignedSetters || assignedSetters.length === 0) && (
                                <p className="text-xs text-muted-foreground text-center py-3">No setters assigned to you</p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">No clients in your roster</p>
            <p className="text-xs text-muted-foreground/60">Add clients below to start building your weekly schedule</p>
          </div>
        )}
      </div>

      {/* Add Client Button */}
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardContent className="py-4">
          {showAddClient ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Add Client to Roster</p>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                  setShowAddClient(false);
                  setAddClientSearch("");
                }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={addClientSearch}
                  onChange={(e) => setAddClientSearch(e.target.value)}
                  className="pl-9 h-9"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableClients.length > 0 ? (
                  availableClients.map(client => (
                    <button
                      key={client.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      onClick={() => addClientMutation.mutate(client.id)}
                    >
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {client.logo ? (
                          <img src={client.logo} alt="" className="w-5 h-5 rounded object-cover" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        )}
                      </div>
                      <span className="text-sm">{client.company_name}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {addClientSearch ? 'No matching clients found' : 'All clients are already in your roster'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="w-full border-dashed"
              onClick={() => setShowAddClient(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Client to Roster
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SetterRoster;
