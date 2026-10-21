-- ============================================================
-- CV screening agent → Vexon OS: cv_screenings table
-- Approved 2026-08-07 (CV_SCREENING_SCHEMA_PROPOSAL.md §7 rulings).
-- One row = latest screening of one CV file. Agent + backfill write
-- via service role (bypasses RLS); humans edit only review_status /
-- ops_notes / is_archived through the Ops Command UI.
-- Applied manually via the hosted SQL editor on 2026-08-07 — never
-- `supabase db push`. Repair-list entry when CLI access works:
--   supabase migration repair --status applied 20260807120000
-- Safe to re-run: all statements guarded.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cv_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- identity & dedup: slug computed in code with run_parallel.py's
  -- slugify rule — NEVER the AI-emitted candidate_id (kept below for
  -- traceability only; it is the proven source of the Sheet duplicates)
  source_file text NOT NULL,
  source_file_slug text NOT NULL UNIQUE,
  agent_candidate_id text,

  -- run metadata
  screened_on date NOT NULL,
  last_screened_at timestamptz,  -- NULL = screened once; set only when a re-screen overwrites the row
  run_id text,
  skill_version text,
  ingested_via text NOT NULL DEFAULT 'agent'
    CHECK (ingested_via IN ('agent', 'sheet_import')),

  -- contact block (nullable: "no contact details on CV" is a real, kept case)
  full_name text NOT NULL,
  phone text,
  email text,
  linkedin_url text,
  location text,

  -- verdict
  bucket text NOT NULL
    CHECK (bucket IN ('SHORTLIST', 'MAYBE', 'REJECT', 'REVIEW_MANUALLY')),
  score integer,
  reject_reason text
    CHECK (reject_reason IN ('tenure_under_10_months', 'b2c_only',
                             'no_sales_experience', 'stale', 'long_gap')),

  -- employment & gates (all nullable — unreadable CVs carry none of this)
  current_title text,
  current_company text,
  currently_employed boolean,
  qualifying_months integer,
  months_since_last_qualifying integer,
  gate_tenure text
    CHECK (gate_tenure IN ('pass', 'fail', 'near_miss', 'unknown')),
  gate_recency text
    CHECK (gate_recency IN ('pass', 'fail', 'near_miss', 'unknown')),

  -- narrative & audit trail (arrays stay arrays; evidence is verbatim CV quotes)
  pros text[] NOT NULL DEFAULT '{}',
  cons text[] NOT NULL DEFAULT '{}',
  gaps_to_probe text[] NOT NULL DEFAULT '{}',
  evidence text[] NOT NULL DEFAULT '{}',
  flags text[] NOT NULL DEFAULT '{}',
  date_issues text[] NOT NULL DEFAULT '{}',
  reasoning text,
  signals jsonb,
  market_exposure jsonb,

  -- raw transcription fields (verbatim from CV; matric_year_raw is a string,
  -- never a computed age — no demographic columns on this table, by design)
  daily_output text,
  b2b_or_b2c text CHECK (b2b_or_b2c IN ('b2b', 'b2c', 'unclear')),
  matric_year_raw text,
  languages_raw text,
  notice_period_raw text,
  salary_expectation_raw text,

  -- Stage-3b name-vs-LinkedIn check (added skill v4; NULL on pre-v4 records)
  identity_check text
    CHECK (identity_check IN ('match', 'partial_mismatch', 'mismatch', 'no_linkedin')),

  -- human-owned columns: the agent/import writer must never touch these
  -- after first insert (upserts update agent columns only)
  review_status text
    CHECK (review_status IN ('to_call', 'called', 'interviewing', 'booked',
                             'not_suitable', 'hired', 'withdrawn')),
  ops_notes text,
  is_archived boolean NOT NULL DEFAULT false,

  -- house audit columns
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- holds on all 604 real agent records; makes the import fail loudly
  -- if a Sheet row breaks the rule instead of importing silently wrong
  CONSTRAINT cv_screenings_reject_reason_consistency
    CHECK ((bucket = 'REJECT') = (reject_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_cv_screenings_bucket
  ON public.cv_screenings (bucket);
CREATE INDEX IF NOT EXISTS idx_cv_screenings_screened_on
  ON public.cv_screenings (screened_on DESC);
-- helper for spotting the same person resubmitting under a different filename
CREATE INDEX IF NOT EXISTS idx_cv_screenings_email_lower
  ON public.cv_screenings (lower(email));

ALTER TABLE public.cv_screenings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_cv_screenings_updated_at ON public.cv_screenings;
CREATE TRIGGER update_cv_screenings_updated_at
  BEFORE UPDATE ON public.cv_screenings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lane 1: agent + one-time import write via service role — bypasses RLS,
-- no policy needed (same as every edge function).

-- Lane 2: ops scope — capability, not a user ID. Byte-for-byte the
-- candidates/interviews precedent (20260720120000). The future TA hire
-- needs only a user_capabilities row, zero policy changes.
DROP POLICY IF EXISTS "Ops command manages cv screenings" ON public.cv_screenings;
CREATE POLICY "Ops command manages cv screenings" ON public.cv_screenings
  FOR ALL TO authenticated
  USING (public.has_capability(auth.uid(), 'can_view_ops_command'))
  WITH CHECK (public.has_capability(auth.uid(), 'can_view_ops_command'));

-- Lane 3: admin tier (admin+dev, newer house pattern per setter_period_notes)
DROP POLICY IF EXISTS "Admin tier manages cv screenings" ON public.cv_screenings;
CREATE POLICY "Admin tier manages cv screenings" ON public.cv_screenings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'dev'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
              OR public.has_role(auth.uid(), 'dev'::public.app_role));

-- sdr_manager, setter, csm, client, anon: deliberately NO policy.
-- Rejection reasoning about real people stays ops-scoped (ae_compensation rule).
