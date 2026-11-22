import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { archiveTag, db, deleteTag, restoreTag, type Tag } from './db'
import { emptyFilters, useFilters } from './filterStore'
import { pluralRu } from './plural'
import { useTagTabs } from './tagTabs'
import { SwipePage } from './SwipePage'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

type Props = {
  tagId: string
  onClose: () => void
  // Закрывает всё поверх ленты, чтобы показать записи тега
  onShowEntries: () => void
}

export function TagEditor({ tagId, onClose, onShowEntries }: Props) {
  const tag = useLiveQuery(() => db.tags.get(tagId), [tagId])
  const tabs = useTagTabs()
  const count = useLiveQuery(() => db.entries.where('tagIds').equals(tagId).count(), [tagId])
  if (!tag || !tabs || count === undefined) return null
  // Категории в порядке вкладок выбора тегов
  const categories = tabs.flatMap((t) => (t.kind === 'category' ? [t.category] : []))
  return (
    <Form key={tag.id} tag={tag} categories={categories} count={count} onClose={onClose} onShowEntries={onShowEntries} />
  )
}

type FormProps = {
  tag: Tag
  categories: { id: string; name: string }[]
  count: number
  onClose: () => void
  onShowEntries: () => void
}

function Form({ tag, categories, count, onClose, onShowEntries }: FormProps) {
  const setFilters = useFilters((s) => s.set)
  const [name, setName] = useState(tag.name)
  const [categoryId, setCategoryId] = useState(tag.categoryId ?? '')
  const active = tag.status === 'active'

  async function remove() {
    const note = count ? ` Он пропадёт с ${count} ${pluralRu(count, ['записи', 'записей', 'записей'])}, сами записи останутся.` : ''
    if (!window.confirm(`Удалить тег «${tag.name}» безвозвратно?${note} Для тега, который больше не используется, есть архив.`)) return
    await deleteTag(tag.id)
    onClose()
  }

  async function save() {
    await db.tags.update(tag.id, {
      name: name.trim(),
      ...(active ? { categoryId: categoryId || null } : {}),
    })
    onClose()
  }

  return (
    <SwipePage onClose={onClose} className="z-20">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" className="text-stone-500" onClick={onClose}>
          Отмена
        </button>
        <h1 className="font-semibold">Тег</h1>
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
            {tag.frozenCategoryName ? `Была «${tag.frozenCategoryName}»` : 'Без категории'}
          </p>
        )}

        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-stone-700'}`}>
              {active || !tag.archivedAt ? 'Активный' : `В архиве с ${dateFormat.format(tag.archivedAt)}`}
            </span>
            <span className="text-stone-500">
              {count} {pluralRu(count, ['запись', 'записи', 'записей'])}
            </span>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 font-medium text-white"
            onClick={() => void (active ? archiveTag(tag) : restoreTag(tag))}
          >
            {active ? 'Убрать в архив' : 'Вернуть из архива'}
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-stone-100 py-2.5 font-medium text-stone-900"
            onClick={() => {
              setFilters({ ...emptyFilters, tagIds: [tag.id] })
              onShowEntries()
            }}
          >
            Показать записи в ленте
          </button>
        </div>

        <button type="button" className="mt-4 w-full rounded-2xl bg-red-50 py-2.5 font-medium text-red-700" onClick={() => void remove()}>
          Удалить тег
        </button>
      </div>
    </SwipePage>
  )
}
