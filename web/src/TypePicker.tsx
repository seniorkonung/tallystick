import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type EntryType } from './db'

type Props = {
  types: EntryType[]
  currentId: string
  onSelect: (type: EntryType) => void
  onEdit: (type: EntryType) => void
  onCreate: () => void
  onClose: () => void
}

// Два уровня: избранные типы для быстрого выбора и все типы с поиском, где отмечают избранные.
// Без избранных сразу открываются все типы
export function TypePicker({ types, currentId, onSelect, onEdit, onCreate, onClose }: Props) {
  const favoriteIds = useLiveQuery(async () => {
    const setting = await db.settings.get('favoriteTypes')
    return setting?.id === 'favoriteTypes' ? setting.value : []
  })
  const [all, setAll] = useState(false)
  const [query, setQuery] = useState('')
  if (!favoriteIds) return null

  const favorites = types.filter((t) => favoriteIds.includes(t.id))
  const showAll = all || favorites.length === 0
  const q = query.trim().toLowerCase()
  const found = types.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.fields.some((f) => f.name.toLowerCase().includes(q)),
  )

  // Удалённые типы при этом выпадают из избранного
  function toggleFavorite(type: EntryType) {
    const ids = favorites.map((t) => t.id)
    void db.settings.put({ id: 'favoriteTypes', value: ids.includes(type.id) ? ids.filter((id) => id !== type.id) : [...ids, type.id] })
  }

  const typeButton = (type: EntryType) => (
    <button
      type="button"
      className={`flex min-w-0 flex-1 items-baseline gap-2 rounded-2xl px-3 py-3 text-left ${type.id === currentId ? 'bg-stone-100' : ''}`}
      onClick={() => onSelect(type)}
    >
      <span className="font-medium">{type.name}</span>
      {type.fields.length > 0 && <span className="truncate text-xs text-stone-400">{type.fields.map((f) => f.name).join(', ')}</span>}
    </button>
  )

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="flex max-h-[80dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 pt-4 pb-2">
          {showAll && favorites.length > 0 && (
            <button type="button" aria-label="К избранным типам" className="-ml-2 flex size-8 items-center justify-center rounded-full hover:bg-stone-100" onClick={() => setAll(false)}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          <h2 className="flex-1 font-semibold">{showAll ? 'Все типы' : 'Тип записи'}</h2>
          <button type="button" className="text-sm text-stone-500" onClick={onClose}>
            Закрыть
          </button>
        </div>

        {showAll ? (
          <>
            <div className="px-4 pb-2">
              <input
                value={query}
                placeholder="Поиск по типам и полям"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && found[0] && onSelect(found[0])}
                className="w-full rounded-2xl bg-stone-100 px-3 py-2 outline-none"
              />
            </div>
            <ul className="flex-1 overflow-y-auto px-2">
              {found.map((type) => {
                const favorite = favoriteIds.includes(type.id)
                return (
                  <li key={type.id} className="flex items-center">
                    <button
                      type="button"
                      aria-label={favorite ? 'Убрать из избранного' : 'В избранное'}
                      className={`flex size-10 shrink-0 items-center justify-center ${favorite ? 'text-orange-600' : 'text-stone-300'}`}
                      onClick={() => toggleFavorite(type)}
                    >
                      <svg viewBox="0 0 24 24" className="size-5" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />
                      </svg>
                    </button>
                    {typeButton(type)}
                    <button type="button" className="px-3 py-3 text-sm text-stone-500" onClick={() => onEdit(type)}>
                      Изменить
                    </button>
                  </li>
                )
              })}
              {found.length === 0 && <li className="px-3 py-4 text-sm text-stone-400">Ничего не найдено</li>}
            </ul>
            {favorites.length === 0 && !q && <p className="px-5 pt-2 text-xs text-stone-400">Отметьте звёздочкой типы, которые нужны чаще всего: они откроются здесь первыми.</p>}
            <div className="border-t border-stone-100 p-3">
              <button type="button" className="w-full rounded-2xl bg-stone-900 py-3 font-medium text-white" onClick={onCreate}>
                Новый тип
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-2">
              {favorites.map((type) => (
                <li key={type.id} className="flex">
                  {typeButton(type)}
                </li>
              ))}
            </ul>
            <div className="border-t border-stone-100 p-3">
              <button type="button" className="w-full rounded-2xl bg-stone-100 py-3 font-medium text-stone-800" onClick={() => setAll(true)}>
                Все типы
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
