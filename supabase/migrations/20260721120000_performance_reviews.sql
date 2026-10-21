-- Monthly Performance Review (setter scope, v1).
--
-- performance_reviews holds one compiled review per person per period: the
-- deterministic numbers (compiled_metrics jsonb) assembled client-side from
-- the same shared metric functions the leaderboards use. performance_review_briefs
-- holds the AI narrative written by the performance-review-compile edge
-- function; it is the realtime-watched table (mirrors call_review_briefs).
--
-- RLS (revised per 2026-07-21 access ruling): VIEW is admin/dev/ops only
-- (csm and sdr_manager deliberately removed); GENERATE/write is
-- admin/dev/ops. The setter role appears in NO policy — setters must not be
-- able to select their own review (screenshare is the only way they see
-- it). The edge function writes via the service role and is unaffected.
--
-- NOT applied by the assistant — the owner previews and applies.

CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewee_user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'setter'
    CHECK (role IN ('setter', 'account_executive', 'sdr_manager', 'csm', 'hr')),
  department text
    CHECK (department IS NULL OR department IN ('acquisition', 'fulfilment')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_by uuid NOT NULL,
  compiled_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generating', 'complete', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewee_period
  ON public.performance_reviews (reviewee_user_id, period_start DESC);

CREATE TRIGGER trg_performance_reviews_updated_at
BEFORE UPDATE ON public.performance_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view performance reviews"
ON public.performance_reviews FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
);

CREATE POLICY "Admin, dev and ops manage performance reviews"
ON public.performance_reviews FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
);

CREATE TABLE IF NOT EXISTS public.performance_review_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  brief jsonb,
  model text,
  status text NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'complete', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_performance_review_briefs_review
  ON public.performance_review_briefs (review_id, created_at DESC);

CREATE TRIGGER trg_performance_review_briefs_updated_at
BEFORE UPDATE ON public.performance_review_briefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.performance_review_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view performance review briefs"
ON public.performance_review_briefs FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
);

CREATE POLICY "Admin, dev and ops manage performance review briefs"
ON public.performance_review_briefs FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
);

-- Realtime so the UI can watch the brief flip from generating → complete
-- (same pattern as call_review_briefs; guarded so re-runs are safe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'performance_review_briefs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_review_briefs;
  END IF;
END $$;

ALTER TABLE public.performance_review_briefs REPLICA IDENTITY FULL;
