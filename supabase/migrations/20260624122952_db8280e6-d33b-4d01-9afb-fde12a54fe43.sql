GRANT SELECT ON public.backfill_ae_deals TO authenticated, anon;
GRANT ALL ON public.backfill_ae_deals TO service_role;
NOTIFY pgrst, 'reload schema';