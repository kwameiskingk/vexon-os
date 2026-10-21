-- Lead-list tracking (CEO Client Health "Lead Lists" tile + per-list setter
-- metrics). Extends the EXISTING client_lead_lists feature (client uploads
-- + CSM approval, bucket lead-list-files) rather than adding a parallel
-- table:
--   list_type      — CSM tags each list fulfilment or acquisition (both
--                    tracked from day one per spec)
--   total_contacts — typed in by the CSM; reserved for the utilization-rate
--                    formula (definition pending a product decision)
--   is_default     — at most one default list per client; new setter
--                    assignments fall back to it
--   source         — where the list was built (Clay, Apollo, …)
-- RLS unchanged: "Admin roles can manage lead lists" (admin/dev/ops/csm)
-- already covers creation and tagging; clients keep access to their own.
ALTER TABLE public.client_lead_lists
  ADD COLUMN IF NOT EXISTS list_type text CHECK (list_type IN ('fulfilment', 'acquisition')),
  ADD COLUMN IF NOT EXISTS total_contacts integer,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_lead_lists_default_per_client
  ON public.client_lead_lists(client_profile_id)
  WHERE is_default;

-- Tie a setter-client assignment to the lead list the setter works from,
-- so Close telemetry (dials/talk time/connects) and logged appointments can
-- be attributed per list while the assignment is active.
ALTER TABLE public.setter_client_assignments
  ADD COLUMN IF NOT EXISTS lead_list_id uuid REFERENCES public.client_lead_lists(id) ON DELETE SET NULL;
