import { useState } from 'react'
import { fieldCatalog, isComplete, matchCondition, opLabels, opsByKind, type Condition } from './conditions'
import type { Entry, EntryType } from './db'
import { fieldKindLabels } from './fields'
import { pluralRu } from './plural'

type Props = {
  types: EntryType[]
  entries: Entry[]
  // null — новое условие: сначала выбирается поле
  initial: Condition | null
  onDone: (condition: Condition) => void
  onCancel: () => void
}

function parseNumber(s: string) {
  const n = Number(s.replace(',', '.').trim())
  return s.trim() === '' || Number.isNaN(n) ? null : n
}

const numberText = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

export function ConditionEditor({ types, entries, initial, onDone, onCancel }: Props) {
  const [condition, setCondition] = useState<Condition | null>(initial)
  const [numText, setNumText] = useState(numberText(initial?.num ?? null))
  const [num2Text, setNum2Text] = useState(numberText(initial?.num2 ?? null))
  const catalog = fieldCatalog(types)
  const typesById = new Map(types.map((t) => [t.id, t]))

  if (!condition) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Поле</h3>
          <button type="button" className="text-sm text-stone-500" onClick={onCancel}>
            Отмена
          </button>
        </div>
        {catalog.length === 0 && <p className="text-sm text-stone-400">У типов пока нет полей</p>}
        <ul className="flex flex-col">
          {catalog.map((f) => (
            <li key={`${f.name}|${f.kind}`}>
              <button
                type="button"
                className="flex w-full flex-col rounded-2xl px-3 py-2.5 text-left hover:bg-stone-100"
                onClick={() =>
                  setCondition({
                    id: crypto.randomUUID(),
                    name: f.name,
                    kind: f.kind,
                    op: opsByKind[f.kind][0],
                    num: null,
                    num2: null,
                    labels: [],
                    text: '',
                  })
                }
              >
                <span className="font-medium">{f.name}</span>
                <span className="text-xs text-stone-400">
                  {fieldKindLabels[f.kind]} · {f.typeNames.join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const field = catalog.find((f) => f.name === condition.name && f.kind === condition.kind)
  const count = isComplete(condition)
    ? entries.filter((e) => matchCondition(condition, e, typesById.get(e.typeId))).length
    : null
  const set = (patch: Partial<Condition>) => setCondition({ ...condition, ...patch })
  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`
  const withValue = condition.op !== 'filled' && condition.op !== 'empty'

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{condition.name}</h3>
        <button type="button" className="text-sm text-stone-500" onClick={onCancel}>
          Отмена
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {opsByKind[condition.kind].map((op) => (
          <button key={op} type="button" className={chipClass(condition.op === op)} onClick={() => set({ op })}>
            {opLabels[op]}
          </button>
        ))}
      </div>

      {withValue && condition.kind === 'number' && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            inputMode="decimal"
            value={numText}
            placeholder={condition.op === 'between' ? 'от' : 'число'}
            onChange={(e) => {
              setNumText(e.target.value)
              set({ num: parseNumber(e.target.value) })
            }}
            className="w-full rounded-xl bg-stone-100 px-3 py-2 outline-none"
          />
          {condition.op === 'between' && (
            <input
              inputMode="decimal"
              value={num2Text}
              placeholder="до"
              onChange={(e) => {
                setNum2Text(e.target.value)
                set({ num2: parseNumber(e.target.value) })
              }}
              className="w-full rounded-xl bg-stone-100 px-3 py-2 outline-none"
            />
          )}
        </div>
      )}

      {withValue && (condition.kind === 'single' || condition.kind === 'multi') && (
        <div className="flex flex-wrap gap-2">
          {(field?.labels ?? condition.labels).map((label) => {
            const active = condition.labels.includes(label)
            return (
              <button
                key={label}
                type="button"
                className={chipClass(active)}
                onClick={() => set({ labels: active ? condition.labels.filter((l) => l !== label) : [...condition.labels, label] })}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {withValue && condition.kind === 'string' && (
        <input
          autoFocus
          value={condition.text}
          placeholder="текст"
          onChange={(e) => set({ text: e.target.value })}
          className="w-full rounded-xl bg-stone-100 px-3 py-2 outline-none"
        />
      )}

      <button
        type="button"
        disabled={!isComplete(condition)}
        className="mt-5 w-full rounded-2xl bg-stone-900 py-3 font-medium text-white disabled:bg-stone-200 disabled:text-stone-400"
        onClick={() => onDone(condition)}
      >
        {count === null ? 'Готово' : `Готово · подходит ${count} ${pluralRu(count, ['запись', 'записи', 'записей'])}`}
      </button>
    </div>
  )
}
