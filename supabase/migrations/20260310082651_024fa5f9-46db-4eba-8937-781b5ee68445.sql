
-- Move Luis's incorrectly attributed meeting from March 10 to March 6
UPDATE performance SET meetings_booked = COALESCE(meetings_booked, 0) + 1, updated_at = now()
WHERE id = '3bb5171e-d8f9-421f-8903-9618caff6aee';

UPDATE performance SET meetings_booked = GREATEST(COALESCE(meetings_booked, 0) - 1, 0), updated_at = now()
WHERE id = '4c27820e-f91d-43ce-887f-26b894acdc1e';
