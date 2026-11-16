import { useState } from 'react'
import type { Instruction } from './db'

type Props = {
  instructions: Instruction[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreate: () => void
  onClose: () => void
}

// Выбор стартовой инструкции нового чата; поиск — по названию и тексту
export function InstructionPicker({ instructions, selectedId, onSelect, onCreate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = instructions.filter((i) => !q || i.name.toLowerCase().includes(q) || i.text.toLowerCase().includes(q))

  function choose(id: string | null) {
    onSelect(id)
    onClose()
  }

  const option = (selected: boolean) => `flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ${selected ? 'bg-stone-100' : ''}`

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-[85dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">Стартовая инструкция</h2>
          <button type="button" className="text-sm font-medium text-orange-700" onClick={onClose}>
            Готово
          </button>
        </div>
        <div className="px-4 pb-2">
          <input
            value={query}
            placeholder="Найти инструкцию"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl bg-stone-100 px-3 py-2 outline-none"
          />
        </div>
        <ul className="flex-1 overflow-y-auto px-2">
          {!q && (
            <li>
              <button type="button" className={option(selectedId === null)} onClick={() => choose(null)}>
                <span className="flex-1 text-stone-700">Без инструкции</span>
                {selectedId === null && <span className="text-orange-600">✓</span>}
              </button>
            </li>
          )}
          {shown.map((i) => (
            <li key={i.id}>
              <button type="button" className={option(selectedId === i.id)} onClick={() => choose(i.id)}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-stone-900">{i.name}</span>
                  <span className="truncate text-xs text-stone-500">{i.text}</span>
                </span>
                {selectedId === i.id && <span className="text-orange-600">✓</span>}
              </button>
            </li>
          ))}
          {q && shown.length === 0 && <li className="px-3 py-4 text-sm text-stone-400">Ничего не нашлось</li>}
        </ul>
        <div className="px-4 pt-2 pb-3">
          <button type="button" className="w-full rounded-2xl border border-dashed border-stone-300 py-2.5 text-sm text-stone-700" onClick={onCreate}>
            Новая инструкция
          </button>
        </div>
      </div>
    </div>
  )
}
