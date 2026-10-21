CREATE POLICY "job-specs auth read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'job-specs');

CREATE POLICY "job-specs auth insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'job-specs');

CREATE POLICY "job-specs auth update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'job-specs');

CREATE POLICY "job-specs auth delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'job-specs');