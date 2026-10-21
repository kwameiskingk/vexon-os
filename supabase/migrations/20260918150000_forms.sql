-- Vexon OS Forms (18 Sep 2026): the Typeform replacement. Forms authored in
-- Vexon OS (questions, logic, endings, scoring), rendered at /f/<slug>, and
-- answers routed to where the team already works (marketing_leads for lead
-- forms, cv_screenings for hiring forms). See src/lib/forms/schema.ts.

-- 1. Who manages forms: the reviewer tier + Elena's screening capability +
--    Tom (marketing) via the ops-command capability.
CREATE OR REPLACE FUNCTION public.is_form_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'dev'::public.app_role)
    OR public.has_role(_uid, 'hr'::public.app_role)
    OR public.has_role(_uid, 'ops'::public.app_role)
    OR public.has_role(_uid, 'sdr_manager'::public.app_role)
    OR public.has_capability(_uid, 'can_screen_candidates')
    OR public.has_capability(_uid, 'can_view_ops_command')
  );
$$;

-- 2. Forms
CREATE TABLE IF NOT EXISTS public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'general' CHECK (kind IN ('lead','hiring','general')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed')),
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_schema jsonb,
  sink text NOT NULL DEFAULT 'none' CHECK (sink IN ('none','marketing_leads','cv_screenings')),
  notify_role text,
  webhook_url text,
  theme jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Forms: managers" ON public.forms;
CREATE POLICY "Forms: managers" ON public.forms
  FOR ALL TO authenticated
  USING (public.is_form_manager(auth.uid()))
  WITH CHECK (public.is_form_manager(auth.uid()));

-- 3. Responses (inserted only by the form-submit edge function)
CREATE TABLE IF NOT EXISTS public.form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  hidden jsonb NOT NULL DEFAULT '{}'::jsonb,
  ending_id text,
  outcome text,
  score int,
  max_score int,
  score_pct int,
  is_partial boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  referrer text,
  user_agent text,
  marketing_lead_id uuid,
  cv_screening_id uuid,
  booking_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_responses_form_idx ON public.form_responses (form_id, created_at DESC);
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Form responses: managers read" ON public.form_responses;
CREATE POLICY "Form responses: managers read" ON public.form_responses
  FOR SELECT TO authenticated USING (public.is_form_manager(auth.uid()));
DROP POLICY IF EXISTS "Form responses: managers tidy" ON public.form_responses;
CREATE POLICY "Form responses: managers tidy" ON public.form_responses
  FOR DELETE TO authenticated USING (public.is_form_manager(auth.uid()));

-- 4. The public read: a live form's published schema by slug (draft for managers
--    previewing). Anonymous callers get only what the renderer needs.
CREATE OR REPLACE FUNCTION public.public_form(_slug text, _draft boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', f.id, 'slug', f.slug, 'name', f.name, 'kind', f.kind, 'status', f.status, 'theme', f.theme,
    'schema', CASE WHEN _draft AND public.is_form_manager(auth.uid()) THEN f.schema ELSE f.published_schema END
  )
  FROM public.forms f
  WHERE f.slug = _slug
    AND (f.status = 'live' OR (_draft AND public.is_form_manager(auth.uid())))
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.public_form(text, boolean) TO anon, authenticated;

-- 5. CV uploads: private bucket, anonymous upload only (the applicant), managers read.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('form-uploads', 'form-uploads', false, 10485760,
        ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Form uploads: applicants add') THEN
    EXECUTE $p$CREATE POLICY "Form uploads: applicants add" ON storage.objects
      FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'form-uploads')$p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Form uploads: managers read') THEN
    EXECUTE $p$CREATE POLICY "Form uploads: managers read" ON storage.objects
      FOR SELECT TO authenticated USING (bucket_id = 'form-uploads' AND public.is_form_manager(auth.uid()))$p$;
  END IF;
END $$;

-- 6. Lead forms write to marketing_leads with source 'website'.
ALTER TABLE public.marketing_leads DROP CONSTRAINT IF EXISTS marketing_leads_source_check;
ALTER TABLE public.marketing_leads ADD CONSTRAINT marketing_leads_source_check
  CHECK (source IN ('meta_ads','heyreach','website'));

