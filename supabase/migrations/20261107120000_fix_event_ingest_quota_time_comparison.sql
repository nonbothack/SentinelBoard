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
