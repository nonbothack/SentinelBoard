const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })

export function formatRelativeTime(value: string) {
  const difference = new Date(value).getTime() - Date.now()
  if (!Number.isFinite(difference)) return 'Unknown time'

  let seconds = Math.round(difference / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.345],
    ['month', 12],
  ]

  for (const [unit, threshold] of units) {
    if (Math.abs(seconds) < threshold) return formatter.format(seconds, unit)
    seconds = Math.round(seconds / threshold)
  }

  return formatter.format(seconds, 'year')
}
