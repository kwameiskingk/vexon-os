-- Drop the existing foreign key constraint (if it exists)
ALTER TABLE public.accounting_cards
DROP CONSTRAINT IF EXISTS accounting_cards_client_id_fkey;

-- Add new foreign key constraint pointing to clients table
ALTER TABLE public.accounting_cards
ADD CONSTRAINT accounting_cards_client_id_fkey 
FOREIGN KEY (client_id) 
REFERENCES public.clients(id) 
ON DELETE CASCADE;