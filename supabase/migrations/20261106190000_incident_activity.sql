CREATE TABLE IF NOT EXISTS public.incident_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incident_activity_incident_created_at_idx
  ON public.incident_activity (incident_id, created_at DESC);

ALTER TABLE public.incident_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view activity for own incidents" ON public.incident_activity;
CREATE POLICY "Users can view activity for own incidents"
  ON public.incident_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.incidents
      WHERE incidents.id = incident_activity.incident_id
        AND incidents.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can add activity to own incidents" ON public.incident_activity;
CREATE POLICY "Users can add activity to own incidents"
  ON public.incident_activity FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.incidents
      WHERE incidents.id = incident_activity.incident_id
        AND incidents.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.incident_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.incident_activity TO authenticated;
