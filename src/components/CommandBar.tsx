import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Search } from 'lucide-react'

interface CommandBarProps {
  placeholder?: string
  value?: string
  onValueChange?: (value: string) => void
  onSubmit?: (value: string) => void
  leadingSlot?: ReactNode
  trailingSlot?: ReactNode
  showSearchIcon?: boolean
  disabled?: boolean
  ariaLabel?: string
}

export function CommandBar({
  placeholder = 'Search SentinelBoard...',
  value,
  onValueChange,
  onSubmit,
  leadingSlot,
  trailingSlot,
  showSearchIcon = true,
  disabled = false,
  ariaLabel = placeholder,
}: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internalValue, setInternalValue] = useState('')
  const currentValue = value ?? internalValue

  useEffect(() => {
    function focusCommandBar(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }

    window.addEventListener('keydown', focusCommandBar)
    return () => window.removeEventListener('keydown', focusCommandBar)
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.(currentValue.trim())
  }

  function handleChange(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue)
    onValueChange?.(nextValue)
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-11 items-center gap-3 border-b border-border-panel bg-[var(--command-bar-bg)] px-4 py-2">
      {leadingSlot}
      {showSearchIcon && <Search aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />}
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        value={currentValue}
      />
      <kbd className="hidden rounded border border-border-default px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary sm:inline">
        Ctrl K
      </kbd>
      {trailingSlot}
      {onSubmit && <button type="submit" className="sr-only">Submit search</button>}
    </form>
  )
}
