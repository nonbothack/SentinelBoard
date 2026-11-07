import type { TimelineEntry } from '@/lib/incidents'

export type PlaybookId = 'ransomware' | 'account-compromise' | 'phishing' | 'web-exploitation'

export interface PlaybookStep {
  id: string
  function: 'Govern' | 'Identify' | 'Protect' | 'Detect' | 'Respond' | 'Recover'
  title: string
}

export interface IncidentPlaybook {
  id: PlaybookId
  title: string
  description: string
  steps: PlaybookStep[]
}

const commonSteps: PlaybookStep[] = [
  { id: 'coordination', function: 'Govern', title: 'Assign an incident lead and record reporting or escalation requirements.' },
  { id: 'scope', function: 'Identify', title: 'Establish affected users, systems, data, and the incident time range.' },
  { id: 'preserve', function: 'Protect', title: 'Preserve relevant logs and evidence before making changes.' },
  { id: 'detect', function: 'Detect', title: 'Validate indicators and document the evidence supporting the assessment.' },
  { id: 'contain', function: 'Respond', title: 'Choose and document containment actions; coordinate with system owners.' },
  { id: 'eradicate', function: 'Respond', title: 'Remove the cause and verify affected credentials, hosts, or services are addressed.' },
  { id: 'recover', function: 'Recover', title: 'Restore services safely and monitor for recurrence.' },
  { id: 'lessons', function: 'Recover', title: 'Record lessons learned and owners for follow-up improvements.' },
]

export const incidentPlaybooks: IncidentPlaybook[] = [
  {
    id: 'ransomware', title: 'Ransomware or malware', description: 'Contain suspected malware activity while preserving evidence and planning recovery.',
    steps: [
      ...commonSteps.slice(0, 4),
      { id: 'isolate', function: 'Respond', title: 'Coordinate isolation of affected hosts and prevent further spread.' },
      { id: 'scope-encryption', function: 'Respond', title: 'Identify affected files, shared services, backups, and possible data exposure.' },
      { id: 'eradicate-malware', function: 'Respond', title: 'Remove malware persistence and address the initial access path.' },
      { id: 'restore-backups', function: 'Recover', title: 'Validate clean recovery sources and restore services in a controlled order.' },
      commonSteps[7],
    ],
  },
  {
    id: 'account-compromise', title: 'Account compromise or brute force', description: 'Investigate suspicious authentication and reduce risk to affected identities.',
    steps: [
      ...commonSteps.slice(0, 4),
      { id: 'identity-containment', function: 'Respond', title: 'Coordinate credential reset, session revocation, and access restrictions.' },
      { id: 'identity-scope', function: 'Respond', title: 'Review sign-ins, MFA changes, privilege changes, and actions taken by the account.' },
      { id: 'identity-recovery', function: 'Recover', title: 'Restore access under verified ownership and monitor for renewed abuse.' },
      commonSteps[7],
    ],
  },
  {
    id: 'phishing', title: 'Phishing or credential theft', description: 'Assess the message, affected recipients, delivered payloads, and any account activity.',
    steps: [
      ...commonSteps.slice(0, 4),
      { id: 'message-containment', function: 'Respond', title: 'Coordinate removal or blocking of the message and related indicators.' },
      { id: 'recipient-scope', function: 'Respond', title: 'Identify recipients, clicks, submitted credentials, and downloaded files.' },
      { id: 'credential-response', function: 'Respond', title: 'Review exposed accounts and coordinate credential or session protections.' },
      { id: 'mail-recovery', function: 'Recover', title: 'Confirm mail controls and user reporting guidance are restored.' },
      commonSteps[7],
    ],
  },
  {
    id: 'web-exploitation', title: 'Web application exploitation', description: 'Determine affected services, exploit evidence, exposure, and safe restoration steps.',
    steps: [
      ...commonSteps.slice(0, 4),
      { id: 'service-containment', function: 'Respond', title: 'Coordinate mitigations with the service owner and record availability impacts.' },
      { id: 'web-scope', function: 'Respond', title: 'Review application, identity, network, and data-access logs for exploitation activity.' },
      { id: 'patch-verify', function: 'Respond', title: 'Address the vulnerable component and verify the exploit path is no longer available.' },
      { id: 'service-recovery', function: 'Recover', title: 'Restore normal service and monitor relevant indicators and error rates.' },
      commonSteps[7],
    ],
  },
]

export interface PlaybookProgress {
  playbook: IncidentPlaybook | null
  completed: Record<string, boolean>
}

function entryDetails(entry: TimelineEntry) {
  return entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details)
    ? entry.details as Record<string, unknown>
    : {}
}

export function derivePlaybookProgress(entries: TimelineEntry[]): PlaybookProgress {
  let selected: IncidentPlaybook | null = null
  let completed: Record<string, boolean> = {}
  for (const entry of entries) {
    const details = entryDetails(entry)
    if (entry.action === 'playbook_selected') {
      selected = incidentPlaybooks.find((playbook) => playbook.id === details.playbook_id) ?? null
      completed = {}
    } else if (entry.action === 'playbook_step_toggled' && selected && details.playbook_id === selected.id
      && typeof details.step_id === 'string' && selected.steps.some((step) => step.id === details.step_id)
      && typeof details.completed === 'boolean') {
      completed[details.step_id] = details.completed
    }
  }
  return { playbook: selected, completed }
}
