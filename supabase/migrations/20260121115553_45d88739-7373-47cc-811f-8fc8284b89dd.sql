
-- Fix the sync_meeting_to_performance trigger to use the correct unique constraint
-- The unique index is on (LOWER(email), date) but ON CONFLICT needs to reference the actual column names

-- First, let's create an additional unique index on (email, date) without LOWER for compatibility
-- This will allow ON CONFLICT (email, date) to work when email is already lowercase
CREATE UNIQUE INDEX IF NOT EXISTS performance_email_date_simple_unique 
ON performance (email, date);

-- Also ensure there's a unique constraint on setter_id,date for edge functions
-- (This already exists as performance_setter_id_date_key, but let's verify)

-- Clean up any duplicates that might prevent the new index
DELETE FROM performance p1
WHERE EXISTS (
  SELECT 1 FROM performance p2 
  WHERE p2.email = p1.email 
  AND p2.date = p1.date 
  AND p2.id > p1.id
);

-- Now update the trigger function to be more robust
CREATE OR REPLACE FUNCTION sync_meeting_to_performance()
RETURNS TRIGGER AS $$
DECLARE
  setter_email TEXT;
  setter_user_id UUID;
BEGIN
  -- Get the setter's email and user_id from their profile
  SELECT email, user_id INTO setter_email, setter_user_id
  FROM setters_profiles
  WHERE id = NEW.setter_profile_id OR user_id = NEW.setter_id;
  
  -- If no setter found, try with logged_by_setter_id
  IF setter_email IS NULL AND NEW.logged_by_setter_id IS NOT NULL THEN
    SELECT email, user_id INTO setter_email, setter_user_id
    FROM setters_profiles
    WHERE user_id = NEW.logged_by_setter_id;
  END IF;
  
  -- If still no setter found, exit gracefully
  IF setter_email IS NULL THEN
    RAISE NOTICE 'No setter email found for meeting %', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Normalize email to lowercase
  setter_email := LOWER(setter_email);
  
  -- Upsert into performance table - increment meetings_booked
  -- Use setter_id,date as conflict target since that index exists
  INSERT INTO performance (
    email,
    date,
    meetings_booked,
    setter_id,
    user_id,
    created_at,
    updated_at
  )
  VALUES (
    setter_email,
    NEW.meeting_date,
    1,
    COALESCE(setter_user_id, NEW.setter_id),
    COALESCE(setter_user_id, NEW.setter_id),
    now(),
    now()
  )
  ON CONFLICT (setter_id, date) 
  DO UPDATE SET
    meetings_booked = COALESCE(performance.meetings_booked, 0) + 1,
    email = EXCLUDED.email,
    updated_at = now();
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the meeting insert
  RAISE WARNING 'sync_meeting_to_performance failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
