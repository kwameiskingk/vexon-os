import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useCvScreenings, type CvScreening } from "@/hooks/useCvScreenings";
import { useHiringPipeline } from "@/hooks/useHiringPipeline";
import {
  NEW_CANDIDATES_QUERY_KEY,
  markCandidatesSeen,
} from "@/hooks/useNewCandidatesCount";
import {
  BUCKET_TABS,
  REVIEW_STATUS_OPTIONS,
  bucketStyles,
} from "./candidateLabels";
import { CandidateRow } from "./CandidateRow";
import { CandidateModal } from "./CandidateModal";
import { CandidatesInfoPanel } from "./CandidatesInfoPanel";
import { CallListCsvImport } from "@/components/ta/CallListCsvImport";
import { AddCandidateDialog } from "./AddCandidateDialog";
import { explicitSourceOf } from "@/lib/candidateSource";
import { SourcesPanel } from "./SourcesPanel";

const STATUS_FILTER_ALL = "all";
const STATUS_FILTER_UNSET = "unset";

// 2 Sep consolidation: the TA portal is retired and Elena runs recruiting
// here under her own login, so the old taView fork (17 Aug: hide scores from
// the TA, CSV import TA-only) is gone — this single mount shows the scores
// AND carries the CSV import that used to live behind the TA flag.
export function CandidateScreenings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: candidates, isLoading, isError } = useCvScreenings();
  const { data: pipelineResult } = useHiringPipeline();

  // A screening that has been promoted to the hiring pipeline (its linked
  // candidates row has a real stage — booked or beyond) no longer belongs in
  // these buckets: it lives in Candidate Tracking now. Driven by DB state via
  // the M4 bridge (cv_screenings.candidate_id / candidates.cv_screening_id),
  // never by a client-only flag, so it survives refresh.
  const promoted = useMemo(() => {
    const screeningIds = new Set<string>();
    const candidateIds = new Set<string>();
    for (const c of pipelineResult?.data ?? []) {
      if (!c.stage_key || c.stage_key === "screening") continue;
      if (c.cv_screening_id) screeningIds.add(c.cv_screening_id);
      candidateIds.add(c.id);
    }
    return { screeningIds, candidateIds };
  }, [pipelineResult]);


  const [activeBucket, setActiveBucket] = useState<string>("SHORTLIST");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_FILTER_ALL);
  // 11 Sep: click a row in the Sources panel to see one channel only.
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<CvScreening | null>(null);

  // Visiting the tab clears the "N new since you last checked" badge.
  useEffect(() => {
    if (!user?.id) return;
    markCandidatesSeen(user.id);
    queryClient.invalidateQueries({ queryKey: NEW_CANDIDATES_QUERY_KEY });
  }, [user?.id, queryClient]);

  // Search + filters apply across every tab; the tab then narrows by bucket,
  // so the tab counts reflect the active search/filters.
  const filtered = useMemo(() => {
    const all = candidates ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((c) => {
      if (promoted.screeningIds.has(c.id)) return false;
      const linkedCandidate = (c as CvScreening & { candidate_id?: string | null }).candidate_id;
      if (linkedCandidate && promoted.candidateIds.has(linkedCandidate)) return false;
      if (q) {
        const hit =
          c.full_name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.current_company ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (sourceFilter && explicitSourceOf(c) !== sourceFilter) return false;
      if (statusFilter === STATUS_FILTER_UNSET) return c.review_status === null;
      if (statusFilter !== STATUS_FILTER_ALL) return c.review_status === statusFilter;
      return true;
    });
  }, [candidates, promoted, search, sourceFilter, statusFilter]);

  const bucketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filtered) counts[c.bucket] = (counts[c.bucket] ?? 0) + 1;
    return counts;
  }, [filtered]);

  const visible = filtered.filter((c) => c.bucket === activeBucket);

  // 11 Sep: the CV screening agent is retired and Elena no longer exports
  // to Close (she feeds the dashboard from her sheets now), so the score
  // filter, the score column and "Export for Close" are gone. Bucket tabs
  // other than the call list only show while legacy agent rows remain.
  const visibleTabs = BUCKET_TABS.filter(
    (t) => t.bucket === "SHORTLIST" || (bucketCounts[t.bucket] ?? 0) > 0,
  );

  // The modal candidate must track the cache so a save reflects immediately.
  const selectedLive = selected
    ? (candidates ?? []).find((c) => c.id === selected.id) ?? selected
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or company…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_FILTER_ALL}>All statuses</SelectItem>
            <SelectItem value={STATUS_FILTER_UNSET}>Unset</SelectItem>
            {REVIEW_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AddCandidateDialog screenings={candidates ?? []} />
        <CallListCsvImport screenings={candidates ?? []} />
        <CandidatesInfoPanel showScoreSection={false} />
      </div>

      <SourcesPanel rows={candidates ?? []} active={sourceFilter} onSelect={setSourceFilter} />

      <Tabs value={activeBucket} onValueChange={setActiveBucket}>
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          {visibleTabs.map((t) => (
            <TabsTrigger
              key={t.bucket}
              value={t.bucket}
              className={`gap-1.5 ${bucketStyles[t.bucket].activeTab}`}
            >
              {t.label}
              <span
                className={`text-[11px] tabular-nums rounded-full px-1.5 py-px font-medium ${bucketStyles[t.bucket].countPill}`}
              >
                {bucketCounts[t.bucket] ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            Loading candidates…
          </p>
        ) : isError ? (
          <p className="px-4 py-8 text-sm text-destructive text-center">
            Couldn&apos;t load candidates — try refreshing.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            No candidates match.
          </p>
        ) : (
          visible.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              showRejectReason={activeBucket === "REJECT"}
              showScore={false}
              onClick={() => setSelected(c)}
            />
          ))
        )}
      </div>

      <CandidateModal
        candidate={selectedLive}
        open={selected !== null}
        showScore
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
