
CREATE POLICY "ticket-attachments dev read all"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ticket-attachments' AND public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "ticket-attachments owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ticket-attachments' AND owner = auth.uid());

CREATE POLICY "ticket-attachments authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ticket-attachments' AND owner = auth.uid());

CREATE POLICY "ticket-attachments dev delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ticket-attachments' AND public.has_role(auth.uid(), 'dev'::app_role));
