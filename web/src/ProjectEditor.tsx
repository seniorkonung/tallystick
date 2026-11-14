import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { completeProject, db, reopenProject, type Project } from './db'
import { emptyFilters, useFilters } from './filterStore'
import { pluralRu } from './plural'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

type Props = {
  projectId: string
  onClose: () => void
  // Закрывает всё поверх ленты, чтобы показать записи проекта
  onShowEntries: () => void
}

export function ProjectEditor({ projectId, onClose, onShowEntries }: Props) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const categories = useLiveQuery(() => db.categories.orderBy('createdAt').toArray())
  const count = useLiveQuery(() => db.entries.where('projectIds').equals(projectId).count(), [projectId])
  if (!project || !categories || count === undefined) return null
  return (
    <Form key={project.id} project={project} categories={categories} count={count} onClose={onClose} onShowEntries={onShowEntries} />
  )
}

type FormProps = {
  project: Project
  categories: { id: string; name: string }[]
  count: number
  onClose: () => void
  onShowEntries: () => void
}

function Form({ project, categories, count, onClose, onShowEntries }: FormProps) {
  const setFilters = useFilters((s) => s.set)
  const [name, setName] = useState(project.name)
  const [categoryId, setCategoryId] = useState(project.categoryId ?? '')
  const active = project.status === 'active'

  async function save() {
    await db.projects.update(project.id, {
      name: name.trim(),
      ...(active ? { categoryId: categoryId || null } : {}),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" className="text-stone-500" onClick={onClose}>
          Отмена
        </button>
        <h1 className="font-semibold">Проект</h1>
        <button
          type="button"
          className="font-medium text-orange-700 disabled:text-stone-300"
          disabled={!name.trim()}
          onClick={() => void save()}
        >
          Сохранить
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <label className="mb-1 block text-xs text-stone-500">Название</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-5 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 outline-none"
        />

        <label className="mb-1 block text-xs text-stone-500">Категория</label>
        {active ? (
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mb-5 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2"
          >
            <option value="">Без категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mb-5 px-1 text-stone-700">
            {project.frozenCategoryName ? `Была «${project.frozenCategoryName}»` : 'Без категории'}
          </p>
        )}

        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-700'}`}>
              {active ? 'Активный' : 'Завершён'}
            </span>
            <span className="text-stone-500">
              {count} {pluralRu(count, ['запись', 'записи', 'записей'])}
            </span>
          </div>
          <p className="text-stone-600">
            Начат {dateFormat.format(project.startedAt)}
            {project.completedAt && `, завершён ${dateFormat.format(project.completedAt)}`}
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 font-medium text-white"
            onClick={() => void (active ? completeProject(project) : reopenProject(project))}
          >
            {active ? 'Завершить проект' : 'Вернуть в работу'}
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-stone-100 py-2.5 font-medium text-stone-900"
            onClick={() => {
              setFilters({ ...emptyFilters, projectIds: [project.id] })
              onShowEntries()
            }}
          >
            Показать записи в ленте
          </button>
        </div>
      </div>
    </div>
  )
}
