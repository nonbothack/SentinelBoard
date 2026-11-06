import type { CSSProperties, ReactNode } from 'react'

interface SplitPaneProps {
  leftWidth?: number | string
  leftContent: ReactNode
  rightContent?: ReactNode
  rightEmptyState?: ReactNode
}

export function SplitPane({
  leftWidth = 350,
  leftContent,
  rightContent,
  rightEmptyState,
}: SplitPaneProps) {
  const width = typeof leftWidth === 'number' ? `${leftWidth}px` : leftWidth
  const style: CSSProperties = { gridTemplateColumns: `${width} minmax(0, 1fr)` }

  return (
    <div className="grid min-h-0 flex-1 overflow-hidden border-t border-border-panel" style={style}>
      <aside className="min-h-0 overflow-y-auto border-r border-border-panel" aria-label="List panel">
        {leftContent}
      </aside>
      <section className="min-h-0 overflow-y-auto" aria-label="Detail panel">
        {rightContent ?? rightEmptyState ?? (
          <div className="flex h-full min-h-64 items-center justify-center p-6 text-center text-sm text-text-tertiary">
            Select an item to view details
          </div>
        )}
      </section>
    </div>
  )
}
