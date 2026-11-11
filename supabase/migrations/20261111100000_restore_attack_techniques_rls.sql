-- Restore the RLS protection and authenticated read policy defined in
-- 20261106000000_initial_schema.sql after live schema drift was detected.
ALTER TABLE public.attack_techniques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read ATT&CK techniques"
  ON public.attack_techniques;

CREATE POLICY "Anyone authenticated can read ATT&CK techniques"
  ON public.attack_techniques
  FOR SELECT
  TO authenticated
  USING (true);
