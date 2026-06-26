
CREATE POLICY "users read own marking files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marking-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users insert own marking files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marking-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users update own marking files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marking-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "users delete own marking files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marking-files' AND (storage.foldername(name))[1] = auth.uid()::text);
