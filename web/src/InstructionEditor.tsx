import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Instruction } from './db'
import { SwipePage } from './SwipePage'

// Что правится: общая инструкция или стартовая; null — новая стартовая
export type InstructionTarget = { kind: 'general' } | { kind: 'start'; instruction: Instruction | null }

type Props = { target: InstructionTarget; onSaved?: (instruction: Instruction) => void; onClose: () => void }

export function InstructionEditor({ target, onSaved, onClose }: Props) {
  const general = useLiveQuery(async () => {
    const saved = await db.settings.get('generalInstruction')
    return saved?.id === 'generalInstruction' ? saved.value : ''
  })
  if (target.kind === 'general' && general === undefined) return null
  return <Form key={target.kind} target={target} initialText={target.kind === 'general' ? general! : (target.instruction?.text ?? '')} onSaved={onSaved} onClose={onClose} />
}

function Form({ target, initialText, onSaved, onClose }: Props & { initialText: string }) {
  const existing = target.kind === 'start' ? target.instruction : null
  const [name, setName] = useState(existing?.name ?? '')
  const [text, setText] = useState(initialText)
  const valid = target.kind === 'general' || (name.trim() !== '' && text.trim() !== '')

  async function save() {
    if (target.kind === 'general') {
      await db.settings.put({ id: 'generalInstruction', value: text.trim() })
    } else {
      const saved: Instruction = { id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? Date.now(), name: name.trim(), text: text.trim() }
      await db.instructions.put(saved)
      onSaved?.(saved)
    }
    onClose()
  }

  async function remove() {
    if (!existing || !window.confirm(`Удалить инструкцию «${existing.name}»? Начатые с ней чаты сохранят её текст.`)) return
    await db.instructions.delete(existing.id)
    onClose()
  }

  return (
    <SwipePage onClose={onClose} className="z-30">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" className="text-stone-500" onClick={onClose}>
          Отмена
        </button>
        <h1 className="font-semibold">{target.kind === 'general' ? 'Общая инструкция' : 'Инструкция'}</h1>
        <button type="button" className="font-medium text-orange-700 disabled:text-stone-300" disabled={!valid} onClick={() => void save()}>
          Сохранить
        </button>
      </header>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {target.kind === 'general' ? (
          <p className="mb-3 text-xs text-stone-500">Ассистент получает её в каждом чате: что ему знать о вас и как отвечать.</p>
        ) : (
          <>
            <label className="mb-1 block text-xs text-stone-500">Название</label>
            <input
              value={name}
              placeholder="Например, Калории"
              onChange={(e) => setName(e.target.value)}
              className="mb-4 w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 outline-none"
            />
            <label className="mb-1 block text-xs text-stone-500">Текст — правила, по которым ассистент работает в таком чате</label>
          </>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-48 w-full flex-1 resize-none rounded-2xl border border-stone-200 bg-white px-3 py-2 text-[15px] outline-none"
        />
        {existing && (
          <button type="button" className="mt-3 w-full rounded-2xl py-3 text-red-600" onClick={() => void remove()}>
            Удалить инструкцию
          </button>
        )}
      </div>
    </SwipePage>
  )
}
