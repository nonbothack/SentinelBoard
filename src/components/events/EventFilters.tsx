import type { EventCategory, EventSource, Severity } from '@/types/database'

const severityOptions: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const categoryOptions: EventCategory[] = ['authentication', 'network', 'malware', 'policy', 'system', 'application']
const sourceOptions: EventSource[] = ['syslog', 'windows_event', 'firewall', 'ids', 'manual', 'sample_dataset', 'webhook']
const severityActiveClass: Record<Severity, string> = {
  critical: 'border-severity-critical bg-severity-critical/15 text-severity-critical',
  high: 'border-severity-high bg-severity-high/15 text-severity-high',
  medium: 'border-severity-medium bg-severity-medium/15 text-severity-medium',
  low: 'border-severity-low bg-severity-low/15 text-severity-low',
  info: 'border-severity-info bg-severity-info/15 text-severity-info',
}

interface EventFiltersProps {
  selectedSeverities: Severity[]
  onToggleSeverity: (severity: Severity) => void
  category: string
  source: string
  fromDate: string
  toDate: string
  onCategoryChange: (value: string) => void
  onSourceChange: (value: string) => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
}

const selectClass = 'h-8 rounded-md border border-border-default bg-bg-input px-2 text-xs text-text-secondary'

export function EventFilters(props: EventFiltersProps) {
  return (
    <section aria-label="Filter events" className="flex flex-wrap items-center gap-2 border-b border-border-panel bg-bg-surface px-3 py-2">
      <div className="flex flex-wrap gap-1" aria-label="Severity filters">
        {severityOptions.map((severity) => {
          const active = props.selectedSeverities.includes(severity)
          return (
            <button
              aria-pressed={active}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${active ? severityActiveClass[severity] : 'border-border-default text-text-tertiary hover:bg-bg-tertiary'}`}
              key={severity}
              onClick={() => props.onToggleSeverity(severity)}
              type="button"
            >
              {severity}
            </button>
          )
        })}
      </div>
      <label className="sr-only" htmlFor="event-category-filter">Category</label>
      <select className={selectClass} id="event-category-filter" onChange={(event) => props.onCategoryChange(event.target.value)} value={props.category}>
        <option value="">All categories</option>
        {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      <label className="sr-only" htmlFor="event-source-filter">Source</label>
      <select className={selectClass} id="event-source-filter" onChange={(event) => props.onSourceChange(event.target.value)} value={props.source}>
        <option value="">All sources</option>
        {sourceOptions.map((source) => <option key={source} value={source}>{source.replaceAll('_', ' ')}</option>)}
      </select>
      <label className="flex items-center gap-1 text-[10px] text-text-tertiary">
        From
        <input aria-label="Events from date" className={`${selectClass} w-32`} onChange={(event) => props.onFromDateChange(event.target.value)} type="date" value={props.fromDate} />
      </label>
      <label className="flex items-center gap-1 text-[10px] text-text-tertiary">
        To
        <input aria-label="Events through date" className={`${selectClass} w-32`} onChange={(event) => props.onToDateChange(event.target.value)} type="date" value={props.toDate} />
      </label>
    </section>
  )
}
