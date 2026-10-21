-- Add opps_created column to performance table
ALTER TABLE performance 
ADD COLUMN IF NOT EXISTS opps_created integer DEFAULT 0;