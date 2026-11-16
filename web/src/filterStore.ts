import { create } from 'zustand'
import { matchCondition, type Condition } from './conditions'
import type { Entry, EntryType, Mark } from './db'
import { plainText } from './format'

export type Actuality = 'all' | 'actual' | 'inactual'

export type Filters = {
  actuality: Actuality
  typeIds: string[]
  tagIds: string[]
  // Записи без тегов — ещё один вариант среди тегов: запись подходит, если у неё любой из выбранных тегов или нет тегов
  untagged: boolean
  // Границы периода включительно, в формате YYYY-MM-DD по местному времени
  from: string
  to: string
  text: string
  // В ленте остаются только записи, которые сами не ответы; ответы открываются по их счётчикам
  hideReplies: boolean
  conditions: Condition[]
  // Как сочетаются условия по полям между собой; с остальными фильтрами — всегда «и»
  conditionMode: 'all' | 'any'
}

export const emptyFilters: Filters = {
  actuality: 'all',
  typeIds: [],
  tagIds: [],
  untagged: false,
  from: '',
  to: '',
  text: '',
  hideReplies: false,
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

// Пресет из старой версии может не знать о новых фильтрах — они берутся по умолчанию, а неизвестные поля отбрасываются
export function normalizeFilters(f: Partial<Filters>): Filters {
  return Object.fromEntries(Object.entries(emptyFilters).map(([key, value]) => [key, f[key as keyof Filters] ?? value])) as Filters
}

export function sameFilters(a: Filters, b: Filters) {
  return JSON.stringify(normalizeFilters(a)) === JSON.stringify(normalizeFilters(b))
}

export function isFiltered(f: Filters) {
  return (
    f.actuality !== 'all' ||
    f.typeIds.length > 0 ||
    f.tagIds.length > 0 ||
    f.untagged ||
    f.from !== '' ||
    f.to !== '' ||
    f.text.trim() !== '' ||
    f.hideReplies ||
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
  if (f.hideReplies && entry.replyTo) return false
  if (f.typeIds.length && !f.typeIds.includes(entry.typeId)) return false
  if ((f.tagIds.length || f.untagged) && !(entry.tagIds.some((id) => f.tagIds.includes(id)) || (f.untagged && entry.tagIds.length === 0))) {
    return false
  }
  const text = f.text.trim().toLowerCase()
  // Поиск по тексту без маркеров форматирования
  if (text && !plainText(entry.text).toLowerCase().includes(text)) return false
  if (f.conditions.length) {
    const type = typesById.get(entry.typeId)
    const check = (c: Condition) => matchCondition(c, entry, type)
    if (f.conditionMode === 'all' ? !f.conditions.every(check) : !f.conditions.some(check)) return false
  }
  return inPeriod(f, entry.createdAt)
}

// Чат — не запись: при фильтрах по свойствам записей его вложения и ссылки скрыты, период действует по времени сообщения
export function matchChatItem(f: Filters, time: number) {
  if (f.actuality !== 'all' || f.typeIds.length || f.tagIds.length || f.untagged || f.text.trim() || f.conditions.length) return false
  return inPeriod(f, time)
}

// У отметки нет типа, текста, полей и актуальности: при таких фильтрах отметки скрыты
export function matchMark(f: Filters, mark: Mark) {
  if (f.actuality !== 'all' || f.typeIds.length || f.text.trim() || f.conditions.length) return false
  if ((f.tagIds.length || f.untagged) && !f.tagIds.includes(mark.tagId)) return false
  return inPeriod(f, mark.createdAt)
}
