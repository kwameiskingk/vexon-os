-- Create sync_errors table for tracking import failures
CREATE TABLE IF NOT EXISTS public.sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('close_api', 'csv_import', 'consolidation')),
  error_reason text NOT NULL,
  raw_payload jsonb,
  resolved boolean DEFAULT false,
  resolved_at timestamp with time zone,
  resolved_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

-- Admin can view and manage errors
CREATE POLICY "Admins can manage sync errors"
ON public.sync_errors
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_sync_errors_source ON public.sync_errors(source);
CREATE INDEX idx_sync_errors_resolved ON public.sync_errors(resolved);
CREATE INDEX idx_sync_errors_created_at ON public.sync_errors(created_at DESC);

-- Add comments
COMMENT ON TABLE public.sync_errors IS 'Tracks errors during Close API and CSV import sync operations';
COMMENT ON COLUMN public.sync_errors.source IS 'Origin of the sync error: close_api, csv_import, or consolidation';
COMMENT ON COLUMN public.sync_errors.raw_payload IS 'Original data that failed to import';
COMMENT ON COLUMN public.sync_errors.resolved IS 'Whether the error has been manually resolved';