-- Native appointment scoring (Batch 3): the CSM scores sat fulfilment
-- meetings in-app on the four rubric criteria, writing into the existing
-- meeting_scores table alongside (and eventually replacing) the Google
-- Sheet "Meeting Log" sync. overall_quality stays the DB-generated average.

-- ── Distinguish native rows from sheet-synced rows ──────────────────────────
ALTER TABLE public.meeting_scores
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sheet'
    CHECK (source IN ('sheet', 'native')),
  ADD COLUMN IF NOT EXISTS scored_by uuid;

-- One native score per meeting. Sheet rows keep their own name-based dedup
-- index (idx_meeting_scores_dedup); this partial index only governs native
-- capture and enables clean re-score-by-update semantics.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_scores_native_appointment
  ON public.meeting_scores(appointment_id)
  WHERE source = 'native' AND appointment_id IS NOT NULL;

-- ── Setter invisibility, enforced at the data layer ─────────────────────────
-- Scores are internal QA: setters and clients must not read them. The staff
-- SELECT policy (admin/dev/ops/csm/sdr_manager/account_executive) remains.
-- Verified before this migration: no setter or client surface consumes
-- meeting_scores (useSetterMeetingScores has zero consumers).
DROP POLICY IF EXISTS "Setters view their own meeting scores" ON public.meeting_scores;
DROP POLICY IF EXISTS "Clients view their meeting scores" ON public.meeting_scores;

-- ── Native writes: csm/admin/dev only ───────────────────────────────────────
-- Sheet-synced rows stay service-role-only (no source='sheet' write policy).
CREATE POLICY "CSM and admins insert native scores"
ON public.meeting_scores FOR INSERT
TO authenticated
WITH CHECK (
  source = 'native'
  AND (
    public.has_role(auth.uid(), 'csm')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
);

CREATE POLICY "CSM and admins update native scores"
ON public.meeting_scores FOR UPDATE
TO authenticated
USING (
  source = 'native'
  AND (
    public.has_role(auth.uid(), 'csm')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
)
WITH CHECK (
  source = 'native'
  AND (
    public.has_role(auth.uid(), 'csm')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  )
);
-- No DELETE policy — corrections go through re-scoring (UPDATE).
