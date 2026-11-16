import { useLiveQuery } from 'dexie-react-hooks'
import { formatCondition } from './conditions'
import { db } from './db'
import { useFilters, type Filters } from './filterStore'
import { lastText } from './periods'
import { plainText } from './format'

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
  const tags = useLiveQuery(() => db.tags.toArray())
  const mentioned = useLiveQuery(() => (filters.mentionsOf ? db.entries.get(filters.mentionsOf) : undefined), [filters.mentionsOf])

  const chips: { key: string; label: string; remove: Partial<Filters> }[] = []
  if (filters.actuality !== 'all') {
    chips.push({ key: 'actuality', label: filters.actuality === 'actual' ? 'Актуальные' : 'Неактуальные', remove: { actuality: 'all' } })
  }
  if (filters.hideReplies) {
    chips.push({ key: 'replies', label: 'Без ответов', remove: { hideReplies: false } })
  }
  if (filters.mentionsOf) {
    const line = mentioned ? plainText(mentioned.text, { hideSpoilers: true }).split('\n').find((l) => l.trim())?.trim() : undefined
    const label = line ? `«${line.length > 30 ? `${line.slice(0, 30).trimEnd()}…` : line}»` : 'запись'
    chips.push({ key: 'mentions', label: `Ссылаются на ${label}`, remove: { mentionsOf: null } })
  }
  if (filters.fromChats) {
    chips.push({ key: 'chats', label: 'Из чатов', remove: { fromChats: false } })
  }
  if (filters.from || filters.to) {
    const label = filters.from && filters.to ? `${formatDate(filters.from)} — ${formatDate(filters.to)}` : filters.from ? `с ${formatDate(filters.from)}` : `по ${formatDate(filters.to)}`
    chips.push({ key: 'period', label, remove: { from: '', to: '' } })
  }
  if (filters.last) {
    chips.push({ key: 'period', label: lastText(filters.last), remove: { last: null } })
  }
  for (const id of filters.typeIds) {
    chips.push({ key: `t${id}`, label: types?.find((t) => t.id === id)?.name ?? 'Тип', remove: { typeIds: filters.typeIds.filter((x) => x !== id) } })
  }
  for (const id of filters.tagIds) {
    chips.push({ key: `p${id}`, label: tags?.find((p) => p.id === id)?.name ?? 'Тег', remove: { tagIds: filters.tagIds.filter((x) => x !== id) } })
  }
  if (filters.untagged) {
    chips.push({ key: 'untagged', label: 'Без тегов', remove: { untagged: false } })
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
