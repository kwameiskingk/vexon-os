DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.enrichment_requests REPLICA IDENTITY FULL;