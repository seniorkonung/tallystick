import { useState } from 'react'
import { saveTagTabs, tabKey, type TagTab } from './tagTabs'

const fixedNames = { all: 'Все', archived: 'Архив' }

// Все вкладки выбора тегов в одной нижней панели; изменения применяются кнопкой «Сохранить»
export function TagTabsSheet({ tabs, onClose }: { tabs: TagTab[]; onClose: () => void }) {
  const [draft, setDraft] = useState(tabs)
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  // Новая категория получает фокус, чтобы сразу ввести название
  const [newId, setNewId] = useState<string | null>(null)
  const canSave = draft.every((t) => t.kind !== 'category' || t.category.name.trim())

  function move(index: number, delta: number) {
    const next = [...draft]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    setDraft(next)
  }

  function rename(id: string, name: string) {
    setDraft(draft.map((t) => (t.kind === 'category' && t.category.id === id ? { kind: 'category', category: { ...t.category, name } } : t)))
  }

  function remove(id: string) {
    setDraft(draft.filter((t) => tabKey(t) !== id))
    // Новую, ещё не сохранённую категорию удалять из базы не нужно
    if (tabs.some((t) => tabKey(t) === id)) setDeletedIds([...deletedIds, id])
  }

  function add() {
    const category = { id: crypto.randomUUID(), name: '', createdAt: Date.now() }
    setDraft([...draft, { kind: 'category', category }])
    setNewId(category.id)
  }

  async function save() {
    await saveTagTabs(draft, deletedIds)
    onClose()
  }

  const actionClass = 'rounded-lg px-2 py-1.5 text-sm text-stone-600 disabled:opacity-30'

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] flex-col rounded-t-3xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <button type="button" className="text-sm text-stone-500" onClick={onClose}>
            Отмена
          </button>
          <h2 className="font-semibold">Вкладки</h2>
          <button type="button" className="text-sm font-medium text-orange-700 disabled:text-stone-300" disabled={!canSave} onClick={() => void save()}>
            Сохранить
          </button>
        </div>

        <ul className="flex flex-col gap-1 overflow-y-auto px-3">
          {draft.map((tab, index) => (
            <li key={tabKey(tab)} className="flex items-center gap-1 rounded-2xl bg-stone-50 py-1 pr-1 pl-3">
              {tab.kind === 'category' ? (
                <input
                  value={tab.category.name}
                  placeholder="Название категории"
                  autoFocus={tab.category.id === newId}
                  onChange={(e) => rename(tab.category.id, e.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-1.5 outline-none"
                />
              ) : (
                <span className="flex-1 py-1.5 text-stone-500">{fixedNames[tab.kind]}</span>
              )}
              <button type="button" aria-label="Выше" className={actionClass} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" aria-label="Ниже" className={actionClass} disabled={index === draft.length - 1} onClick={() => move(index, 1)}>
                ↓
              </button>
              {tab.kind === 'category' ? (
                <button type="button" aria-label="Удалить категорию" className="rounded-lg px-2 py-1.5 text-sm text-red-600" onClick={() => remove(tab.category.id)}>
                  ✕
                </button>
              ) : (
                // Место кнопки удаления, чтобы стрелки стояли ровным столбцом
                <span className="w-7" />
              )}
            </li>
          ))}
        </ul>

        {deletedIds.length > 0 && <p className="px-6 pt-2 text-xs text-stone-400">Теги удалённых категорий останутся без категории</p>}

        <div className="px-3 pt-2">
          <button type="button" className="w-full rounded-2xl border border-dashed border-stone-300 py-2.5 text-sm text-stone-700" onClick={add}>
            Новая категория
          </button>
        </div>
      </div>
    </div>
  )
}
