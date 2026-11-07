# SentinelBoard

**A full-stack SOC analyst workbench for organizing security events, investigating indicators of compromise, and tracking incidents.**

[![Live app](https://img.shields.io/badge/app-live-2563eb)](https://sentinelboard-six.vercel.app)

SentinelBoard is a portfolio project built around real analyst workflows. It stores workspace data in Supabase, applies row-level security, and enriches indicators through server-side threat-intelligence integrations.

**Live app:** [sentinelboard-six.vercel.app](https://sentinelboard-six.vercel.app)

> Scan files are results to upload and review; SentinelBoard does not launch scanners. CISA KEV sync and external event ingestion require their Supabase migrations and Edge Functions to be deployed.

## Screenshots

These are captures of SentinelBoard's actual UI components populated with public security records. The event feed shows entries from CISA's KEV catalog release `2026.11.04`, with CVSS 3.1 ratings retrieved from NVD on `2026-11-06`. The ATT&CK view uses techniques cited in CISA/FBI advisory AA25-022A. The public records are rendered locally for these screenshots; they were not added to the production workspace. The live KEV catalog feature requires the sync function and Vault configuration described below.

![SentinelBoard event feed showing current CISA KEV records with NVD severity and remediation details](docs/screenshots/event-feed-cisa.jpg)

![SentinelBoard ATT&CK view showing techniques reported in CISA/FBI advisory AA25-022A](docs/screenshots/attack-map-cisa.jpg)

Sources: [CISA Known Exploited Vulnerabilities catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog), [CISA KEV JSON feed](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json), [NVD CVE API](https://services.nvd.nist.gov/rest/json/cves/2.0), [CISA/FBI AA25-022A advisory](https://www.cisa.gov/sites/default/files/2025-02/aa25-022a-threat-actors-chained-vulnerabilities-in-ivanti-cloud-service-applications_2.pdf), and [MITRE ATT&CK Enterprise](https://attack.mitre.org/).

## Features

- **Dashboard:** workspace counts and recent events and incidents, queried from the signed-in user's data.
- **IOC enrichment:** validate and submit IP addresses, domains, URLs, MD5 hashes, and SHA-256 hashes; view cached results and provider summaries from VirusTotal, AbuseIPDB, and AlienVault OTX where supported.
- **Security event feed:** import event JSON, filter events, inspect details, tag events with MITRE ATT&CK techniques, and receive new events through Supabase Realtime. Bundled development events are labeled as fictional telemetry; imported and live workspace events retain their own provenance.
- **ATT&CK map:** search the bundled Enterprise ATT&CK technique data and review event tags.
- **Scan results:** upload Nuclei JSON/JSONL or Nmap XML results up to 10 MB. Files are parsed in the browser; the source file is stored in a private Supabase Storage bucket.
- **Incident tracker:** create incidents, transition their status, attach events and IOCs, review an activity timeline, and download a Markdown report.
- **Response playbooks:** track analyst checklist progress for ransomware, account compromise, phishing, and web exploitation incidents. Playbooks are guided prompts aligned with NIST SP 800-61 Rev. 3; they do not execute response actions.
- **CISA KEV:** match scan finding CVEs against the CISA Known Exploited Vulnerabilities catalog. A daily catalog sync runs after its Supabase function, migration, and Vault values are configured.
- **Event ingestion:** create per-source bearer tokens in Settings and send normalized JSON, Suricata EVE, Wazuh, CEF, or RFC 5424 syslog to the event-ingestion endpoint.
- **Authentication:** email and password sign-up/sign-in with email confirmation.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS 4 |
| UI and visualization | Radix UI primitives, shadcn-style components, Sonner, Lucide, Recharts |
| Data access | Supabase JavaScript client, TanStack Query, React Router |
| Backend | Supabase Auth, PostgreSQL with RLS, Realtime, Storage, Edge Functions |
| Deployment | Vercel |
| Threat intelligence | VirusTotal API v3, AbuseIPDB API v2, AlienVault OTX API v1 |
| Technique reference | Bundled MITRE ATT&CK Enterprise data |

## Architecture

```mermaid
flowchart LR
  Analyst["Analyst browser<br/>React + Vite"]
  Auth[Supabase Auth]
  DB[("Supabase PostgreSQL<br/>RLS-protected tables")]
  Realtime["Supabase Realtime<br/>event inserts"]
  Storage[(Private scan-files bucket)]
  Edge["enrich-ioc<br/>Supabase Edge Function"]
  Ingest["ingest-event<br/>token-authenticated webhook"]
  CISA["CISA KEV feed<br/>daily sync"]
  SIEM["External security source"]
  VT[VirusTotal]
  Abuse[AbuseIPDB]
  OTX[AlienVault OTX]

  Analyst -->|Sign in| Auth
  Analyst -->|User-scoped reads and writes| DB
  DB -->|New event notifications| Realtime
  Realtime --> Analyst
  Analyst -->|Upload scan result| Storage
  Analyst -->|Authenticated invocation| Edge
  SIEM -->|Bearer ingest token| Ingest
  Ingest --> DB
  CISA -->|Daily catalog sync| DB
  Edge --> VT
  Edge --> Abuse
  Edge --> OTX
  Edge -->|Store result summaries| DB
```

The browser uses the Supabase anon key and a signed-in user's session. RLS limits access to that user's records. Provider API keys stay in Supabase Edge Function secrets; they are never shipped to the browser.

## Local development

### Requirements

- Node.js `^20.19.0` or `>=22.12.0`, plus npm
- A Supabase project with the SentinelBoard database schema, RLS policies, `events` Realtime publication, and private `scan-files` bucket configured
- Provider API keys configured as Supabase Edge Function secrets to use live IOC enrichment

### Start the frontend

```bash
git clone https://github.com/nonbothack/SentinelBoard.git
cd SentinelBoard
npm install
```

Create `.env.local` with the two frontend values, then start Vite:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

```bash
npm run dev
```

Vite serves the app at `http://localhost:5173`. Add that URL to Supabase Auth's allowed redirect URLs for local email confirmation. The Supabase Site URL and redirect allowlist must also include the production app URL when deploying.

### Supabase setup notes

The full database schema is version-controlled under `supabase/migrations/`:
- `20261106000000_initial_schema.sql`: Provisions all core tables (`profiles`, `events`, `attack_techniques`, `event_techniques`, `iocs`, `ioc_enrichments`, `scan_uploads`, `scan_findings`, `incidents`, `incident_iocs`, `incident_events`), automated timestamp triggers, and Row Level Security (RLS) policies.
- `20261106190000_incident_activity.sql`: Provisions the incident investigation timeline and activity audit log.
- `20261107100000_cisa_kev.sql`: Provisions the KEV catalog and daily Cron job. Add `sentinelboard_project_url` and the project's `default` secret API key to Supabase Vault for the scheduled function call.
- `20261107110000_event_ingest.sql`: Adds event idempotency keys, hashed ingest-token storage, RLS, and atomic per-token request limiting.
- `supabase/seed/attack_techniques.sql`: Seeds 706 MITRE ATT&CK Enterprise techniques.

To link the Supabase CLI to a project, apply migrations, and deploy the enrichment function:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push
npx supabase@latest functions deploy enrich-ioc
npx supabase@latest functions deploy sync-cisa-kev
npx supabase@latest functions deploy ingest-event
npx supabase@latest functions deploy manage-ingest-token
```

Before invoking enrichment, configure `VT_API_KEY`, `ABUSEIPDB_API_KEY`, and `OTX_API_KEY` as Edge Function secrets in the Supabase project settings. Use the dashboard's secret fields or a secure secret manager; avoid pasting key values into shell commands. Do not put provider keys in `.env.local`, Vercel frontend variables, or committed files. Only the Supabase URL and anon key belong in the frontend environment.

To enable the daily CISA KEV sync, add the project's Supabase URL and its `default` secret API key to Vault as `sentinelboard_project_url` and `sentinelboard_project_secret`. The migration creates the daily Cron job; the KEV table remains empty until the sync function is deployed and these Vault values are set.

## Database overview

The app reads and writes the following Supabase tables. User-owned rows are protected by RLS; `attack_techniques` is shared reference data.

| Table | Purpose |
| --- | --- |
| `profiles` | Application profile linked to Supabase Auth |
| `events` | Normalized security events and provenance marker |
| `iocs` | User-submitted indicators |
| `ioc_enrichments` | Per-provider status, summary, and stored response |
| `attack_techniques` | Bundled Enterprise ATT&CK reference data |
| `event_techniques` | Event-to-technique tags |
| `scan_uploads` | Uploaded scan-file metadata and parse status |
| `scan_findings` | Findings parsed from scan files |
| `incidents` | Incident case and status |
| `incident_iocs` | Incident-to-IOC links |
| `incident_events` | Incident-to-event links |
| `incident_activity` | Incident investigation timeline |
| `cisa_kev_entries` | Cached CISA Known Exploited Vulnerabilities catalog |
| `event_ingest_tokens` | Hashed event-ingestion credentials and rate-limit state |

The private `scan-files` Storage bucket contains source scan files under a user-scoped path. The `events` table is published to Supabase Realtime for the live feed.

## API integrations

- **VirusTotal v3:** IP, domain, URL, and file-hash lookups. URL submissions use the `/urls` endpoint and read the resulting `/analyses/{id}` analysis.
- **AbuseIPDB v2:** IP address checks.
- **AlienVault OTX:** IP, domain, and file-hash context. OTX does not enrich URL indicators in this implementation.
- **MITRE ATT&CK:** Enterprise technique data is bundled with the app; technique lookup does not call a remote API on each view.
- **CISA KEV:** Official catalog JSON is validated before synchronized rows are refreshed. Scan CVEs are matched locally against the cached catalog.

Each applicable provider is queried independently, so a provider error or rate limit can be shown alongside other provider results. Provider quotas and response coverage depend on the providers' current plans.

### External event ingestion

Create a named token from **Settings → Event ingestion tokens**. The plaintext token is shown once; store it in the source system's secret manager. Tokens are stored as SHA-256 hashes, expire after 90 days, and can be revoked from Settings. Each token allows 60 requests per minute. Each request is limited to 1 MB and 100 events. Repeated events with the same source event ID from the same token are ignored; events without one receive a deterministic idempotency key.

```http
POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/ingest-event
Authorization: Bearer sb_ingest_<token>
Content-Type: application/json
```

JSON can be one event, an array, or an object with an `events` array. Accepted fields include `title`/`message`, `severity`, `category`, `event_time`/`timestamp`, `source_ip`/`src_ip`, `dest_ip`/`dst_ip`, `hostname`, and `external_id`/`event_id`. Suricata EVE fields, common Wazuh fields, CEF, and RFC 5424 syslog are normalized into the same event table. Workspace ownership and the `webhook` source are assigned by the server; payload `user_id`, `source`, and `is_sample` values are ignored. Responses include accepted, duplicate, and invalid-event counts.

## Security considerations

- Enable and maintain RLS on user-owned tables; frontend access uses the Supabase anon key and authenticated session.
- Keep VirusTotal, AbuseIPDB, and OTX keys in Supabase Edge Function secrets. Never expose a service-role key or provider key in browser code.
- Scan files are limited to 10 MB, parsed in the browser, and stored in a private bucket with a user-scoped storage path.
- Treat imported event and scan content as untrusted input. Avoid importing sensitive telemetry into the publicly accessible deployment.
- Configure Supabase Auth Site URL and redirect allowlist for the production domain and local development origins.

## Known limitations & roadmap

- Scan visualization accepts existing Nuclei or Nmap output; it does not launch scanners.
- Event ingestion supports the documented JSON, CEF, and RFC 5424 formats; additional vendor-specific schemas may need mapping.
- The CISA KEV catalog is populated only when the scheduled sync has been deployed and its Vault values are configured.
- The live feed subscribes to event inserts; it is not a general-purpose distributed streaming pipeline.
- IOC verdicts reflect provider data available at query time, can be cached, and can be incomplete or rate-limited.
- No AI-generated analysis or automated remediation is included.

See [IMPROVEMENTS.md](IMPROVEMENTS.md) for the architectural roadmap, remaining planned features (including Sigma rule generation and attack graph exploration), and interview talking points. Incident response playbooks reference [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final).

## Author

Built by [@nonbothack](https://github.com/nonbothack). The developer profile includes a Google Vulnerability Reward Program P2/S2 bug bounty with $500 paid and the Google Cybersecurity Professional Certificate in progress.
