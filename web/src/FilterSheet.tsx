import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ProjectChip } from './ProjectChip'
import { db } from './db'
import { emptyFilters, matchEntry, useFilters, type Actuality, type Filters } from './filterStore'
import { pluralRu } from './plural'

const actualityLabels: Record<Actuality, string> = { all: 'Все', actual: 'Актуальные', inactual: 'Неактуальные' }

// Черновик фильтров применяется кнопкой «Показать»; счётчик считает его вживую
export function FilterSheet({ onClose }: { onClose: () => void }) {
  const applied = useFilters((s) => s.filters)
  const apply = useFilters((s) => s.set)
  const [draft, setDraft] = useState<Filters>(applied)
  const [projectQuery, setProjectQuery] = useState('')
  const entries = useLiveQuery(() => db.entries.toArray())
  const types = useLiveQuery(() => db.types.toArray())
  const projects = useLiveQuery(() => db.projects.toArray())
  if (!entries || !types || !projects) return null

  const count = entries.filter((e) => matchEntry(draft, e)).length
  const q = projectQuery.trim().toLowerCase()
  // Завершённых проектов может быть много: они видны только через поиск или если уже выбраны
  const shownProjects = projects
    .filter((p) => (q ? p.name.toLowerCase().includes(q) : p.status === 'active' || draft.projectIds.includes(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">Фильтры</h2>
          <button type="button" className="text-sm text-stone-500" onClick={() => setDraft({ ...emptyFilters, text: draft.text })}>
            Сбросить
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <h3 className="mt-2 mb-2 text-xs text-stone-500">Актуальность</h3>
          <div className="flex gap-2">
            {(Object.keys(actualityLabels) as Actuality[]).map((a) => (
              <button key={a} type="button" className={chipClass(draft.actuality === a)} onClick={() => setDraft({ ...draft, actuality: a })}>
                {actualityLabels[a]}
              </button>
            ))}
          </div>

          <h3 className="mt-5 mb-2 text-xs text-stone-500">Период</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm"
            />
            <span className="text-stone-400">—</span>
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm"
            />
          </div>

          <h3 className="mt-5 mb-2 text-xs text-stone-500">Типы</h3>
          <div className="flex flex-wrap gap-2">
            {[...types]
              .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={chipClass(draft.typeIds.includes(t.id))}
                  onClick={() => setDraft({ ...draft, typeIds: toggle(draft.typeIds, t.id) })}
                >
                  {t.name}
                </button>
              ))}
          </div>

          <h3 className="mt-5 mb-2 text-xs text-stone-500">Проекты</h3>
          <input
            value={projectQuery}
            placeholder="Найти проект, в том числе завершённый"
            onChange={(e) => setProjectQuery(e.target.value)}
            className="mb-2 w-full rounded-xl bg-stone-100 px-3 py-2 text-sm outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {shownProjects.map((p) => {
              const active = draft.projectIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`rounded-full ${active ? 'ring-2 ring-stone-900 ring-offset-1' : 'opacity-70'}`}
                  onClick={() => setDraft({ ...draft, projectIds: toggle(draft.projectIds, p.id) })}
                >
                  <ProjectChip project={p} />
                </button>
              )
            })}
            {shownProjects.length === 0 && <p className="text-sm text-stone-400">Проектов нет</p>}
          </div>
        </div>

        <div className="border-t border-stone-100 p-3">
          <button
            type="button"
            className="w-full rounded-2xl bg-stone-900 py-3 font-medium text-white"
            onClick={() => {
              apply(draft)
              onClose()
            }}
          >
            Показать {count} {pluralRu(count, ['запись', 'записи', 'записей'])}
          </button>
        </div>
      </div>
    </div>
  )
}
