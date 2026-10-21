import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Lightbulb, Sparkles, ThumbsUp, TrendingUp } from "lucide-react";
import type { ReviewBriefRow } from "@/hooks/useSetterReview";

/**
 * Claude's coaching narrative — interpretation only, visually separated from
 * the deterministic numbers panel. Every figure it mentions exists verbatim
 * in compiled_metrics; the model is instructed never to compute.
 */
export function ReviewNarrativePanel({ brief }: { brief: ReviewBriefRow | null | undefined }) {
  if (!brief || brief.status === "generating") {
    return (
      <Card data-reveal="10" className="border-dashed border-primary/40 bg-primary/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" /> Coaching narrative
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generating your review… this usually takes under a minute.
          </p>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
    );
  }

  if (brief.status === "failed") {
    return (
      <Card data-reveal="10" className="border-destructive/40 bg-destructive/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Narrative failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {brief.error || "Unknown error."} The numbers above are unaffected — regenerate to retry
            the narrative.
          </p>
        </CardContent>
      </Card>
    );
  }

  const b = brief.brief || {};

  return (
    <Card data-reveal="10" className="border-primary/25 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Coaching narrative
          </CardTitle>
          <Badge variant="outline" className="text-muted-foreground text-[10px]">
            Generated commentary — numbers above are the source of truth
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {b.what_moved && (b.what_moved.summary || b.what_moved.likely_why) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> What moved
            </div>
            {b.what_moved.summary && <p className="text-sm leading-relaxed">{b.what_moved.summary}</p>}
            {b.what_moved.likely_why && (
              <p className="text-sm text-muted-foreground leading-relaxed">{b.what_moved.likely_why}</p>
            )}
          </div>
        )}

        {(b.strengths?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <ThumbsUp className="h-4 w-4 text-emerald-600" /> Strengths
            </div>
            <ul className="space-y-1">
              {b.strengths!.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed pl-4 relative">
                  <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(b.gaps_vs_target?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Gaps vs target
            </div>
            <ul className="space-y-1">
              {b.gaps_vs_target!.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed pl-4 relative">
                  <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(b.focus_areas?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Lightbulb className="h-4 w-4 text-primary" /> Focus for next month
            </div>
            <ul className="space-y-1">
              {b.focus_areas!.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed pl-4 relative">
                  <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
