ALTER TABLE public.marking_sessions ADD COLUMN IF NOT EXISTS system_prompt text;

CREATE TABLE IF NOT EXISTS public.draft_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  draft_markdown text NOT NULL,
  system_prompt_used text,
  context_used text,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.draft_versions TO authenticated;
GRANT ALL ON public.draft_versions TO service_role;

ALTER TABLE public.draft_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own draft versions" ON public.draft_versions;
CREATE POLICY "own draft versions" ON public.draft_versions
  FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS draft_versions_submission_idx
  ON public.draft_versions (submission_id, created_at DESC);