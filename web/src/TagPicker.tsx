import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { TagChip } from './TagChip'
import { createCategory, createTag, db, deleteCategory, type Tag } from './db'

// Вкладка: все активные, одна категория или архив
type Tab = { kind: 'all' } | { kind: 'category'; id: string } | { kind: 'archived' }

type Props = {
  selectedIds: string[]
  onToggle: (tag: Tag) => void
  onEdit: (tag: Tag) => void
  onClose: () => void
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })

export function TagPicker({ selectedIds, onToggle, onEdit, onClose }: Props) {
  const tags = useLiveQuery(() => db.tags.toArray())
  const categories = useLiveQuery(() => db.categories.orderBy('createdAt').toArray())
  const [tab, setTab] = useState<Tab>({ kind: 'all' })
  const [query, setQuery] = useState('')
  if (!tags || !categories) return null
  const q = query.trim().toLowerCase()
  const activeCategory = tab.kind === 'category' ? categories.find((c) => c.id === tab.id) : undefined
  // Поиск идёт по всем тегам, без поиска — по выбранной вкладке
  const shown = tags
    .filter((p) => {
      if (q) return p.name.toLowerCase().includes(q)
      if (tab.kind === 'archived') return p.status === 'archived'
      if (p.status !== 'active') return false
      return tab.kind === 'all' || p.categoryId === tab.id
    })
    .sort((a, b) =>
      a.status !== b.status
        ? a.status === 'active'
          ? -1
          : 1
        : a.status === 'archived'
          ? (b.archivedAt ?? 0) - (a.archivedAt ?? 0)
          : a.name.localeCompare(b.name, 'ru'),
    )
  const canCreate = q !== '' && !tags.some((p) => p.name.toLowerCase() === q)

  async function create() {
    const tag = await createTag(query.trim(), activeCategory?.id ?? null)
    setQuery('')
    onToggle(tag)
  }

  async function addCategory() {
    const name = window.prompt('Название категории')?.trim()
    if (!name) return
    const category = await createCategory(name)
    setTab({ kind: 'category', id: category.id })
  }

  async function renameCategory() {
    if (!activeCategory) return
    const name = window.prompt('Название категории', activeCategory.name)?.trim()
    if (name) await db.categories.update(activeCategory.id, { name })
  }

  async function removeCategory() {
    if (!activeCategory) return
    if (!window.confirm(`Удалить категорию «${activeCategory.name}»? Её теги останутся без категории.`)) return
    await deleteCategory(activeCategory.id)
    setTab({ kind: 'all' })
  }

  const tabClass = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-[85dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">Теги</h2>
          <button type="button" className="text-sm font-medium text-orange-700" onClick={onClose}>
            Готово
          </button>
        </div>
        <div className="px-4 pb-2">
          <input
            value={query}
            placeholder="Найти или создать тег"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (canCreate) void create()
              else if (shown[0]) onToggle(shown[0])
            }}
            className="w-full rounded-2xl bg-stone-100 px-3 py-2 outline-none"
          />
        </div>

        {!q && (
          <>
            <div className="flex gap-2 overflow-x-auto px-4 pb-2">
              <button type="button" className={tabClass(tab.kind === 'all')} onClick={() => setTab({ kind: 'all' })}>
                Все
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={tabClass(tab.kind === 'category' && tab.id === c.id)}
                  onClick={() => setTab({ kind: 'category', id: c.id })}
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                className={tabClass(tab.kind === 'archived')}
                onClick={() => setTab({ kind: 'archived' })}
              >
                Архив
              </button>
              <button type="button" aria-label="Новая категория" className={tabClass(false)} onClick={() => void addCategory()}>
                +
              </button>
            </div>
            {activeCategory && (
              <div className="flex gap-4 px-5 pb-2 text-xs">
                <button type="button" className="text-stone-500" onClick={() => void renameCategory()}>
                  Переименовать категорию
                </button>
                <button type="button" className="text-red-600" onClick={() => void removeCategory()}>
                  Удалить
                </button>
              </div>
            )}
          </>
        )}

        <ul className="flex-1 overflow-y-auto px-2">
          {canCreate && (
            <li>
              <button type="button" className="w-full rounded-2xl px-3 py-3 text-left text-orange-700" onClick={() => void create()}>
                Создать «{query.trim()}»{activeCategory ? ` в «${activeCategory.name}»` : ''}
              </button>
            </li>
          )}
          {shown.map((tag) => {
            const selected = selectedIds.includes(tag.id)
            const categoryName =
              tag.status === 'archived'
                ? tag.frozenCategoryName
                : categories.find((c) => c.id === tag.categoryId)?.name
            return (
              <li key={tag.id} className="flex items-center">
                <button
                  type="button"
                  className={`flex flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${selected ? 'bg-stone-100' : ''}`}
                  onClick={() => onToggle(tag)}
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                      selected ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300'
                    }`}
                  >
                    {selected && '✓'}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <TagChip tag={tag} />
                    {(categoryName || tag.status === 'archived') && (
                      <span className="mt-0.5 truncate text-xs text-stone-400">
                        {tag.status === 'archived' && tag.archivedAt
                          ? `в архиве с ${dateFormat.format(tag.archivedAt)}`
                          : ''}
                        {tag.status === 'archived' && categoryName ? ' · ' : ''}
                        {categoryName}
                      </span>
                    )}
                  </span>
                </button>
                <button type="button" className="px-3 py-3 text-sm text-stone-500" onClick={() => onEdit(tag)}>
                  Изменить
                </button>
              </li>
            )
          })}
          {shown.length === 0 && !canCreate && (
            <li className="px-3 py-4 text-sm text-stone-400">
              {tab.kind === 'archived' ? 'В архиве тегов нет' : 'Тегов нет — введите название, чтобы создать'}
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
