-- SentinelBoard Initial Database Schema Migration
-- Migration: 20261106000000_initial_schema.sql
-- Description: Provision baseline tables, indexes, triggers, and Row Level Security (RLS) policies.

-- 1. Helper function for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role text NOT NULL DEFAULT 'analyst' CHECK (role IN ('analyst', 'lead')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auth trigger to create profile on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 'analyst')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Security Events table
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('syslog', 'windows_event', 'firewall', 'ids', 'manual', 'sample_dataset', 'webhook')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category text CHECK (category IN ('authentication', 'network', 'malware', 'policy', 'system', 'application')),
  title text NOT NULL,
  description text,
  raw_data jsonb DEFAULT NULL,
  source_ip inet,
  dest_ip inet,
  hostname text,
  event_time timestamptz NOT NULL DEFAULT now(),
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_id_idx ON public.events(user_id);
CREATE INDEX IF NOT EXISTS events_severity_idx ON public.events(severity);
CREATE INDEX IF NOT EXISTS events_event_time_idx ON public.events(event_time DESC);
CREATE INDEX IF NOT EXISTS events_source_idx ON public.events(source);
CREATE INDEX IF NOT EXISTS events_category_idx ON public.events(category);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own events"
  ON public.events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Realtime for events
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- 4. MITRE ATT&CK Techniques reference table
CREATE TABLE IF NOT EXISTS public.attack_techniques (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  tactic text NOT NULL,
  url text NOT NULL,
  is_subtechnique boolean NOT NULL DEFAULT false,
  parent_id text
);

CREATE INDEX IF NOT EXISTS attack_techniques_tactic_idx ON public.attack_techniques(tactic);

ALTER TABLE public.attack_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read ATT&CK techniques"
  ON public.attack_techniques FOR SELECT
  TO authenticated
  USING (true);

-- 5. Event-Techniques junction table
CREATE TABLE IF NOT EXISTS public.event_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  technique_id text NOT NULL REFERENCES public.attack_techniques(id) ON DELETE CASCADE,
  confidence text NOT NULL DEFAULT 'suggested' CHECK (confidence IN ('suggested', 'confirmed', 'rejected')),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, technique_id)
);

CREATE INDEX IF NOT EXISTS event_techniques_event_idx ON public.event_techniques(event_id);
CREATE INDEX IF NOT EXISTS event_techniques_technique_idx ON public.event_techniques(technique_id);

ALTER TABLE public.event_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage techniques on own events"
  ON public.event_techniques FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_techniques.event_id
        AND events.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_techniques.event_id
        AND events.user_id = auth.uid()
    )
  );

-- 6. Indicators of Compromise (IOCs) table
CREATE TABLE IF NOT EXISTS public.iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ip', 'domain', 'url', 'hash_md5', 'hash_sha256')),
  value text NOT NULL,
  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  tags text[] DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, value)
);

CREATE INDEX IF NOT EXISTS iocs_user_id_idx ON public.iocs(user_id);
CREATE INDEX IF NOT EXISTS iocs_type_idx ON public.iocs(type);
CREATE INDEX IF NOT EXISTS iocs_value_idx ON public.iocs(value);

ALTER TABLE public.iocs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own iocs"
  ON public.iocs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_iocs_updated_at
  BEFORE UPDATE ON public.iocs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. IOC Enrichments table
CREATE TABLE IF NOT EXISTS public.ioc_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ioc_id uuid NOT NULL REFERENCES public.iocs(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('virustotal', 'abuseipdb', 'otx')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error', 'rate_limited', 'not_found')),
  raw_response jsonb DEFAULT NULL,
  summary jsonb DEFAULT NULL,
  error_message text,
  queried_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ioc_enrichments_ioc_id_idx ON public.ioc_enrichments(ioc_id);
CREATE INDEX IF NOT EXISTS ioc_enrichments_provider_idx ON public.ioc_enrichments(provider);

ALTER TABLE public.ioc_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage enrichments for own iocs"
  ON public.ioc_enrichments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.iocs
      WHERE iocs.id = ioc_enrichments.ioc_id
        AND iocs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.iocs
      WHERE iocs.id = ioc_enrichments.ioc_id
        AND iocs.user_id = auth.uid()
    )
  );

-- 8. Scan Uploads table
CREATE TABLE IF NOT EXISTS public.scan_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('nuclei_json', 'nuclei_jsonl', 'nmap_xml')),
  file_size_bytes integer NOT NULL CHECK (file_size_bytes <= 10485760),
  storage_path text NOT NULL,
  parse_status text NOT NULL DEFAULT 'pending' CHECK (parse_status IN ('pending', 'parsing', 'complete', 'error')),
  parse_error text,
  total_findings integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scan_uploads_user_id_idx ON public.scan_uploads(user_id);

ALTER TABLE public.scan_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scan uploads"
  ON public.scan_uploads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 9. Scan Findings table
CREATE TABLE IF NOT EXISTS public.scan_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_upload_id uuid NOT NULL REFERENCES public.scan_uploads(id) ON DELETE CASCADE,
  host text NOT NULL,
  port integer,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title text NOT NULL,
  description text,
  cve_ids text[] DEFAULT '{}',
  reference_urls text[] DEFAULT '{}',
  matched_at text,
  raw_finding jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scan_findings_scan_upload_idx ON public.scan_findings(scan_upload_id);
CREATE INDEX IF NOT EXISTS scan_findings_severity_idx ON public.scan_findings(severity);
CREATE INDEX IF NOT EXISTS scan_findings_host_idx ON public.scan_findings(host);

ALTER TABLE public.scan_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage findings for own scan uploads"
  ON public.scan_findings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scan_uploads
      WHERE scan_uploads.id = scan_findings.scan_upload_id
        AND scan_uploads.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scan_uploads
      WHERE scan_uploads.id = scan_findings.scan_upload_id
        AND scan_uploads.user_id = auth.uid()
    )
  );

-- 10. Incidents table
CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'contained', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incidents_user_id_idx ON public.incidents(user_id);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON public.incidents(status);
CREATE INDEX IF NOT EXISTS incidents_severity_idx ON public.incidents(severity);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own incidents"
  ON public.incidents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Incident-IOCs junction table
CREATE TABLE IF NOT EXISTS public.incident_iocs (
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  ioc_id uuid NOT NULL REFERENCES public.iocs(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, ioc_id)
);

ALTER TABLE public.incident_iocs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage iocs on own incidents"
  ON public.incident_iocs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents
      WHERE incidents.id = incident_iocs.incident_id
        AND incidents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.incidents
      WHERE incidents.id = incident_iocs.incident_id
        AND incidents.user_id = auth.uid()
    )
  );

-- 12. Incident-Events junction table
CREATE TABLE IF NOT EXISTS public.incident_events (
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, event_id)
);

ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage events on own incidents"
  ON public.incident_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents
      WHERE incidents.id = incident_events.incident_id
        AND incidents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.incidents
      WHERE incidents.id = incident_events.incident_id
        AND incidents.user_id = auth.uid()
    )
  );
