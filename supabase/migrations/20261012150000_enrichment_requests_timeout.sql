-- 12 Oct 2026 (SDR streamline PR 6): 50 enrichment lookups have sat on
-- "enriching" for days because Clay never called back and nothing times them
-- out. The Tools page now treats any lookup older than 10 minutes as "no
-- number found" and offers a retry; this closes the backlog the same way.
-- Safe to run twice: the WHERE clause matches nothing afterwards.

UPDATE public.enrichment_requests
SET status = 'not_found',
    error_message = COALESCE(error_message, 'Timed out: no reply from Clay within 10 minutes'),
    updated_at = now()
WHERE status = 'enriching'
  AND created_at < now() - interval '10 minutes';
