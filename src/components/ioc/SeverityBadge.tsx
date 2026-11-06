import type { Severity } from '@/types/database'

const severityClass: Record<Severity, string> = {
  critical: 'bg-severity-critical text-white',
  high: 'bg-severity-high text-white',
  medium: 'bg-severity-medium text-black',
  low: 'bg-severity-low text-white',
  info: 'bg-severity-info text-white',
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold uppercase ${severityClass[severity]}`}>
      {severity}
    </span>
  )
}
