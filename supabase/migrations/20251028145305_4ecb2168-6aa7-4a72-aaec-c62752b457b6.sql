-- Add admin_notes column to clients table
ALTER TABLE public.clients
ADD COLUMN admin_notes text;