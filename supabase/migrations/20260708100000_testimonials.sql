-- Testimonials capture (Tier A): first-class video/written testimonial
-- records, captured by the CSM at catch-up completion. Feeds the CEO
-- Client Health "Testimonials collected" tiles (previously hardcoded "—").
CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  catchup_id uuid REFERENCES public.client_catchups(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('video', 'written')),
  link text,
  content text,
  obtained_by uuid,
  obtained_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_client ON public.testimonials(client_profile_id);
CREATE INDEX IF NOT EXISTS idx_testimonials_obtained_at ON public.testimonials(obtained_at);

CREATE TRIGGER trg_testimonials_updated_at
BEFORE UPDATE ON public.testimonials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view testimonials"
ON public.testimonials FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'ops')
  OR public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'sdr_manager')
);

CREATE POLICY "CSM and admins manage testimonials"
ON public.testimonials FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.has_role(auth.uid(), 'csm')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
);