-- 7. Starter forms: the website qualifier and Elena's SDR application.
INSERT INTO public.forms (slug, name, kind, status, schema, published_schema, sink, notify_role, published_at)
VALUES
  ('discovery-qualifier', 'Website qualifier', 'lead', 'live',
   '{"welcome": null, "questions": [{"id": "owner", "ref": "owner", "type": "yes_no", "title": "Are you a recruitment agency owner?", "required": true, "choices": [{"id": "owner_0", "label": "Yes", "points": 0}, {"id": "owner_1", "label": "No", "points": 0}]}, {"id": "name", "ref": "name", "type": "short_text", "title": "What is your full name?", "required": true, "placeholder": "Type your answer here…"}, {"id": "email", "ref": "email", "type": "email", "title": "What is your company email address?", "required": true, "placeholder": "name@company.com"}, {"id": "company", "ref": "company", "type": "short_text", "title": "What is your company name?", "required": true}, {"id": "phone", "ref": "phone", "type": "phone", "title": "What is the best phone number to reach you?", "required": true, "placeholder": "+44 7…"}, {"id": "revenue", "ref": "revenue", "type": "choice", "title": "Roughly what was your revenue in the last 12 months?", "required": true, "choices": [{"id": "revenue_0", "label": "0-300k", "points": 0}, {"id": "revenue_1", "label": "300k-1M", "points": 0}, {"id": "revenue_2", "label": "1M-5M", "points": 0}, {"id": "revenue_3", "label": "5M-20M", "points": 0}, {"id": "revenue_4", "label": "20M+", "points": 0}]}, {"id": "invest", "ref": "invest", "type": "yes_no", "title": "Our services range from £2,500/mo - £3,000/mo. Given we are a good fit, is this a comfortable investment for you to make?", "required": true, "choices": [{"id": "invest_0", "label": "Yes", "points": 0}, {"id": "invest_1", "label": "No", "points": 0}]}], "logic": [{"id": "l1", "question_id": "owner", "op": "eq", "value": "No", "action": "end", "target": "end_reach"}, {"id": "l2", "question_id": "revenue", "op": "neq", "value": "0-300k", "action": "end", "target": "end_book_q"}, {"id": "l3", "question_id": "invest", "op": "eq", "value": "No", "action": "end", "target": "end_reach"}, {"id": "l4", "question_id": "invest", "op": "eq", "value": "Yes", "action": "end", "target": "end_book_p"}], "endings": [{"id": "end_book_q", "kind": "booking", "title": "Your application looks great!", "body": "Pick a time that suits you.", "event_slug": "discovery-call", "outcome": "qualified"}, {"id": "end_book_p", "kind": "booking", "title": "Your application looks great!", "body": "Pick a time that suits you.", "event_slug": "discovery-call", "outcome": "price_qualified"}, {"id": "end_reach", "kind": "message", "title": "We received your application and will reach out if it’s a fit!", "body": "Thanks for taking the time. Marcus reads every one of these.", "outcome": "unqualified"}], "default_ending": "end_book_q", "hidden": ["utm_source", "utm_campaign", "src"], "scoring": {"enabled": false, "threshold_pct": 70, "below_threshold_ending": null}}'::jsonb, '{"welcome": null, "questions": [{"id": "owner", "ref": "owner", "type": "yes_no", "title": "Are you a recruitment agency owner?", "required": true, "choices": [{"id": "owner_0", "label": "Yes", "points": 0}, {"id": "owner_1", "label": "No", "points": 0}]}, {"id": "name", "ref": "name", "type": "short_text", "title": "What is your full name?", "required": true, "placeholder": "Type your answer here…"}, {"id": "email", "ref": "email", "type": "email", "title": "What is your company email address?", "required": true, "placeholder": "name@company.com"}, {"id": "company", "ref": "company", "type": "short_text", "title": "What is your company name?", "required": true}, {"id": "phone", "ref": "phone", "type": "phone", "title": "What is the best phone number to reach you?", "required": true, "placeholder": "+44 7…"}, {"id": "revenue", "ref": "revenue", "type": "choice", "title": "Roughly what was your revenue in the last 12 months?", "required": true, "choices": [{"id": "revenue_0", "label": "0-300k", "points": 0}, {"id": "revenue_1", "label": "300k-1M", "points": 0}, {"id": "revenue_2", "label": "1M-5M", "points": 0}, {"id": "revenue_3", "label": "5M-20M", "points": 0}, {"id": "revenue_4", "label": "20M+", "points": 0}]}, {"id": "invest", "ref": "invest", "type": "yes_no", "title": "Our services range from £2,500/mo - £3,000/mo. Given we are a good fit, is this a comfortable investment for you to make?", "required": true, "choices": [{"id": "invest_0", "label": "Yes", "points": 0}, {"id": "invest_1", "label": "No", "points": 0}]}], "logic": [{"id": "l1", "question_id": "owner", "op": "eq", "value": "No", "action": "end", "target": "end_reach"}, {"id": "l2", "question_id": "revenue", "op": "neq", "value": "0-300k", "action": "end", "target": "end_book_q"}, {"id": "l3", "question_id": "invest", "op": "eq", "value": "No", "action": "end", "target": "end_reach"}, {"id": "l4", "question_id": "invest", "op": "eq", "value": "Yes", "action": "end", "target": "end_book_p"}], "endings": [{"id": "end_book_q", "kind": "booking", "title": "Your application looks great!", "body": "Pick a time that suits you.", "event_slug": "discovery-call", "outcome": "qualified"}, {"id": "end_book_p", "kind": "booking", "title": "Your application looks great!", "body": "Pick a time that suits you.", "event_slug": "discovery-call", "outcome": "price_qualified"}, {"id": "end_reach", "kind": "message", "title": "We received your application and will reach out if it’s a fit!", "body": "Thanks for taking the time. Marcus reads every one of these.", "outcome": "unqualified"}], "default_ending": "end_book_q", "hidden": ["utm_source", "utm_campaign", "src"], "scoring": {"enabled": false, "threshold_pct": 70, "below_threshold_ending": null}}'::jsonb, 'marketing_leads', 'setter', now()),
  ('sdr-application', 'SDR application', 'hiring', 'draft',
   '{"welcome": {"title": "Welcome to the next stage of the hiring process.","body": "Please answer the questions as accurately as possible — we verify every application on the screening call.","button": "Start","time_hint": "about 4 minutes","media": null},"questions": [{"id": "first_name","ref": "first_name","type": "short_text","title": "First name","required": true},{"id": "last_name","ref": "last_name","type": "short_text","title": "Last name","required": true},{"id": "phone","ref": "phone","type": "phone","title": "Phone number","required": true,"placeholder": "+27 …"},{"id": "email","ref": "email","type": "email","title": "Email address","required": true},{"id": "dob","ref": "date_of_birth","type": "date","title": "Date of birth","required": true},{"id": "linkedin","ref": "linkedin_url","type": "website","title": "LinkedIn profile URL","required": true,"placeholder": "linkedin.com/in/…"},{"id": "title","ref": "current_title","type": "short_text","title": "Current title","required": true},{"id": "company","ref": "current_company","type": "short_text","title": "Current company","required": true},{"id": "cc_hours","ref": "cold_calling_hours","type": "choice","title": "In your most recent position, roughly how much of each working day was spent cold calling?","required": true,"choices": [{"id": "cc_hours_0","label": "None","points": -50},{"id": "cc_hours_1","label": "Under 1 hour per day","points": -50},{"id": "cc_hours_2","label": "1–3 hours per day","points": -50},{"id": "cc_hours_3","label": "Most of my day (4 hours+)","points": 10}]},{"id": "selling","ref": "selling_what","type": "short_text","title": "In your most recent position, what were you selling?","required": true},{"id": "b2b","ref": "b2b_or_b2c","type": "choice","title": "Was this mostly B2B or B2C?","required": true,"choices": [{"id": "b2b_0","label": "Mostly B2B","points": 10},{"id": "b2b_1","label": "Mostly B2C","points": -50}]},{"id": "region","ref": "region","type": "choice","title": "In your most recent position, which region were you calling into the most?","required": true,"choices": [{"id": "region_0","label": "South Africa","points": 0},{"id": "region_1","label": "UK","points": 5},{"id": "region_2","label": "USA","points": 0},{"id": "region_3","label": "Canada","points": 0},{"id": "region_4","label": "Australia","points": 0},{"id": "region_5","label": "New Zealand","points": 0},{"id": "region_6","label": "Europe","points": 0},{"id": "region_7","label": "Middle East","points": 0}]},{"id": "dials","ref": "dials_per_day","type": "choice","title": "In your most recent position, how many outbound dials did you make on average per day?","required": true,"choices": [{"id": "dials_0","label": "Under 30","points": -50},{"id": "dials_1","label": "30 – 59","points": -50},{"id": "dials_2","label": "60 – 99","points": 10},{"id": "dials_3","label": "100 – 149","points": 10},{"id": "dials_4","label": "150+","points": 10}]},{"id": "cold","ref": "cold_vs_warm","type": "choice","title": "In your most recent position, what proportion of your dials were to cold leads (people that have never heard from your company before) vs warm leads?","required": true,"choices": [{"id": "cold_0","label": "100% cold leads","points": 10},{"id": "cold_1","label": "Mostly cold leads","points": 10},{"id": "cold_2","label": "50% cold leads, 50% warm leads","points": -50},{"id": "cold_3","label": "Mostly warm leads","points": -50},{"id": "cold_4","label": "100% warm leads","points": -50}]},{"id": "appts","ref": "appointments_per_month","type": "choice","title": "In your most recent position, on average, how many appointments did you book per month?","required": true,"choices": [{"id": "appts_0","label": "0 – 5","points": -50},{"id": "appts_1","label": "6 – 10","points": 10},{"id": "appts_2","label": "11 – 20","points": 15},{"id": "appts_3","label": "21 – 30","points": 20},{"id": "appts_4","label": "30+","points": 25}]},{"id": "show","ref": "show_rate","type": "choice","title": "What percentage of those appointments actually showed up?","required": true,"choices": [{"id": "show_0","label": "Under 40%","points": 0},{"id": "show_1","label": "40 – 50%","points": 0},{"id": "show_2","label": "51 – 60%","points": 0},{"id": "show_3","label": "61 – 70%","points": 0},{"id": "show_4","label": "71% or more","points": 0},{"id": "show_5","label": "I don''t know / it wasn''t tracked","points": 0}]},{"id": "exp","ref": "cold_calling_experience","type": "choice","title": "Across all your previous roles, how much experience do you have in total with booking sales meetings via cold calling?","required": true,"choices": [{"id": "exp_0","label": "Less than 6 months","points": -50},{"id": "exp_1","label": "6 – 11 months","points": -50},{"id": "exp_2","label": "1 – 2 years","points": 10},{"id": "exp_3","label": "2 – 3 years","points": 10},{"id": "exp_4","label": "3 – 5 years","points": 10},{"id": "exp_5","label": "More than 5 years","points": 10}]},{"id": "dialer","ref": "dialer_crm","type": "multi_choice","title": "Which dialer or CRM have you used in the past?","required": true,"help": "Pick all that apply.","choices": [{"id": "dialer_0","label": "Aircall / CloudTalk / JustCall","points": 0},{"id": "dialer_1","label": "HubSpot","points": 0},{"id": "dialer_2","label": "Salesforce","points": 0},{"id": "dialer_3","label": "Close","points": 0},{"id": "dialer_4","label": "Outreach / Salesloft / Apollo","points": 0},{"id": "dialer_5","label": "Mobile phone or landline only","points": 0},{"id": "dialer_6","label": "Other","points": 0}]},{"id": "power","ref": "backup_power","type": "choice","title": "What backup power do you have for load shedding or an outage?","required": true,"choices": [{"id": "power_0","label": "Solar power with battery storage","points": 10},{"id": "power_1","label": "Inverter / battery system","points": 10},{"id": "power_2","label": "UPS","points": 10},{"id": "power_3","label": "Generator","points": 10},{"id": "power_4","label": "None","points": 0}]},{"id": "laptop","ref": "own_laptop","type": "yes_no","title": "Do you have your own laptop and a reliable internet connection (Wi-Fi) for work?","required": true,"choices": [{"id": "laptop_0","label": "Yes","points": 10},{"id": "laptop_1","label": "No","points": 0}]},{"id": "notice","ref": "notice_period","type": "choice","title": "If you were offered the role, how much notice would you need to give your current employer?","required": true,"choices": [{"id": "notice_0","label": "None – I can start immediately","points": 0},{"id": "notice_1","label": "One week","points": 0},{"id": "notice_2","label": "Two weeks","points": 0},{"id": "notice_3","label": "One month","points": 0},{"id": "notice_4","label": "More than one month","points": 0}]},{"id": "loom","ref": "loom_url","type": "website","title": "Record a short Loom video (2–3 minutes) introducing yourself and telling us why you''d be a great SDR, then paste the link here.","required": true,"help": "Free at loom.com. Talk to us like you would on a cold call — we listen for tone, clarity and energy.","placeholder": "https://www.loom.com/share/…"}],"logic": [],"endings": [{"id": "end_thanks","kind": "message","title": "Thanks, we got your application.","body": "If you''re the right fit, we''ll be in touch.","outcome": "shortlisted"},{"id": "end_below","kind": "message","title": "Thanks, we got your application.","body": "If you''re the right fit, we''ll be in touch.","outcome": "below_threshold"}],"default_ending": "end_thanks","hidden": ["src","job"],"scoring": {"enabled": true,"threshold_pct": 70,"below_threshold_ending": "end_below"}}'::jsonb, NULL, 'cv_screenings', 'ops', NULL)
ON CONFLICT (slug) DO NOTHING;

-- Proof
SELECT
  (SELECT count(*) FROM public.forms) AS forms,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='public_form') AS public_fn_ok,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id='form-uploads') AS bucket_ok;
