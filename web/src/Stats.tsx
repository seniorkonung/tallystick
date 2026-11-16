import { useLiveQuery } from 'dexie-react-hooks'
import { create } from 'zustand'
import { db, type Entry, type EntryType } from './db'
import { emptyFilters, useFilters, type Filters } from './filterStore'
import { pluralRu } from './plural'
import { TagChip } from './TagChip'

type Unit = 'week' | 'month' | 'year'

const unitLabels: Record<Unit, string> = { week: 'Неделя', month: 'Месяц', year: 'Год' }

// Период и режим переживают закрытие страницы: из ленты по элементу статистики возвращаются к тому же периоду
const useStats = create<{ unit: Unit; offset: number; mode: 'tags' | 'types' }>(() => ({ unit: 'week', offset: 0, mode: 'tags' }))

// Календарный период со сдвигом от текущего; неделя начинается с понедельника
function periodOf(unit: Unit, offset: number) {
  const now = new Date()
  if (unit === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + offset * 7)
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) }
  }
  if (unit === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) }
  }
  const start = new Date(now.getFullYear() + offset, 0, 1)
  return { start, end: new Date(start.getFullYear() + 1, 0, 1) }
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const dayWithYearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long' })

function periodLabel(unit: Unit, start: Date, last: Date) {
  if (unit === 'year') return String(start.getFullYear())
  if (unit === 'month') {
    const month = monthFormat.format(start)
    return `${month[0].toUpperCase()}${month.slice(1)} ${start.getFullYear()}`
  }
  const format = last.getFullYear() === new Date().getFullYear() ? dayFormat : dayWithYearFormat
  return `${dayFormat.format(start)} – ${format.format(last)}`
}

function percent(count: number, total: number) {
  const value = (count / total) * 100
  return value < 1 ? '<1%' : `${Math.round(value)}%`
}

// Сколько записей каждого типа, от частых к редким
function countTypes(entries: Entry[], typesById: Map<string, EntryType>) {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e.typeId, (counts.get(e.typeId) ?? 0) + 1)
  return [...counts]
    .flatMap(([id, count]) => {
      const type = typesById.get(id)
      return type ? [{ type, count }] : []
    })
    .sort((a, b) => b.count - a.count || a.type.name.localeCompare(b.type.name))
}

