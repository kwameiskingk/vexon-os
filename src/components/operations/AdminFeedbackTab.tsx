import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EODSubmissionModal } from "./EODSubmissionModal";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Smile, Meh, Frown, SmilePlus, Angry } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { capitalizeSetterName } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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

export const AdminFeedbackTab = () => {
  const queryClient = useQueryClient();
  const [showEODModal, setShowEODModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEntry, setSelectedEntry] = useState<any>(null);

  const { data: eodEntries, isLoading } = useQuery({
    queryKey: ['eod-entries', selectedDate],
    queryFn: async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('setter_feedback')
        .select('*')
        .eq('date', dateStr)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Manually fetch setter profiles for each entry
      const entriesWithProfiles = await Promise.all(
        (data || []).map(async (entry) => {
          const { data: setterProfile } = await supabase
            .from('setters_profiles')
            .select('full_name, email')
            .eq('user_id', entry.setter_id)
            .maybeSingle();
          
          return {
            ...entry,
            setters_profiles: setterProfile
          };
        })
      );
      
      return entriesWithProfiles as any[];
    }
  });

  const { data: performanceData } = useQuery({
    queryKey: ['performance-for-eod', selectedDate],
    queryFn: async () => {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('performance')
        .select('*')
        .eq('date', dateStr);
      
      if (error) throw error;
      return data || [];
    }
  });

  const calculateDailyScore = (mood: string) => {
    const moodScores: Record<string, number> = {
      very_happy: 10,
      happy: 8,
      neutral: 5,
      unhappy: 3,
      very_unhappy: 1,
    };
    return moodScores[mood] || 0;
  };

  const getKPIs = (email: string) => {
    if (!performanceData) return null;
    const perf = performanceData.find(p => p.email?.toLowerCase() === email?.toLowerCase());
    if (!perf) return null;
    
    return {
      callsMade: perf.dials_made || 0,
      callTime: perf.talk_time || 0,
      warmLeads: perf.conversations || 0,
      meetingsBooked: perf.meetings_booked || 0,
    };
  };

  const handleCardClick = (entry: any) => {
    setSelectedEntry(entry);
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "??";
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getDisplayName = (entry: any) => {
    if (entry.setters_profiles?.full_name) {
      return entry.setters_profiles.full_name;
    }
    if (entry.email) {
      return capitalizeSetterName(entry.email);
    }
    return "Unknown User";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">End of Day Submissions</h2>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={() => setShowEODModal(true)}>Submit EOD</Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground">Loading...</div>
      ) : eodEntries && eodEntries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {eodEntries.map((entry) => {
            const MoodIcon = moodIcons[entry.mood as keyof typeof moodIcons];
            const moodColor = moodColors[entry.mood as keyof typeof moodColors];
            const dailyScore = calculateDailyScore(entry.mood);
            const displayName = getDisplayName(entry);

            return (
              <Card
                key={entry.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => handleCardClick(entry)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <CardTitle className="text-base">{displayName}</CardTitle>
                      <Badge variant="outline" className="mt-1">{entry.role || 'setter'}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Mood:</span>
                    {MoodIcon && <MoodIcon className={`h-6 w-6 ${moodColor}`} />}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Daily Score:</span>
                    <span className="font-bold text-lg">{dailyScore}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No EOD submissions for {format(selectedDate, "MMMM d, yyyy")}
          </CardContent>
        </Card>
      )}

      <EODSubmissionModal
        open={showEODModal}
        onOpenChange={setShowEODModal}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['eod-entries'] })}
      />

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry && getDisplayName(selectedEntry)} - EOD Details
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">What did you do today?</h3>
                <p className="text-muted-foreground">{selectedEntry.what_you_did || 'No response'}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">What went well today?</h3>
                <p className="text-muted-foreground">{selectedEntry.what_went_well || 'No response'}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">What did you struggle with today?</h3>
                <p className="text-muted-foreground">{selectedEntry.what_you_struggled_with || 'No response'}</p>
              </div>
              
              {selectedEntry.role === 'setter' && getKPIs(selectedEntry.email) && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">KPIs for {format(selectedDate, "MMMM d, yyyy")}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Calls Made</p>
                      <p className="text-2xl font-bold">{getKPIs(selectedEntry.email)?.callsMade}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Talk Time</p>
                      <p className="text-2xl font-bold">
                        {(() => {
                          const totalMins = getKPIs(selectedEntry.email)?.callTime || 0;
                          const hours = Math.floor(totalMins / 60);
                          const mins = totalMins % 60;
                          return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        })()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Warm Leads</p>
                      <p className="text-2xl font-bold">{getKPIs(selectedEntry.email)?.warmLeads}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Meetings Booked</p>
                      <p className="text-2xl font-bold">{getKPIs(selectedEntry.email)?.meetingsBooked}</p>
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
