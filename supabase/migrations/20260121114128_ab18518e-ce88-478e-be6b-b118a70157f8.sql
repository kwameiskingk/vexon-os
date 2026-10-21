-- Add unique constraint on (email, date) to the performance table
-- This is required for the ON CONFLICT clause in the meeting sync trigger to work

-- First, clean up any duplicate (email, date) rows by keeping only the most recent one
DELETE FROM performance
WHERE id NOT IN (
  SELECT DISTINCT ON (LOWER(email), date) id
  FROM performance
  ORDER BY LOWER(email), date, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
);

-- Now add the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS performance_email_date_unique 
ON performance (LOWER(email), date);