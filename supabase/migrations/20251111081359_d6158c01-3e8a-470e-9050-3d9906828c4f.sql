-- Add missing fields to accounting_cards table
ALTER TABLE accounting_cards ADD COLUMN IF NOT EXISTS billing_plan_type TEXT;
ALTER TABLE accounting_cards ADD COLUMN IF NOT EXISTS payment_type TEXT;
ALTER TABLE accounting_cards ADD COLUMN IF NOT EXISTS next_payment_due DATE;
ALTER TABLE accounting_cards ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'current';

-- Create index for checking overdue payments efficiently
CREATE INDEX IF NOT EXISTS idx_accounting_cards_next_payment_due ON accounting_cards(next_payment_due) WHERE invoice_status != 'missed';