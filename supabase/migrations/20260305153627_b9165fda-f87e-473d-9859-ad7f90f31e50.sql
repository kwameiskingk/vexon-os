-- Create Team Goals table
CREATE TABLE IF NOT EXISTS public.team_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_meetings INTEGER NOT NULL CHECK (target_meetings > 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reward TEXT NOT NULL,
  department TEXT NULL CHECK (department IS NULL OR department IN ('fulfilment', 'acquisition')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_goals_date_range CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_team_goals_status_created_at ON public.team_goals(status, created_at DESC);

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view team goals" ON public.team_goals;
CREATE POLICY "Authenticated users can view team goals"
ON public.team_goals
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Managers can create team goals" ON public.team_goals;
CREATE POLICY "Managers can create team goals"
ON public.team_goals
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'dev'::public.app_role)
  OR public.has_role(auth.uid(), 'ops'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
);

DROP POLICY IF EXISTS "Managers can update team goals" ON public.team_goals;
CREATE POLICY "Managers can update team goals"
ON public.team_goals
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'dev'::public.app_role)
  OR public.has_role(auth.uid(), 'ops'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'dev'::public.app_role)
  OR public.has_role(auth.uid(), 'ops'::public.app_role)
  OR public.has_role(auth.uid(), 'sdr_manager'::public.app_role)
);

DROP TRIGGER IF EXISTS update_team_goals_updated_at ON public.team_goals;
CREATE TRIGGER update_team_goals_updated_at
BEFORE UPDATE ON public.team_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create Invoice Submissions table
CREATE TABLE IF NOT EXISTS public.invoice_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_profile_id UUID NOT NULL REFERENCES public.setters_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  meetings_count INTEGER NOT NULL DEFAULT 0 CHECK (meetings_count >= 0),
  per_meeting_bonus NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (per_meeting_bonus >= 0),
  total_commission NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_commission >= 0),
  meeting_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'paid')),
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_submissions_period_range CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_submissions_unique_period
ON public.invoice_submissions(setter_profile_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_invoice_submissions_user_id ON public.invoice_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_submissions_status_submitted_at ON public.invoice_submissions(status, submitted_at DESC);

ALTER TABLE public.invoice_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Setters can submit invoices" ON public.invoice_submissions;
CREATE POLICY "Setters can submit invoices"
ON public.invoice_submissions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Setters can view own invoices" ON public.invoice_submissions;
CREATE POLICY "Setters can view own invoices"
ON public.invoice_submissions
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_accounting_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
);

DROP POLICY IF EXISTS "Accounting can update invoices" ON public.invoice_submissions;
CREATE POLICY "Accounting can update invoices"
ON public.invoice_submissions
FOR UPDATE
TO authenticated
USING (
  public.is_accounting_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
)
WITH CHECK (
  public.is_accounting_role(auth.uid())
  OR public.has_role(auth.uid(), 'csm'::public.app_role)
);

