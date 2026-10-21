-- Allow setter_id to be nullable for SDR Trialist meetings
ALTER TABLE public.meetings 
ALTER COLUMN setter_id DROP NOT NULL;