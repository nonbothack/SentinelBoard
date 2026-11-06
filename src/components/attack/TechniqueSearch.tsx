import { useState } from 'react'
import { Search } from 'lucide-react'
import { searchTechniques } from '@/lib/attack'
import type { BundledAttackTechnique } from '@/lib/attack'

interface TechniqueSearchProps {
  onSelect: (technique: BundledAttackTechnique) => void
  disabled?: boolean
}

export function TechniqueSearch({ onSelect, disabled = false }: TechniqueSearchProps) {
  const [query, setQuery] = useState('')
  const suggestions = searchTechniques(query, 20)

  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2 top-2.5 size-3.5 text-text-tertiary" />
        <input
          aria-label="Search ATT&CK techniques by ID or name"
          autoComplete="off"
          className="h-8 w-full rounded-md border border-border-default bg-bg-input pl-8 pr-2 font-mono text-xs outline-none focus:border-border-focus"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search technique ID or name..."
          role="combobox"
          aria-expanded="true"
        />
      </label>
      <ul aria-label="ATT&CK technique results" className="max-h-64 overflow-y-auto rounded-md border border-border-default bg-bg-primary" role="listbox">
        {suggestions.map((technique) => (
          <li key={technique.id} role="option" aria-selected="false">
            <button className="flex w-full items-start gap-2 border-b border-border-subtle px-2 py-2 text-left hover:bg-bg-tertiary" onClick={() => onSelect(technique)} type="button">
              <span className="shrink-0 font-mono text-[10px] text-accent-primary">{technique.id}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs text-text-primary">{technique.name}</span>
                <span className="block text-[10px] text-text-tertiary">{technique.tactic.replaceAll('-', ' ')}</span>
              </span>
            </button>
          </li>
        ))}
        {suggestions.length === 0 && <li className="p-3 text-xs text-text-tertiary">No matching techniques.</li>}
      </ul>
    </div>
  )
}
