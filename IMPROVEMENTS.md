# SentinelBoard: Strategic Architecture & Portfolio Improvement Roadmap

**Target Audience:** Engineering Reviewers, SOC Hiring Managers, and Blue Team Interviewers  
**Current Milestone:** MVP v1.0 (Candidate F — Direction C: Tactical Analyst Workbench)  
**Maintained by:** Omkar Ambre ([@nonbothack](https://github.com/nonbothack))  
**Last Updated:** November 2026

---

## 1. Architectural Baseline & Current State Audit

SentinelBoard was engineered to overcome the high saturation of generic student cybersecurity projects (e.g., standard CLI VirusTotal lookups) by delivering an operational, full-stack SecOps analyst workbench deployed on modern web infrastructure.

### 1.1 Verified Capabilities (Production MVP)
* **Real-time Event Stream:** PostgreSQL Write-Ahead Log (WAL) Change Data Capture (CDC) delivered via Supabase Realtime WebSockets directly into a compact analyst interface.
* **Multi-Provider Serverless IOC Enrichment:** Deno Edge Functions securely orchestrating concurrent queries to VirusTotal v3, AbuseIPDB v2, and AlienVault OTX, keeping all third-party API credentials isolated from browser runtimes.
* **Static Threat Taxonomy:** 706 MITRE ATT&CK Enterprise techniques seeded into PostgreSQL with relational tagging to events and incidents.
* **Client-Side Scan Parsing:** Client-side parsers for Nuclei JSON/JSONL vulnerability outputs and Nmap XML port/service scans with automated CVE correlation and raw payload persistence in private storage.
* **Incident Lifecycle Management:** State machine (`open` → `investigating` → `contained` → `resolved` → `closed`), activity audit trails, and automated Markdown incident triage report generation.
* **Strict Tenant Isolation:** Complete PostgreSQL Row-Level Security (RLS) policies on all tables, ensuring multi-tenant data confidentiality.

---

## 2. Priority 1: Production Infrastructure & Core Refinements

These improvements address current MVP operational constraints and elevate the platform to commercial-grade engineering standards.

### 2.1 Complete Settings & Integrations Workspace
* **Current State:** The `/settings` route exists as an MVP placeholder.
* **Improvement:**
  * Build out custom API Key Management: Allow analysts to bring their own threat intelligence keys (VirusTotal Enterprise, Shodan, Censys, GreyNoise) stored encrypted via Supabase Vault or user-scoped encrypted columns.
  * Webhook Configuration: UI for generating user-scoped ingestion webhook URLs and bearer tokens.
  * Analyst Notification Preferences: Webhook dispatch to Slack, Microsoft Teams, or Discord on `critical` severity events.
  * Theme & Density Controls: Toggle between "Compact Tactical" (current Direction C default) and "Expanded Audit" table views.

### 2.2 Ingestion Webhook Endpoint (`/api/v1/events/ingest`)
* **Current State:** Events enter the system via client-side JSON file upload or the sample data loader.
* **Improvement:**
  * Deploy a Supabase Edge Function `ingest-event` accepting HTTP POST requests with a Bearer Token.
  * Standardize log normalization: Accept common formats (CEF, Syslog RFC 5424, Suricata EVE JSON, Wazuh alerts) and map them to the SentinelBoard `events` schema.
  * Enables live integration: A developer or interviewer can point a real Wazuh agent, auditd forwarder, or Cowrie honeypot directly at their SentinelBoard instance.

### 2.3 Automated Storage Lifecycle & Cascade Cleanups
* **Current State:** Deleting a `scan_uploads` record removes database rows via SQL foreign keys, but source files in the private `scan-files` storage bucket must be cleaned up manually.
* **Improvement:**
  * Implement a PostgreSQL database webhook or trigger on `scan_uploads` deletion that invokes a storage cleanup function via Supabase Storage API, ensuring zero orphaned files.

### 2.4 Resilient Realtime Connection Management
* **Current State:** The frontend subscribes to Supabase Realtime on mount; network drops rely on standard client reconnection.
* **Improvement:**
  * Wrap the Realtime subscription in an exponential-backoff resilient hook with visual connection state indicators (Connected / Reconnecting / Offline) in the top status bar.
  * Buffer incoming events in memory during brief network hiccups and reconcile missed sequences via timestamp query on reconnection.

---

## 3. Priority 2: Recruiter "Wow-Factor" & Analytical Capabilities

These features directly demonstrate senior-level SOC operations, detection engineering, and threat intelligence workflows.

### 3.1 Live Threat Intelligence Auto-Feed (CISA KEV Integration)
* **Concept:** Connect SentinelBoard to live, authoritative government threat feeds.
* **Implementation:**
  * Scheduled Edge Function (Cron) pulling the daily [CISA Known Exploited Vulnerabilities (KEV) Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog).
  * Auto-correlate uploaded Nuclei scan findings against CISA KEV CVE IDs, tagging matches with a prominent `KNOWN EXPLOITED (CISA KEV)` high-priority warning banner.
* **Resume Impact:** Demonstrates understanding of federal vulnerability management mandates and risk-based prioritization.

### 3.2 Detection Engineering: Sigma & YARA Rule Generator
* **Concept:** Bridge incident investigation to proactive defense by generating detection rules directly from observed attacker behavior.
* **Implementation:**
  * Add a "Generate Detection Rule" button on any Event or Incident detail drawer.
  * Automatically convert event metadata (process names, command-line arguments, network ports, ATT&CK technique IDs) into:
    * **Sigma Rule (YAML):** Compatible with Splunk (SPL), Elastic (EQL/KQL), and Microsoft Sentinel.
    * **Snort/Suricata Rule:** For network-based IOCs (malicious IPs and domains).
    * **YARA Rule:** For file hashes identified during triage.
* **Resume Impact:** Shows fluency in modern Detection-as-Code practices and cross-SIEM portability.

### 3.3 Relational Attack Graph (Visual Threat Chain)
* **Concept:** Analysts triage complex threats faster using node-link graph visualizations rather than paginated tables.
* **Implementation:**
  * Implement an interactive attack chain canvas using React Flow or Cytoscape.js.
  * Graph schema:
    `[Source IP]` ──(Network Connection)──> `[Host / Endpoint]` ──(Execution)──> `[ATT&CK Technique]` ──(Associated With)──> `[Active Incident]`
  * Allow clicking any node to inspect raw JSON payloads, trigger ad-hoc enrichment, or add to case files.
* **Resume Impact:** Demonstrates visual engineering capability and deep understanding of attacker lateral movement.

### 3.4 Structured Incident Response Playbooks (NIST SP 800-61 / SANS)
* **Concept:** Transform the Incident Tracker from a simple Kanban into an operational IR playbook runner.
* **Implementation:**
  * When an incident is created, allow selecting a Playbook Template:
    * *Ransomware / Outpost C2 Communication*
    * *Unauthorized SSH / RDP Brute Force*
    * *Phishing / Credential Harvesting*
    * *Web Application Exploitation (SQLi / SSRF)*
  * The incident view renders structured stage checklists:
    1. **Identification:** Verify indicators, scope affected assets.
    2. **Containment:** Isolate host, block egress IPs on perimeter firewall.
    3. **Eradication:** Revoke compromised tokens, wipe persistence mechanisms.
    4. **Recovery:** Restore from verified backups, monitor telemetry for reinfection.
    5. **Lessons Learned:** Root-cause analysis and automated timeline generation.
* **Resume Impact:** Proves the candidate understands enterprise SOC compliance, standard operating procedures, and NIST guidance.

### 3.5 Executive & Technical PDF Report Generator
* **Concept:** While Markdown reports are developer-friendly, executive stakeholders and audit teams require formatted compliance documentation.
* **Implementation:**
  * Implement client-side PDF compilation using `@react-pdf/renderer`.
  * Structure:
    * Executive Summary & Severity Rating
    * Observed MITRE ATT&CK Matrix coverage
    * Evidence Table (Enriched IOCs with VirusTotal/AbuseIPDB scores)
    * Incident Activity Timeline with cryptographically hashed analyst signatures (`SHA-256` digest of final report).

---

## 4. Priority 3: Extended Threat Intelligence Integrations

Expand beyond the three base providers to provide full attack surface context:

| Provider | Data Extracted | SOC Value |
| :--- | :--- | :--- |
| **Shodan / Censys** | Open ports, running banners, SSL certificate chains | Contextualize whether an external IP is a known C2 server or cloud hosting node |
| **GreyNoise** | Internet-wide scanning noise vs. targeted attack | Filters out benign scanning bots (e.g., Censys, Shodan, Mirai sweeps) from targeted attacks |
| **FIRST EPSS** | Exploit Prediction Scoring System percentile | Predicts real-world exploitation probability within 30 days for discovered CVEs |
| **URLScan.io** | Automated DOM capture, screenshot, and redirect chains | Safe client-side visual inspection of phishing landing pages |
| **WhoisXML / RDAP** | Domain registration age & registrar details | Flags domains created `< 30 days` ago as high-risk indicators |

---

## 5. Priority 4: DevSecOps, Testing & Quality Assurance

### 5.1 Automated CI/CD Pipeline
* **GitHub Actions Workflow (`.github/workflows/ci.yml`):**
  * Stage 1: Static analysis using `oxlint` and TypeScript strict compilation (`tsc --noEmit`).
  * Stage 2: Vitest unit and integration test suite execution with code coverage enforcement (>85% target).
  * Stage 3: Dependency vulnerability audit via `npm audit --audit-level=high` or Snyk.
  * Stage 4: Automated Vercel Preview deployment validation.

### 5.2 End-to-End (E2E) Browser Testing
* Integrate **Playwright** to execute automated regression flows against preview deployments:
  * User authentication & session refresh.
  * Submitting an IOC and validating enrichment card rendering.
  * Uploading a sample Nmap XML file and verifying parsed port counts.
  * Tagging an event with an ATT&CK technique and verifying counter increment.
  * Exporting an incident report.

---

## 6. Interview Presentation & Career Positioning

### 6.1 The 30-Second Elevator Pitch
> *"I built SentinelBoard to bridge the gap between offensive vulnerability discovery and defensive SOC operations. It's a deployed, real-time security analyst workbench built with React 19, TypeScript, and Supabase. It ingests telemetry via WebSockets, parses real Nuclei and Nmap scan outputs in the browser, automates multi-engine threat intelligence enrichment via isolated serverless Edge Functions, and maps findings to 700+ MITRE ATT&CK techniques with an incident triage lifecycle. It's designed to reflect how enterprise Tier-1 and Tier-2 analysts actually investigate and contain threats."*

### 6.2 High-Impact Resume Bullet Points

#### Option 1: Operational Engineering Focus
* *Architected and deployed a full-stack SOC analyst workbench (React 19, TypeScript, Supabase PostgreSQL) supporting real-time event streaming via WebSockets and automated IOC enrichment across VirusTotal, AbuseIPDB, and AlienVault OTX.*
* *Engineered client-side parsing engines for Nuclei vulnerability outputs and Nmap service scans, correlating discovered CVEs against MITRE ATT&CK techniques with zero server compute overhead.*

#### Option 2: Security & Threat Intelligence Focus
* *Implemented secure serverless threat-intelligence orchestration using Deno Edge Functions, enforcing strict rate-limiting, response caching, and Row-Level Security (RLS) policies across 11 PostgreSQL tables.*
* *Designed an incident case management system following NIST SP 800-61 workflows, generating structured forensic audit trails and exportable Markdown triage reports.*

### 6.3 Connecting SentinelBoard to the Google VRP Credential
When interviewers ask about your security background:
1. **The Discovery:** Mention identifying an authenticated privilege escalation / security vulnerability in Google enterprise systems, earning a P2/S2 severity rating and a \$500 bounty via the Google Vulnerability Reward Program.
2. **The Defensive Realization:** Explain that finding vulnerabilities is only half the battle—organizations need operational visibility, structured triage workflows, and actionable intelligence to remediate findings before adversaries exploit them.
3. **The Solution:** SentinelBoard was built directly from that operational insight—providing a unified workbench where incoming telemetry, scan results, and threat intelligence converge into actionable incident response.
