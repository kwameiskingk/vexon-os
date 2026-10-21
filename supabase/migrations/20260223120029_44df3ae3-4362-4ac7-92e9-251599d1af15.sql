
-- Backfill sender accounts from existing events
INSERT INTO gtm_sender_accounts (sender_name, sender_email, last_activity_at, status)
SELECT DISTINCT ON (sender_name)
  sender_name,
  sender_email,
  MAX(received_at) as last_activity_at,
  'active' as status
FROM gtm_heyreach_events
WHERE sender_name IS NOT NULL AND sender_name != ''
GROUP BY sender_name, sender_email
ON CONFLICT DO NOTHING;
