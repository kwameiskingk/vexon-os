import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Explainer copy checked against the screening skill's output contract —
// verbatim from the approved brief (2026-08-07). Do not paraphrase or
// embellish when editing. TA mounts omit the score section wholesale (the
// 17 Aug ruling hides scores from the TA) — the text itself is unchanged.
export function CandidatesInfoPanel({ showScoreSection = true }: { showScoreSection?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="How this works">
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-h-[70vh] overflow-y-auto text-sm space-y-3">
        <div>
          <h4 className="font-semibold mb-1.5">How this works</h4>
          <p className="mb-1.5">
            Every CV is read directly by an AI system, then goes through four steps:
          </p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>It checks whether the file can be read at all.</li>
            <li>It extracts what&apos;s actually on the CV — job titles, dates, described work.</li>
            <li>
              A script (not the AI) does the maths — counting months of relevant
              experience and time since the last relevant role. Dates are calculated
              by code, not guessed by AI, because AI sometimes gets date arithmetic
              wrong while sounding confident.
            </li>
            <li>The AI weighs everything and sorts the candidate into a bucket.</li>
          </ol>
        </div>
        {showScoreSection && (
        <div>
          <h4 className="font-semibold mb-1.5">About the score</h4>
          <p>
            It&apos;s the AI&apos;s overall confidence rating out of 100, based on the
            same evidence you see in the Pros, Cons, and reasoning — not a fixed
            formula with weighted categories. Two candidates with similar scores can
            be strong for different reasons. Treat it as a ranking signal within a
            bucket, not a precise measurement — the Pros/Cons/Gaps are the real
            substance; the score is a quick way to sort them.
          </p>
        </div>
        )}
        <div>
          <h4 className="font-semibold mb-1.5">Why some strong-looking CVs get rejected</h4>
          <p>
            The system is deliberately cautious about only five things — under 10
            months of relevant tenure, consumer-only sales experience, no sales
            experience at all, the relevant work being too long ago, or too large a
            gap in employment. It&apos;s tuned to lean generous — missing a good
            candidate is worse than one extra phone call to rule someone out.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