DROP TRIGGER IF EXISTS update_invoice_submissions_updated_at ON public.invoice_submissions;
CREATE TRIGGER update_invoice_submissions_updated_at
BEFORE UPDATE ON public.invoice_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Extend achievement tier support to include platinum
ALTER TABLE public.achievement_definitions DROP CONSTRAINT IF EXISTS achievement_definitions_tier_check;
ALTER TABLE public.achievement_definitions
ADD CONSTRAINT achievement_definitions_tier_check
CHECK (tier IS NULL OR tier = ANY (ARRAY['bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text]));

-- Deactivate deprecated/legacy definitions
UPDATE public.achievement_definitions
SET is_active = false
WHERE key IN ('rising_star', 'acq_improvement', 'dial_grinder_bronze', 'ful_show_rate', 'acq_show_rate', 'reliability_pro', 'client_testimonial', 'client_champion');

-- Ensure dial family is bronze/silver/gold in one grouped set
INSERT INTO public.achievement_definitions (
  key, name, description, icon, color, category, tier, target_role, target_department, sort_order, criteria, is_active, is_permanent
)
VALUES (
  'acq_weekly_dials_bronze', 'Dial Starter', 'Hit 500 dials in a week', 'phone', 'orange', 'quantity', 'bronze', 'setter', NULL, 10,
  '{"type":"cumulative","metric":"dials_made","period":"week","threshold":500}'::jsonb,
  true, false
)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    target_role = EXCLUDED.target_role,
    target_department = EXCLUDED.target_department,
    sort_order = EXCLUDED.sort_order,
    criteria = EXCLUDED.criteria,
    is_active = true,
    is_permanent = false;

UPDATE public.achievement_definitions
SET name = 'Dial Grinder',
    description = 'Hit 850 dials in a week',
    criteria = '{"type":"cumulative","metric":"dials_made","period":"week","threshold":850}'::jsonb,
    sort_order = 11,
    target_department = NULL,
    is_active = true
WHERE key = 'acq_weekly_dials_silver';

UPDATE public.achievement_definitions
SET name = 'Phone Destroyer',
    description = 'Hit 1000 dials in a week',
    criteria = '{"type":"cumulative","metric":"dials_made","period":"week","threshold":1000}'::jsonb,
    sort_order = 12,
    target_department = NULL,
    is_active = true
WHERE key = 'acq_weekly_dials_gold';

-- Reliability Pro 70/80/90
INSERT INTO public.achievement_definitions (
  key, name, description, icon, color, category, tier, target_role, target_department, sort_order, criteria, is_active, is_permanent
)
VALUES
  (
    'reliability_pro_silver', 'Reliability Pro', 'Achieve 70% show rate in the month (meeting date based)', 'shield', 'slate', 'quality', 'silver', 'setter', NULL, 130,
    '{"type":"rate","metric":"show_rate","period":"month","threshold":70,"min_meetings":1}'::jsonb,
    true, false
  ),
  (
    'reliability_pro_gold', 'Reliability Pro', 'Achieve 80% show rate in the month (meeting date based)', 'shield', 'gold', 'quality', 'gold', 'setter', NULL, 131,
    '{"type":"rate","metric":"show_rate","period":"month","threshold":80,"min_meetings":1}'::jsonb,
    true, false
  ),
  (
    'reliability_pro_platinum', 'Reliability Pro', 'Achieve 90% show rate in the month (meeting date based)', 'shield', 'purple', 'quality', 'platinum', 'setter', NULL, 132,
    '{"type":"rate","metric":"show_rate","period":"month","threshold":90,"min_meetings":1}'::jsonb,
    true, false
  )
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    target_role = EXCLUDED.target_role,
    target_department = EXCLUDED.target_department,
    sort_order = EXCLUDED.sort_order,
    criteria = EXCLUDED.criteria,
    is_active = true,
    is_permanent = false;

-- Secure client testimonial achievements (platinum)
INSERT INTO public.achievement_definitions (
  key, name, description, icon, color, category, tier, target_role, target_department, sort_order, criteria, is_active, is_permanent
)
VALUES
  (
    'secure_client_testimonial_1', 'Secure 1 Client Testimonial', 'Secure one client testimonial', 'heart', 'purple', 'career', 'platinum', 'setter', NULL, 300,
    '{"type":"admin_approved","trigger":"client_testimonial","threshold":1}'::jsonb,
    true, true
  ),
  (
    'secure_client_testimonial_2', 'Secure 2 Client Testimonials', 'Secure two client testimonials', 'heart', 'purple', 'career', 'platinum', 'setter', NULL, 301,
    '{"type":"admin_approved","trigger":"client_testimonial","threshold":2}'::jsonb,
    true, true
  ),
  (
    'secure_client_testimonial_3', 'Secure 3 Client Testimonials', 'Secure three client testimonials', 'heart', 'purple', 'career', 'platinum', 'setter', NULL, 302,
    '{"type":"admin_approved","trigger":"client_testimonial","threshold":3}'::jsonb,
    true, true
  )
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    target_role = EXCLUDED.target_role,
    target_department = EXCLUDED.target_department,
    sort_order = EXCLUDED.sort_order,
    criteria = EXCLUDED.criteria,
    is_active = true,
    is_permanent = true;

-- Ensure Setter of Day/Week/Month definitions are active and tiered
INSERT INTO public.achievement_definitions (
  key, name, description, icon, color, category, tier, target_role, target_department, sort_order, criteria, is_active, is_permanent
)
VALUES
  (
    'setter_of_the_day', 'Setter of the Day', 'Book the most meetings in your department today', 'star', 'orange', 'recognition', 'bronze', 'setter', NULL, 200,
    '{"type":"top_performer_daily"}'::jsonb,
    true, false
  ),
  (
    'setter_of_the_week', 'Setter of the Week', 'Book the most meetings in your department this week', 'award', 'slate', 'recognition', 'silver', 'setter', NULL, 201,
    '{"type":"most_meetings_weekly","scope":"department"}'::jsonb,
    true, false
  ),
  (
    'setter_of_the_month', 'Setter of the Month', 'Book the most meetings in your department this month', 'trophy', 'gold', 'recognition', 'gold', 'setter', NULL, 202,
    '{"type":"top_performer_monthly"}'::jsonb,
    true, false
  )
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    target_role = EXCLUDED.target_role,
    target_department = EXCLUDED.target_department,
    sort_order = EXCLUDED.sort_order,
    criteria = EXCLUDED.criteria,
    is_active = true,
    is_permanent = false;