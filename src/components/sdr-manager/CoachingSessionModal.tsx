import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { CalendarIcon } from "lucide-react";
import { format, addWeeks } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CoachingSessionModalProps {
  open: boolean;
  onClose: () => void;
  setters: { id: string; full_name: string }[];
  managerId: string;
}

const sessionTypes = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'weekly_1to1', label: 'Weekly 1:1' },
  { value: 'pip_review', label: 'PIP Review' },
  { value: 'call_review', label: 'Call Review' },
  { value: 'custom', label: 'Custom...' },
];

const timeSlots = Array.from({ length: 24 }, (_, h) =>
  ['00', '30'].map(m => {
    const hour = h.toString().padStart(2, '0');
    return `${hour}:${m}`;
  })
).flat();

const CoachingSessionModal = ({ open, onClose, setters, managerId }: CoachingSessionModalProps) => {
  const queryClient = useQueryClient();
  const [setterId, setSetterId] = useState("");
  const [sessionType, setSessionType] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [sessionDate, setSessionDate] = useState<Date>(new Date());
  const [sessionTime, setSessionTime] = useState("09:00");
  const [agenda, setAgenda] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState("4");
  const [recurringInterval, setRecurringInterval] = useState<'weekly' | 'fortnightly'>('weekly');

  const resetForm = () => {
    setSetterId("");
    setSessionType("");
    setCustomLabel("");
    setSessionDate(new Date());
    setSessionTime("09:00");
    setAgenda("");
    setIsRecurring(false);
    setRecurringWeeks("4");
    setRecurringInterval('weekly');
  };

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const recurringGroupId = isRecurring ? crypto.randomUUID() : null;
      const weeksCount = parseInt(recurringWeeks) || 1;
      const intervalWeeks = recurringInterval === 'fortnightly' ? 2 : 1;
      const sessionsToCreate = isRecurring ? weeksCount : 1;

      const sessions = Array.from({ length: sessionsToCreate }, (_, i) => ({
        setter_profile_id: setterId,
        manager_user_id: managerId,
        session_type: sessionType === 'custom' ? 'custom' : sessionType,
        custom_session_label: sessionType === 'custom' ? customLabel : null,
        session_date: format(addWeeks(sessionDate, i * intervalWeeks), 'yyyy-MM-dd'),
        session_time: sessionTime,
        agenda: agenda || null,
        status: 'scheduled',
        recurring_group_id: recurringGroupId,
      }));

      const { error } = await supabase
        .from('coaching_sessions')
        .insert(sessions);

      if (error) throw error;
    },
    onSuccess: () => {
      const count = isRecurring ? parseInt(recurringWeeks) || 1 : 1;
      toast.success(count > 1 ? `${count} coaching sessions scheduled` : 'Coaching session scheduled');
      queryClient.invalidateQueries({ queryKey: ['sdr-manager-coaching-sessions'] });
      resetForm();
      onClose();
    },
    onError: (error: any) => {
      console.error('Coaching session creation error:', error);
      toast.error(`Failed to schedule session: ${error?.message || 'Unknown error'}`);
    }
  });

  const isCustom = sessionType === 'custom';
  const isValid = setterId && sessionType && sessionDate && (!isCustom || customLabel.trim());

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Coaching Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Setter */}
          <div className="space-y-2">
            <Label>Setter <span className="text-destructive">*</span></Label>
            <Select value={setterId} onValueChange={setSetterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select setter" />
              </SelectTrigger>
              <SelectContent>
                {setters.map(setter => (
                  <SelectItem key={setter.id} value={setter.id}>
                    {setter.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Session Type */}
          <div className="space-y-2">
            <Label>Session Type <span className="text-destructive">*</span></Label>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {sessionTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Label */}
          {isCustom && (
            <div className="space-y-2">
              <Label>Session Label <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Objection handling deep-dive, Shadow session..."
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !sessionDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {sessionDate ? format(sessionDate, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={sessionDate}
                    onSelect={(date) => date && setSessionDate(date)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Time <span className="text-destructive">*</span></Label>
              <Select value={sessionTime} onValueChange={setSessionTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {timeSlots.map(time => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Agenda */}
          <div className="space-y-2">
            <Label>Agenda <span className="text-xs text-muted-foreground">(visible to setter)</span></Label>
            <Textarea
              placeholder="What will this session cover? The setter will see this..."
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              rows={2}
            />
          </div>

          {/* Recurring */}
          <div className="rounded-lg border border-border/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Recurring Session</Label>
                <p className="text-xs text-muted-foreground">Auto-create multiple sessions</p>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Frequency</Label>
                  <Select value={recurringInterval} onValueChange={(v) => setRecurringInterval(v as any)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Number of sessions</Label>
                  <Select value={recurringWeeks} onValueChange={setRecurringWeeks}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 4, 6, 8, 12].map(n => (
                        <SelectItem key={n} value={n.toString()}>{n} sessions</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => createSessionMutation.mutate()}
            disabled={!isValid || createSessionMutation.isPending}
          >
            {isRecurring ? `Schedule ${recurringWeeks} Sessions` : 'Schedule Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CoachingSessionModal;
