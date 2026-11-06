import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ScanFinding, Severity } from '@/types/database'

const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const colorBySeverity: Record<Severity, string> = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
}

export function SeverityChart({ findings }: { findings: ScanFinding[] }) {
  const severityCounts = Object.fromEntries(severities.map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])) as Record<Severity, number>
  const data: Array<{ label: string } & Record<Severity, number>> = [{
    label: 'Findings',
    ...severityCounts,
  }]

  return (
    <section className="border border-border-default bg-bg-secondary p-3" aria-label="Findings by severity">
      <h3 className="mb-2 text-xs font-semibold">Findings by severity</h3>
      {findings.length === 0 ? (
        <p className="py-2 text-xs text-text-tertiary">No findings to chart.</p>
      ) : (
        <div className="h-10 w-full">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
              <XAxis hide type="number" />
              <YAxis hide dataKey="label" type="category" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', fontSize: 12 }} />
              {severities.map((severity) => <Bar dataKey={severity} fill={colorBySeverity[severity]} key={severity} stackId="severity" />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {severities.map((severity) => (
          <span className="flex items-center gap-1 text-[10px] capitalize text-text-secondary" key={severity}>
            <span aria-hidden="true" className="size-2 rounded-sm" style={{ backgroundColor: colorBySeverity[severity] }} />{severity}: {data[0][severity]}
          </span>
        ))}
      </div>
    </section>
  )
}
