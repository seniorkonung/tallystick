import { useLiveQuery } from 'dexie-react-hooks'
import { formatCondition } from './conditions'
import { db } from './db'
import { useFilters, type Filters } from './filterStore'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return dateFormat.format(new Date(y, m - 1, d))
}

export type FilterChip = { key: string; label: string; remove: Partial<Filters> }

// Чипы активных фильтров; текст поиска не показывается, пока открыта строка поиска
export function useFilterChips({ withText }: { withText: boolean }) {
  const filters = useFilters((s) => s.filters)
  const types = useLiveQuery(() => db.types.toArray())
  const projects = useLiveQuery(() => db.projects.toArray())

  const chips: { key: string; label: string; remove: Partial<Filters> }[] = []
  if (filters.actuality !== 'all') {
    chips.push({ key: 'actuality', label: filters.actuality === 'actual' ? 'Актуальные' : 'Неактуальные', remove: { actuality: 'all' } })
  }
  if (filters.hideReplies) {
    chips.push({ key: 'replies', label: 'Без ответов', remove: { hideReplies: false } })
  }
  if (filters.from || filters.to) {
    const label = filters.from && filters.to ? `${formatDate(filters.from)} — ${formatDate(filters.to)}` : filters.from ? `с ${formatDate(filters.from)}` : `по ${formatDate(filters.to)}`
    chips.push({ key: 'period', label, remove: { from: '', to: '' } })
  }
  for (const id of filters.typeIds) {
    chips.push({ key: `t${id}`, label: types?.find((t) => t.id === id)?.name ?? 'Тип', remove: { typeIds: filters.typeIds.filter((x) => x !== id) } })
  }
  for (const id of filters.projectIds) {
    chips.push({ key: `p${id}`, label: projects?.find((p) => p.id === id)?.name ?? 'Проект', remove: { projectIds: filters.projectIds.filter((x) => x !== id) } })
  }
  if (filters.conditions.length > 1 && filters.conditionMode === 'any') {
    chips.push({ key: 'mode', label: 'Любое из условий', remove: { conditionMode: 'all' } })
  }
  for (const c of filters.conditions) {
    chips.push({ key: `c${c.id}`, label: formatCondition(c), remove: { conditions: filters.conditions.filter((x) => x.id !== c.id) } })
  }
  if (filters.text.trim() && withText) {
    chips.push({ key: 'text', label: `Текст: ${filters.text.trim()}`, remove: { text: '' } })
  }
  return chips
}
