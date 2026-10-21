import { Badge } from "@/components/ui/badge";
import type { CvScreening } from "@/hooks/useCvScreenings";
import { bucketStyles, rejectReasonLabel, reviewStatusLabel } from "./candidateLabels";

interface CandidateRowProps {
  candidate: CvScreening;
  showRejectReason: boolean;
  /** False on TA-facing mounts — the 17 Aug ruling hides the numeric score
      from the TA everywhere; the score stays in the data untouched. */
  showScore: boolean;
  onClick: () => void;
}

export function CandidateRow({ candidate, showRejectReason, showScore, onClick }: CandidateRowProps) {
  const titleLine = [candidate.current_title, candidate.current_company]
    .filter(Boolean)
    .join(" · ");
  // Whisper-level bucket rail.
  const rail = bucketStyles[candidate.bucket]?.rowRail ?? "border-l-transparent";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3 text-left border-b border-border last:border-b-0 border-l-2 ${rail} hover:bg-muted/50 transition-colors`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[15px] text-foreground truncate">
            {candidate.full_name}
          </span>
          {candidate.review_status && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {reviewStatusLabel(candidate.review_status)}
            </Badge>
          )}
          {showRejectReason && candidate.reject_reason && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-red-500/10 text-red-600/90 dark:text-red-400/90 border-red-500/20"
            >
              {rejectReasonLabel(candidate.reject_reason)}
            </Badge>
          )}
        </div>
        {titleLine && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{titleLine}</p>
        )}
      </div>
      {showScore && (
        <span className="font-heading font-semibold text-lg tabular-nums text-foreground shrink-0">
          {candidate.score ?? "—"}
        </span>
      )}
    </button>
  );
}
