import { create } from 'zustand'
import { matchCondition, type Condition } from './conditions'
import type { Entry, EntryType, Mark } from './db'

export type Actuality = 'all' | 'actual' | 'inactual'

export type Filters = {
  actuality: Actuality
  typeIds: string[]
  projectIds: string[]
  // Границы периода включительно, в формате YYYY-MM-DD по местному времени
  from: string
  to: string
  text: string
  conditions: Condition[]
  // Как сочетаются условия по полям между собой; с остальными фильтрами — всегда «и»
  conditionMode: 'all' | 'any'
}

export const emptyFilters: Filters = {
  actuality: 'all',
  typeIds: [],
  projectIds: [],
  from: '',
  to: '',
  text: '',
  conditions: [],
  conditionMode: 'all',
}

type FilterState = {
  filters: Filters
  set: (patch: Partial<Filters>) => void
  reset: () => void
}

// Фильтры не сохраняются между запусками, чтобы не забыть, что лента отфильтрована
export const useFilters = create<FilterState>((set) => ({
  filters: emptyFilters,
  set: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  reset: () => set({ filters: emptyFilters }),
}))

export function isFiltered(f: Filters) {
  return (
    f.actuality !== 'all' ||
    f.typeIds.length > 0 ||
    f.projectIds.length > 0 ||
    f.from !== '' ||
    f.to !== '' ||
    f.text.trim() !== '' ||
    f.conditions.length > 0
  )
}

function dayStart(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function inPeriod(f: Filters, time: number) {
  if (f.from && time < dayStart(f.from)) return false
  if (f.to && time >= dayStart(f.to) + 24 * 60 * 60 * 1000) return false
  return true
}

export function matchEntry(f: Filters, entry: Entry, typesById: Map<string, EntryType>) {
  if (f.actuality === 'actual' && !entry.actual) return false
  if (f.actuality === 'inactual' && entry.actual) return false
  if (f.typeIds.length && !f.typeIds.includes(entry.typeId)) return false
  if (f.projectIds.length && !entry.projectIds.some((id) => f.projectIds.includes(id))) return false
  const text = f.text.trim().toLowerCase()
  if (text && !entry.text.toLowerCase().includes(text)) return false
  if (f.conditions.length) {
    const type = typesById.get(entry.typeId)
    const check = (c: Condition) => matchCondition(c, entry, type)
    if (f.conditionMode === 'all' ? !f.conditions.every(check) : !f.conditions.some(check)) return false
  }
  return inPeriod(f, entry.createdAt)
}

// У отметки нет типа, текста, полей и актуальности: при таких фильтрах отметки скрыты
export function matchMark(f: Filters, mark: Mark) {
  if (f.actuality !== 'all' || f.typeIds.length || f.text.trim() || f.conditions.length) return false
  if (f.projectIds.length && !f.projectIds.includes(mark.projectId)) return false
  return inPeriod(f, mark.createdAt)
}
