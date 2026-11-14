import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { FilterSheet } from './FilterSheet'
import { formatCondition } from './conditions'
import { db } from './db'
import { isFiltered, useFilters, type Filters } from './filterStore'
import { useThread } from './threadStore'
import { useMeasuredHeight } from './useMeasuredHeight'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return dateFormat.format(new Date(y, m - 1, d))
}

// Плавающая панель над лентой: поиск, фильтры и чипы активных фильтров
export function TopBar() {
  const { filters, set, reset } = useFilters()
  const [searching, setSearching] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const types = useLiveQuery(() => db.types.toArray())
  const projects = useLiveQuery(() => db.projects.toArray())
  // Лента получает верхний отступ по высоте панели
  const measure = useMeasuredHeight('--topbar-height')
  const inThread = useThread((s) => s.stack.length > 0)
  const back = useThread((s) => s.back)

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
  if (filters.text.trim() && !searching) {
    chips.push({ key: 'text', label: `Текст: ${filters.text.trim()}`, remove: { text: '' } })
  }

  const iconButton = 'pointer-events-auto flex size-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm'

  // На экране ответов фильтры не действуют — вместо них «назад»
  if (inThread) {
    return (
      <div
        ref={measure}
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
      >
        <button type="button" aria-label="Назад" className={iconButton} onClick={back}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium shadow-sm">Ответы</span>
      </div>
    )
  }

  return (
    <>
      <div
        ref={measure}
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
      >
        <div className="flex items-center justify-end gap-2">
          {searching ? (
            <div className="pointer-events-auto flex flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pr-1 pl-4 shadow-sm">
              <input
                autoFocus
                value={filters.text}
                placeholder="Текст содержит…"
                onChange={(e) => set({ text: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && setSearching(false)}
                className="min-w-0 flex-1 py-1.5 outline-none"
              />
              <button
                type="button"
                aria-label="Закрыть поиск"
                className="flex size-8 items-center justify-center rounded-full text-stone-400"
                onClick={() => setSearching(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <button type="button" aria-label="Поиск" className={iconButton} onClick={() => setSearching(true)}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          )}
          <button type="button" aria-label="Фильтры" className={`${iconButton} relative`} onClick={() => setSheetOpen(true)}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {isFiltered(filters) && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-orange-600" />}
          </button>
        </div>

        {chips.length > 0 && (
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
        )}
      </div>

      {sheetOpen && <FilterSheet onClose={() => setSheetOpen(false)} />}
    </>
  )
}
