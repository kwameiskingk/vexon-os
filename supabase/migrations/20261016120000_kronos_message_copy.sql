-- Kronos message copy (16 Oct 2026, the owner): every text and email a prospect
-- receives from Kronos becomes editable in Dev Centre > Kronos > Message copy.
--
-- One row per message per scope:
--   event_type_id NULL  = the wording every event uses (the default set);
--   event_type_id set   = that one event's own wording, which wins over the
--                         default set for that event only.
-- No rows are seeded: a message with no row uses the wording in code
-- (supabase/functions/_shared/kronos-message-defaults.ts), which is exactly
-- what went out before this change. Saving in the editor writes a row.
--
-- The edge functions read with the service role; only dev and admin can see
-- or change the wording from the app.
--
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS public.booking_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  event_type_id uuid REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  enabled boolean NOT NULL DEFAULT true,
  subject text,
  heading text,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_message_templates_default_key
  ON public.booking_message_templates (key) WHERE event_type_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS booking_message_templates_event_key
  ON public.booking_message_templates (key, event_type_id) WHERE event_type_id IS NOT NULL;

ALTER TABLE public.booking_message_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'booking_message_templates' AND policyname = 'Dev and admin manage booking message templates') THEN
    CREATE POLICY "Dev and admin manage booking message templates" ON public.booking_message_templates
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'dev'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'dev'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_booking_message_templates()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_message_templates_touch ON public.booking_message_templates;
CREATE TRIGGER trg_booking_message_templates_touch
  BEFORE UPDATE ON public.booking_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_booking_message_templates();

-- Proof: the table, its two unique indexes and the policy.
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_message_templates') AS table_expect_1,
  (SELECT count(*) FROM pg_indexes WHERE tablename = 'booking_message_templates' AND indexname LIKE 'booking_message_templates_%_key') AS unique_indexes_expect_2,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'booking_message_templates') AS policies_expect_1;

-- RLS proof (CLAUDE.md rule 2), run after the table exists. Rolled back, so
-- nothing is kept. the owner (dev) can write; a setter can neither write nor read.
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims','{"sub":"206e0d24-02e5-4429-885b-eb13289ea9e2","role":"authenticated"}',true);
--   INSERT INTO public.booking_message_templates (key, channel, body) VALUES ('confirmation_sms','sms','rls test'); -- must pass
--   SELECT set_config('request.jwt.claims','{"sub":"afdfa192-ec6a-4826-8141-39130ed6d195","role":"authenticated"}',true);
--   SELECT count(*) FROM public.booking_message_templates;                                                  -- must be 0
--   INSERT INTO public.booking_message_templates (key, channel, body) VALUES ('reminder_3h_sms','sms','x'); -- must fail
-- ROLLBACK;
