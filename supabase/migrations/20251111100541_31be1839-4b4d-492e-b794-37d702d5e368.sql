-- Add indexes for better performance on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_meetings_meeting_date ON public.meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_accounting_cards_next_payment_due ON public.accounting_cards(next_payment_due);
CREATE INDEX IF NOT EXISTS idx_candidates_date_of_call ON public.candidates(date_of_call);
CREATE INDEX IF NOT EXISTS idx_admin_messages_created_at ON public.admin_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_messages_recipient_id ON public.admin_messages(recipient_id);