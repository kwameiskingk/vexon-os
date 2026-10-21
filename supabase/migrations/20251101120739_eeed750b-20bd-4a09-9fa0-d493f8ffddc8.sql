-- Add close_lead_link column to meetings table
ALTER TABLE public.meetings 
ADD COLUMN close_lead_link text;