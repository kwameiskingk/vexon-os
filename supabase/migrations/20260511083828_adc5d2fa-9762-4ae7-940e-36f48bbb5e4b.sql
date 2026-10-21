DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'manual_daily_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_daily_metrics;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_bulletins'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_bulletins;
  END IF;
END $$;