
-- Add outcome tracking fields to meetings table for client feedback
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS client_outcome text CHECK (client_outcome IN ('won', 'lost', 'pending')),
ADD COLUMN IF NOT EXISTS vacancies_won integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS vacancies_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS placement_fee_percentage numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS outcome_confirmed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS outcome_notes text;

-- Add comment for clarity
COMMENT ON COLUMN public.meetings.client_outcome IS 'Client-reported outcome: won (placement secured), lost (no placement), pending (still in discussions)';
COMMENT ON COLUMN public.meetings.vacancies_won IS 'Number of vacancies/placements won from this meeting';
COMMENT ON COLUMN public.meetings.vacancies_value IS 'Total value in GBP of placement fees from this meeting';
COMMENT ON COLUMN public.meetings.placement_fee_percentage IS 'The agreed placement fee percentage for this client';
