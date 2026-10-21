-- Fix foreign key constraint to point to client_profiles instead of clients
ALTER TABLE accounting_cards DROP CONSTRAINT IF EXISTS accounting_cards_client_id_fkey;

ALTER TABLE accounting_cards 
  ADD CONSTRAINT accounting_cards_client_id_fkey 
  FOREIGN KEY (client_id) 
  REFERENCES client_profiles(id) 
  ON DELETE CASCADE;