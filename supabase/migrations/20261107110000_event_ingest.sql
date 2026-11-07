ALTER TABLE public.events ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS events_user_source_external_id_uidx
  ON public.events (user_id, source, external_id);

CREATE TABLE IF NOT EXISTS public.event_ingest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 64),
  token_prefix text NOT NULL CHECK (length(token_prefix) BETWEEN 8 AND 32),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  rate_window_started_at timestamptz NOT NULL DEFAULT now(),
  rate_window_count integer NOT NULL DEFAULT 0 CHECK (rate_window_count >= 0)
);

CREATE INDEX IF NOT EXISTS event_ingest_tokens_user_created_idx
  ON public.event_ingest_tokens (user_id, created_at DESC);
ALTER TABLE public.event_ingest_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view metadata for own ingest tokens" ON public.event_ingest_tokens;
CREATE POLICY "Users can view metadata for own ingest tokens"
  ON public.event_ingest_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.event_ingest_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, label, token_prefix, created_at, last_used_at, expires_at, revoked_at)
  ON public.event_ingest_tokens TO authenticated;
GRANT ALL ON public.event_ingest_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.consume_event_ingest_quota(p_token_hash text)
RETURNS TABLE (owner_id uuid, token_id uuid, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  token_row public.event_ingest_tokens%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO token_row
  FROM public.event_ingest_tokens AS tokens
  WHERE tokens.token_hash = p_token_hash
    AND tokens.revoked_at IS NULL
    AND (tokens.expires_at IS NULL OR tokens.expires_at > v_now)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, false;
    RETURN;
  END IF;

  IF token_row.rate_window_started_at <= v_now - interval '1 minute' THEN
    UPDATE public.event_ingest_tokens AS tokens
    SET rate_window_started_at = v_now,
        rate_window_count = 1,
        last_used_at = v_now
    WHERE tokens.id = token_row.id;
    RETURN QUERY SELECT token_row.user_id, token_row.id, true;
    RETURN;
  END IF;

  IF token_row.rate_window_count >= 60 THEN
    RETURN QUERY SELECT token_row.user_id, token_row.id, false;
    RETURN;
  END IF;

  UPDATE public.event_ingest_tokens AS tokens
  SET rate_window_count = tokens.rate_window_count + 1,
      last_used_at = v_now
  WHERE tokens.id = token_row.id;
  RETURN QUERY SELECT token_row.user_id, token_row.id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_event_ingest_quota(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_event_ingest_quota(text) TO service_role;
