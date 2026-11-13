import { useState } from 'react'
import type { EntryType } from './db'

type Props = {
  types: EntryType[]
  currentId: string
  onSelect: (type: EntryType) => void
  onEdit: (type: EntryType) => void
  onCreate: () => void
  onClose: () => void
}

export function TypePicker({ types, currentId, onSelect, onEdit, onCreate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const found = types.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.fields.some((f) => f.name.toLowerCase().includes(q)),
  )

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex max-h-[80dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">Тип записи</h2>
          <button type="button" className="text-sm text-stone-500" onClick={onClose}>
            Закрыть
          </button>
        </div>
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
          {found.map((type) => (
            <li key={type.id} className="flex items-center">
              <button
                type="button"
                className={`flex flex-1 items-baseline gap-2 rounded-2xl px-3 py-3 text-left ${type.id === currentId ? 'bg-stone-100' : ''}`}
                onClick={() => onSelect(type)}
              >
                <span className="font-medium">{type.name}</span>
                {type.fields.length > 0 && (
                  <span className="truncate text-xs text-stone-400">{type.fields.map((f) => f.name).join(', ')}</span>
                )}
              </button>
              <button type="button" className="px-3 py-3 text-sm text-stone-500" onClick={() => onEdit(type)}>
                Изменить
              </button>
            </li>
          ))}
          {found.length === 0 && <li className="px-3 py-4 text-sm text-stone-400">Ничего не найдено</li>}
        </ul>
        <div className="border-t border-stone-100 p-3">
          <button type="button" className="w-full rounded-2xl bg-stone-900 py-3 font-medium text-white" onClick={onCreate}>
            Новый тип
          </button>
        </div>
      </div>
    </div>
  )
}
