CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.cisa_kev_entries (
  cve_id text PRIMARY KEY CHECK (cve_id ~ '^CVE-[0-9]{4}-[0-9]{4,}$'),
  vendor_project text NOT NULL,
  product text NOT NULL,
  vulnerability_name text NOT NULL,
  date_added date NOT NULL,
  short_description text NOT NULL,
  required_action text NOT NULL,
  due_date date NOT NULL,
  known_ransomware_campaign_use text NOT NULL CHECK (known_ransomware_campaign_use IN ('Known', 'Unknown')),
  notes text,
  cwes text[] NOT NULL DEFAULT '{}',
  catalog_version text NOT NULL,
  catalog_released date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cisa_kev_due_date_idx ON public.cisa_kev_entries(due_date);

ALTER TABLE public.cisa_kev_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read CISA KEV entries"
  ON public.cisa_kev_entries FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.cisa_kev_entries FROM anon, authenticated;
GRANT SELECT ON public.cisa_kev_entries TO authenticated;
GRANT ALL ON public.cisa_kev_entries TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_sentinelboard_cisa_kev_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_url text;
  project_secret text;
BEGIN
  SELECT decrypted_secret INTO project_url
  FROM vault.decrypted_secrets
  WHERE name = 'sentinelboard_project_url';

  SELECT decrypted_secret INTO project_secret
  FROM vault.decrypted_secrets
  WHERE name = 'sentinelboard_project_secret';

  IF project_url IS NULL OR project_secret IS NULL THEN
    RAISE LOG 'CISA KEV sync skipped: configure the SentinelBoard project URL and secret key in Supabase Vault.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/sync-cisa-kev',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', project_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_sentinelboard_cisa_kev_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_sentinelboard_cisa_kev_sync() TO postgres;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'sentinelboard-cisa-kev-daily';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'sentinelboard-cisa-kev-daily',
    '15 3 * * *',
    'SELECT public.invoke_sentinelboard_cisa_kev_sync()'
  );
END;
$$;
