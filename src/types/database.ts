export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type IncidentSeverity = Exclude<Severity, 'info'>
export type IOCType = 'ip' | 'domain' | 'url' | 'hash_md5' | 'hash_sha256'
export type EventSource =
  | 'syslog'
  | 'windows_event'
  | 'firewall'
  | 'ids'
  | 'manual'
  | 'sample_dataset'
  | 'webhook'
export type EventCategory =
  | 'authentication'
  | 'network'
  | 'malware'
  | 'policy'
  | 'system'
  | 'application'

export interface Profile {
  id: string
  display_name: string | null
  role: 'analyst' | 'lead'
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  user_id: string
  source: EventSource
  severity: Severity
  category: EventCategory | null
  title: string
  description: string | null
  raw_data: Json | null
  external_id: string | null
  source_ip: string | null
  dest_ip: string | null
  hostname: string | null
  event_time: string
  is_sample: boolean
  created_at: string
  updated_at: string
}

export interface IOC {
  id: string
  user_id: string
  type: IOCType
  value: string
  severity: Severity | null
  tags: string[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface IOCEnrichment {
  id: string
  ioc_id: string
  provider: 'virustotal' | 'abuseipdb' | 'otx'
  status: 'pending' | 'success' | 'error' | 'rate_limited' | 'not_found'
  raw_response: Json | null
  summary: Json | null
  error_message: string | null
  queried_at: string
}

export interface AttackTechnique {
  id: string
  name: string
  description: string | null
  tactic: string
  url: string
  is_subtechnique: boolean
  parent_id: string | null
}

export interface EventTechnique {
  id: string
  event_id: string
  technique_id: string
  confidence: 'suggested' | 'confirmed' | 'rejected'
  assigned_by: string | null
  created_at: string
}

export interface ScanUpload {
  id: string
  user_id: string
  filename: string
  file_type: 'nuclei_json' | 'nuclei_jsonl' | 'nmap_xml'
  file_size_bytes: number
  storage_path: string
  parse_status: 'pending' | 'parsing' | 'complete' | 'error'
  parse_error: string | null
  total_findings: number | null
  created_at: string
}

export interface ScanFinding {
  id: string
  scan_upload_id: string
  host: string
  port: number | null
  severity: Severity
  title: string
  description: string | null
  cve_ids: string[] | null
  reference_urls: string[] | null
  matched_at: string | null
  raw_finding: Json | null
  created_at: string
}

export interface Incident {
  id: string
  user_id: string
  title: string
  description: string | null
  severity: IncidentSeverity
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
}

export interface IncidentIOC {
  incident_id: string
  ioc_id: string
  added_at: string
}

export interface IncidentEvent {
  incident_id: string
  event_id: string
  added_at: string
}

export interface IncidentActivity {
  id: string
  incident_id: string
  actor_id: string | null
  action: string
  details: Json
  created_at: string
}