// Записи по тегам и типам за неделю, месяц или год; элемент статистики открывает ленту с его фильтрами
export function Stats({ onClose }: { onClose: () => void }) {
  const { unit, offset, mode } = useStats()
  const { start, end } = periodOf(unit, offset)
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
  const entries = useLiveQuery(
    () => db.entries.where('createdAt').between(start.getTime(), end.getTime(), true, false).toArray(),
    [start.getTime(), end.getTime()],
  )
  const types = useLiveQuery(() => db.types.toArray())
  const tags = useLiveQuery(() => db.tags.toArray())
  const setFilters = useFilters((s) => s.set)
  if (!entries || !types || !tags) return null

  const typesById = new Map(types.map((t) => [t.id, t]))
  const total = entries.length

  const byTag = new Map<string, Entry[]>()
  for (const e of entries) {
    for (const id of e.tagIds) {
      const tagged = byTag.get(id)
      if (tagged) tagged.push(e)
      else byTag.set(id, [e])
    }
  }
  const tagRows = tags
    .flatMap((tag) => {
      const tagged = byTag.get(tag.id)
      return tagged ? [{ tag, count: tagged.length, types: countTypes(tagged, typesById) }] : []
    })
    .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name))
  const untagged = entries.filter((e) => e.tagIds.length === 0)
  const typeRows = countTypes(entries, typesById)

  // Остальные фильтры ленты сбрасываются: лента показывает ровно то, что посчитано
  function openFeed(patch: Partial<Filters>) {
    setFilters({ ...emptyFilters, from: isoDay(start), to: isoDay(last), ...patch })
    onClose()
  }

  const tabClass = (active: boolean) => `rounded-full px-3 py-1.5 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`
  const arrowClass = 'flex size-9 items-center justify-center rounded-full hover:bg-stone-100 disabled:opacity-30'

  const bar = (count: number) => (
    <div className="mt-1.5 h-1 rounded-full bg-stone-100">
      <div className="h-full rounded-full bg-orange-600" style={{ width: `${(count / total) * 100}%` }} />
    </div>
  )

  // Типы внутри тега или записей без тегов
  const typeLine = (type: EntryType, count: number, tags: Partial<Filters>) => (
    <button
      key={type.id}
      type="button"
      className="flex w-full items-baseline gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-stone-100"
      onClick={() => openFeed({ typeIds: [type.id], ...tags })}
    >
      <span className="min-w-0 flex-1 truncate text-stone-700">{type.name}</span>
      <span className="shrink-0 text-stone-500 tabular-nums">{count}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" aria-label="Закрыть статистику" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100" onClick={onClose}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="font-semibold">Статистика</h1>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {(Object.keys(unitLabels) as Unit[]).map((u) => (
          <button key={u} type="button" className={tabClass(unit === u)} onClick={() => useStats.setState({ unit: u, offset: 0 })}>
            {unitLabels[u]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-2 py-2">
        <button type="button" aria-label="Предыдущий период" className={arrowClass} onClick={() => useStats.setState({ offset: offset - 1 })}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button type="button" className="flex-1 text-center font-medium" onClick={() => offset !== 0 && useStats.setState({ offset: 0 })}>
          {periodLabel(unit, start, last)}
        </button>
        <button type="button" aria-label="Следующий период" className={arrowClass} disabled={offset === 0} onClick={() => useStats.setState({ offset: offset + 1 })}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" className="w-full rounded-2xl bg-white px-4 py-3 text-left shadow-sm" onClick={() => openFeed({})}>
          <span className="block text-3xl font-semibold tabular-nums">{total}</span>
          <span className="text-sm text-stone-500">{pluralRu(total, ['запись', 'записи', 'записей'])} за период</span>
        </button>

        {total > 0 && (
          <div className="mt-4 mb-2 flex gap-2">
            <button type="button" className={tabClass(mode === 'tags')} onClick={() => useStats.setState({ mode: 'tags' })}>
              По тегам
            </button>
            <button type="button" className={tabClass(mode === 'types')} onClick={() => useStats.setState({ mode: 'types' })}>
              По типам
            </button>
          </div>
        )}

        {total > 0 && mode === 'tags' && (
          <ul className="flex flex-col gap-2">
            {tagRows.map(({ tag, count, types }) => (
              <li key={tag.id} className="rounded-2xl bg-white px-2 py-2 shadow-sm">
                <button type="button" className="w-full rounded-xl px-2 py-1 text-left hover:bg-stone-100" onClick={() => openFeed({ tagIds: [tag.id] })}>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      <TagChip tag={tag} />
                      {tag.status === 'archived' && <span className="ml-2 text-xs text-stone-400">в архиве</span>}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{count}</span>
                    <span className="w-10 shrink-0 text-right text-sm text-stone-500 tabular-nums">{percent(count, total)}</span>
                  </span>
                  {bar(count)}
                </button>
                <div className="mt-1">{types.map(({ type, count }) => typeLine(type, count, { tagIds: [tag.id] }))}</div>
              </li>
            ))}
            {untagged.length > 0 && (
              <li className="rounded-2xl bg-white px-2 py-2 shadow-sm">
                <button type="button" className="w-full rounded-xl px-2 py-1 text-left hover:bg-stone-100" onClick={() => openFeed({ untagged: true })}>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-600">Без тегов</span>
                    <span className="shrink-0 font-medium tabular-nums">{untagged.length}</span>
                    <span className="w-10 shrink-0 text-right text-sm text-stone-500 tabular-nums">{percent(untagged.length, total)}</span>
                  </span>
                  {bar(untagged.length)}
                </button>
                <div className="mt-1">{countTypes(untagged, typesById).map(({ type, count }) => typeLine(type, count, { untagged: true }))}</div>
              </li>
            )}
          </ul>
        )}

        {total > 0 && mode === 'types' && (
          <ul className="flex flex-col gap-2">
            {typeRows.map(({ type, count }) => (
              <li key={type.id}>
                <button type="button" className="w-full rounded-2xl bg-white px-4 py-2.5 text-left shadow-sm" onClick={() => openFeed({ typeIds: [type.id] })}>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{type.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{count}</span>
                    <span className="w-10 shrink-0 text-right text-sm text-stone-500 tabular-nums">{percent(count, total)}</span>
                  </span>
                  {bar(count)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
