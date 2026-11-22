import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteCategory, type Category } from './db'

// Вкладка выбора тегов: все активные, одна категория или архив
export type TagTab = { kind: 'all' } | { kind: 'archived' } | { kind: 'category'; category: Category }

export function tabKey(tab: TagTab) {
  return tab.kind === 'category' ? tab.category.id : tab.kind
}

// Вкладки в порядке пользователя. Без сохранённого порядка — «Все», категории по времени создания, «Архив»
export async function loadTagTabs() {
  const [categories, order] = await Promise.all([db.categories.orderBy('createdAt').toArray(), db.settings.get('tagTabOrder')])
  const keys = order?.id === 'tagTabOrder' ? order.value : []
  const tabs: TagTab[] = [{ kind: 'all' }, ...categories.map((category) => ({ kind: 'category' as const, category })), { kind: 'archived' }]
  // Вкладки, которых нет в порядке, идут в конце
  const position = (tab: TagTab) => {
    const i = keys.indexOf(tabKey(tab))
    return i === -1 ? keys.length : i
  }
  return tabs.sort((a, b) => position(a) - position(b))
}

export function useTagTabs() {
  return useLiveQuery(loadTagTabs)
}

// Сохраняет все вкладки разом: порядок, названия и новые категории; теги удалённых категорий остаются без категории
export async function saveTagTabs(tabs: TagTab[], deletedIds: string[]) {
  await db.transaction('rw', db.tags, db.categories, db.settings, async () => {
    for (const id of deletedIds) await deleteCategory(id)
    await db.categories.bulkPut(tabs.flatMap((t) => (t.kind === 'category' ? [{ ...t.category, name: t.category.name.trim() }] : [])))
    await db.settings.put({ id: 'tagTabOrder', value: tabs.map(tabKey) })
  })
}
