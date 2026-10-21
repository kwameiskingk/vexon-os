import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  ArrowDown,
  CalendarPlus,
  StickyNote,
  Target as TargetIcon,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { getNextTitle, getPreviousTitle, type SetterTitle } from "@/lib/setterTitles";
import CoachingSessionModal from "@/components/sdr-manager/CoachingSessionModal";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { useSetterProfile } from "@/hooks/useSetterProfile";

interface Props {
  setter: NonNullable<ReturnType<typeof useSetterProfile>["setter"]>;
  setterProfileId: string;
  updateTitle: ReturnType<typeof useSetterProfile>["updateTitle"];
  updateCoachingFocus: ReturnType<typeof useSetterProfile>["updateCoachingFocus"];
  updateNotes: ReturnType<typeof useSetterProfile>["updateNotes"];
  onJumpToTargets?: () => void;
  /** "header" = the original quick-actions bar (all six actions, fulfilment
   *  profiles). "card" = an Actions card for the Overview tab (acquisition
   *  profiles) — Adjust Targets and Log Coaching Note are dropped there as
   *  redundant with the Targets and Coaching tabs. */
  variant: "header" | "card";
}

export default function SetterQuickActions({
  setter,
  setterProfileId,
  updateTitle,
  updateCoachingFocus,
  updateNotes,
  onJumpToTargets,
  variant,
}: Props) {
  const { user } = useAuth();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [coachingNoteOpen, setCoachingNoteOpen] = useState(false);
  const [coachingNoteText, setCoachingNoteText] = useState("");
  const [stipulationOpen, setStipulationOpen] = useState(false);
  const [stipulationText, setStipulationText] = useState("");

  const currentTitle = (setter.title || "sdr") as SetterTitle;
  const nextTitle = getNextTitle(currentTitle);
  const prevTitle = getPreviousTitle(currentTitle);

  const handleSaveCoachingNote = () => {
    if (!coachingNoteText.trim()) return;
    updateCoachingFocus.mutate(coachingNoteText.trim(), {
      onSuccess: () => {
        setCoachingNoteOpen(false);
        setCoachingNoteText("");
      },
    });
  };

  const handleSaveStipulation = () => {
    if (!stipulationText.trim()) return;
    const stamp = format(new Date(), "yyyy-MM-dd HH:mm");
    const tag = `[STIPULATION ${stamp}]`;
    const existing = setter.notes || "";
    const updated = `${tag} ${stipulationText.trim()}\n${existing}`.trim();
    updateNotes.mutate(updated, {
      onSuccess: () => {
        setStipulationOpen(false);
        setStipulationText("");
      },
    });
  };

  const scheduleButton = (
    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setScheduleOpen(true)}>
      <CalendarPlus className="h-3.5 w-3.5" />
      Schedule 1-to-1
    </Button>
  );

  const promoteButton = nextTitle && (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-emerald-500 border-emerald-500/30"
      onClick={() => updateTitle.mutate(nextTitle)}
      disabled={updateTitle.isPending}
    >
      <ArrowUp className="h-3.5 w-3.5" />
      Promote
    </Button>
  );

  const demoteButton = prevTitle && (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-amber-500 border-amber-500/30"
      onClick={() => updateTitle.mutate(prevTitle)}
      disabled={updateTitle.isPending}
    >
      <ArrowDown className="h-3.5 w-3.5" />
      Demote
    </Button>
  );

  const stipulationButton = (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5 text-destructive border-destructive/30"
      onClick={() => setStipulationOpen(true)}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
      Mark Stipulation
    </Button>
  );

  return (
    <>
      {variant === "header" ? (
        <div className="flex flex-wrap items-center gap-2">
          {scheduleButton}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCoachingNoteOpen(true)}>
            <StickyNote className="h-3.5 w-3.5" />
            Log Coaching Note
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onJumpToTargets}>
            <TargetIcon className="h-3.5 w-3.5" />
            Adjust Targets
          </Button>
          {promoteButton}
          {demoteButton}
          {stipulationButton}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {scheduleButton}
              {promoteButton}
              {demoteButton}
              {stipulationButton}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schedule 1-to-1 Modal */}
      {user?.id && (
        <CoachingSessionModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          setters={[{ id: setterProfileId, full_name: setter.full_name || setter.email }]}
          managerId={user.id}
        />
      )}

      {/* Coaching Note Modal */}
      <Dialog open={coachingNoteOpen} onOpenChange={setCoachingNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Coaching Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              This sets the setter's current coaching focus, visible to them in their coaching tab.
            </p>
            <Textarea
              placeholder="e.g. Focus on objection handling and tonality this week..."
              value={coachingNoteText}
              onChange={(e) => setCoachingNoteText(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoachingNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCoachingNote}
              disabled={!coachingNoteText.trim() || updateCoachingFocus.isPending}
            >
              Save Coaching Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stipulation Modal */}
      <Dialog open={stipulationOpen} onOpenChange={setStipulationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Stipulation</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Records a timestamped stipulation note. Visible in the Notes tab.
            </p>
            <Textarea
              placeholder="Describe the stipulation or performance concern..."
              value={stipulationText}
              onChange={(e) => setStipulationText(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStipulationOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleSaveStipulation}
              disabled={!stipulationText.trim() || updateNotes.isPending}
            >
              Save Stipulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
