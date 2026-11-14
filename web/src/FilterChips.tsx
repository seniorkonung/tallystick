import { useFilters } from './filterStore'
import type { FilterChip } from './useFilterChips'

export function FilterChips({ chips }: { chips: FilterChip[] }) {
  const { set, reset } = useFilters()
  if (chips.length === 0) return null
  return (
    <div className="pointer-events-auto flex gap-1.5 overflow-x-auto">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs text-white"
          onClick={() => set(chip.remove)}
        >
          {chip.label}
          <span className="text-stone-400">✕</span>
        </button>
      ))}
      <button type="button" className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs text-stone-600 shadow-sm" onClick={reset}>
        Сбросить
      </button>
    </div>
  )
}
