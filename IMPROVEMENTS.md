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
* **Status: Partial.** Settings now manages event-ingestion tokens; analyst notifications, custom threat-intelligence provider credentials, and theme/density preferences remain planned.
* **Current State:** `/settings` provides event-ingestion token creation, revocation, and endpoint guidance.
* **Improvement:**
  * Build out custom API Key Management: Allow analysts to bring their own threat intelligence keys (VirusTotal Enterprise, Shodan, Censys, GreyNoise) stored encrypted via Supabase Vault or user-scoped encrypted columns.
  * Webhook Configuration: Implemented as part of 2.2; the UI creates user-scoped bearer tokens.
  * Analyst Notification Preferences: Webhook dispatch to Slack, Microsoft Teams, or Discord on `critical` severity events.
  * Theme & Density Controls: Toggle between "Compact Tactical" (current Direction C default) and "Expanded Audit" table views.

### 2.2 Ingestion Webhook Endpoint (`ingest-event` Supabase Edge Function)
* **Status: Implemented in the application branch.** Supabase deployment remains required before production use.
* **Current State:** Events can enter via JSON import, the sample data loader, or the new per-user bearer-token endpoint.
* **Improvement:**
  * Deploy a Supabase Edge Function `ingest-event` accepting HTTP POST requests with a Bearer Token.
  * Standardize log normalization: Accept common formats (CEF, Syslog RFC 5424, Suricata EVE JSON, Wazuh alerts) and map them to the SentinelBoard `events` schema.
  * Enables direct integrations for sources that can emit the supported formats; vendor-specific formats require an adapter.

### 2.3 Automated Storage Lifecycle & Cascade Cleanups
* **Current State:** Deleting a `scan_uploads` record removes database rows via SQL foreign keys, but source files in the private `scan-files` storage bucket must be cleaned up manually.
* **Improvement:**
  * Implement a PostgreSQL database webhook or trigger on `scan_uploads` deletion that invokes a storage cleanup function via Supabase Storage API, ensuring zero orphaned files.

### 2.4 Resilient Realtime Connection Management
* **Status: Implemented for missed-event recovery.** The feed reconciles on subscription recovery and when an online tab regains focus or visibility.
* **Current State:** The frontend subscribes to Supabase Realtime on mount; network drops rely on standard client reconnection.
* **Improvement:**
  * Supabase Realtime manages socket reconnection and the existing feed indicator reports connection state.
  * Re-fetch the latest 500 events and dashboard data after successful subscriptions, browser focus, visibility restoration, and network recovery to recover missed events.

---

## 3. Priority 2: Recruiter "Wow-Factor" & Analytical Capabilities

These features directly demonstrate senior-level SOC operations, detection engineering, and threat intelligence workflows.

### 3.1 Live Threat Intelligence Auto-Feed (CISA KEV Integration)
* **Status: Implemented in the application branch.** Production catalog population requires applying the migration, deploying the sync function, and storing the two Vault values described in the README.
* **Concept:** Connect SentinelBoard to live, authoritative government threat feeds.
* **Implementation:**
  * Scheduled Edge Function (Cron) pulling the daily [CISA Known Exploited Vulnerabilities (KEV) Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog).
  * Match uploaded scan findings against CISA KEV CVE IDs and display a prominent known-exploited warning with remediation details.
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

### 3.4 Structured Incident Response Playbooks (NIST SP 800-61 Rev. 3)
* **Status: Implemented in the application branch.** Checklist activity is stored in the existing incident timeline and requires no additional table.
* **Concept:** Transform the Incident Tracker from a simple Kanban into an operational IR playbook runner.
* **Implementation:**
  * When an incident is created, allow selecting a Playbook Template:
    * *Ransomware / Outpost C2 Communication*
    * *Unauthorized SSH / RDP Brute Force*
    * *Phishing / Credential Harvesting*
    * *Web Application Exploitation (SQLi / SSRF)*
  * Templates cover ransomware/malware, account compromise, phishing, and web exploitation.
  * Checklist entries map to the Govern, Identify, Protect, Detect, Respond, and Recover functions in the current NIST incident response guidance. They are analyst prompts; no mitigation is automated.
* **Resume Impact:** Demonstrates structured incident coordination and documented response guidance.

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
* **Status: Implemented in the application branch.** GitHub Actions verifies pull requests and pushes to `main`; Vercel deployments remain managed by the repository integration.
* **GitHub Actions Workflow (`.github/workflows/ci.yml`):**
  * Run `oxlint`, Vitest, strict TypeScript/Vite production build, Playwright end-to-end flows, and a production dependency audit that fails on high-severity findings.

### 5.2 End-to-End (E2E) Browser Testing
* **Status: Implemented in the application branch.** Playwright runs against local Vite with mocked Supabase responses, so CI does not require production credentials.
* Integrate **Playwright** to execute automated regression flows:
  * User authentication & session refresh.
  * Submitting an IOC and validating enrichment card rendering.
  * Uploading Nuclei scan JSON and verifying CISA KEV match rendering.
  * Tagging an event with an ATT&CK technique and verifying the tag appears on the event.
  * Exporting an incident report.
  * Re-fetching the event feed after a browser focus recovery.

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
