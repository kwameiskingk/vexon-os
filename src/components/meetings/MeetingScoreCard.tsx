import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { SCORE_DIMENSIONS, scoreColorClasses, overallBadgeVariant, type MeetingScore } from '@/lib/meetingScores';
import { Star } from 'lucide-react';

interface Props {
  score: MeetingScore | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export const MeetingScoreCard = ({ score, open, onOpenChange }: Props) => {
  if (!score) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Meeting Quality Score
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Overall */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Overall Quality</p>
              <p className="text-3xl font-bold mt-1">{Number(score.overall_quality).toFixed(2)}</p>
            </div>
            <Badge variant={overallBadgeVariant(Number(score.overall_quality))} className="text-sm px-3 py-1">
              {Number(score.overall_quality) >= 4 ? 'Quality Meeting' : Number(score.overall_quality) >= 3 ? 'Average' : 'Needs Work'}
            </Badge>
          </div>

          {/* 4 score blocks */}
          <div className="grid grid-cols-2 gap-3">
            {SCORE_DIMENSIONS.map(({ key, label }) => {
              const v = (score as any)[key] as number;
              return (
                <div key={key} className={`rounded-lg border p-3 ${scoreColorClasses(v)}`}>
                  <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
                  <p className="text-2xl font-bold mt-0.5">{v}<span className="text-sm opacity-60">/5</span></p>
                </div>
              );
            })}
          </div>

          {/* Meta */}
          <div className="space-y-2 text-sm">
            {score.prospect_company && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Prospect / Company</span>
                <span className="font-medium text-right">{score.prospect_company}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Setter</span>
              <span className="font-medium text-right">{score.setter_name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Client</span>
              <span className="font-medium text-right">{score.client_name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium text-right">{new Date(score.meeting_date).toLocaleDateString()}</span>
            </div>
          </div>

          {score.notes && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{score.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
