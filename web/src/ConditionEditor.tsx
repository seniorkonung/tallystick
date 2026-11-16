import { useState } from 'react'
import { AmountUnit } from './AmountUnit'
import { boundRange, fieldCatalog, isComplete, matchCondition, opLabel, opsByKind, type Condition } from './conditions'
import type { Entry, EntryType, FieldKind } from './db'
import { fieldKindLabels } from './fields'
import { pluralRu } from './plural'
import { momentText, units, type RelBound } from './periods'

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
                    date: '',
                    date2: '',
                    rel: null,
                    rel2: null,
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
            {opLabel(condition.kind, op)}
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

      {withValue && (condition.kind === 'date' || condition.kind === 'datetime') && (
        <div className="flex flex-col gap-3">
          <BoundInput
            label={condition.op === 'between' ? 'С' : null}
            kind={condition.kind}
            withHours={condition.op !== 'eq'}
            day={condition.date}
            rel={condition.rel ?? null}
            onChange={(date, rel) => set({ date, rel })}
          />
          {condition.op === 'between' && (
            <BoundInput label="По" kind={condition.kind} withHours day={condition.date2} rel={condition.rel2 ?? null} onChange={(date2, rel2) => set({ date2, rel2 })} />
          )}
          {(condition.rel || (condition.op === 'between' && condition.rel2)) && isComplete(condition) && <BoundHint condition={condition} />}
        </div>
      )}

      {withValue && condition.kind === 'time' && (
        <div className="flex items-center gap-2">
          <input type="time" value={condition.date ?? ''} onChange={(e) => set({ date: e.target.value })} className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm" />
          {condition.op === 'between' && (
            <>
              <span className="text-stone-400">—</span>
              <input type="time" value={condition.date2 ?? ''} onChange={(e) => set({ date2: e.target.value })} className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm" />
            </>
          )}
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

type BoundProps = {
  label: string | null
  kind: FieldKind
  // Часы — сдвиг от текущей минуты; для «в» и для полей без времени они не нужны
  withHours: boolean
  day: string
  rel: RelBound | null
  onChange: (day: string, rel: RelBound | null) => void
}

// Граница условия по дате: точный день или сдвиг от сегодня
function BoundInput({ label, kind, withHours, day, rel, onChange }: BoundProps) {
  const chipClass = (active: boolean) => `rounded-full px-3 py-1 text-xs ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`
  const allowed = units.filter((u) => u !== 'hour' || (withHours && kind === 'datetime'))
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {label && <span className="w-6 text-sm text-stone-500">{label}</span>}
        <button type="button" className={chipClass(!rel)} onClick={() => onChange(day, null)}>
          Дата
        </button>
        <button type="button" className={chipClass(!!rel)} onClick={() => rel || onChange('', { amount: 0, unit: 'day' })}>
          От сегодня
        </button>
      </div>
      {rel ? (
        <AmountUnit
          amount={rel.amount}
          unit={allowed.includes(rel.unit) ? rel.unit : 'day'}
          signed
          min={0}
          allowedUnits={allowed}
          onChange={(amount, unit) => onChange('', { amount, unit })}
        />
      ) : (
        <input type="date" value={day} onChange={(e) => onChange(e.target.value, null)} className="w-full rounded-xl bg-stone-100 px-3 py-2 text-sm" />
      )}
    </div>
  )
}

// Во что относительные границы превращаются сейчас
function BoundHint({ condition: c }: { condition: Condition }) {
  const [start, end] = boundRange(c.rel, c.date)
  const withTime = (b: RelBound | null | undefined) => b?.unit === 'hour'
  const from = (t: number, b: RelBound | null | undefined) => momentText(t, withTime(b))
  // Конец не включается: для дней показываем последний день
  const to = (t: number, b: RelBound | null | undefined) => momentText(withTime(b) ? t : t - 1, withTime(b))
  let text: string
  if (c.op === 'gte') text = `с ${from(start, c.rel)}`
  else if (c.op === 'lte') text = `по ${to(end, c.rel)}`
  else if (c.op === 'eq') text = `с ${from(start, c.rel)} по ${to(end, c.rel)}`
  else {
    const [start2, end2] = boundRange(c.rel2, c.date2)
    text = `с ${from(Math.min(start, start2), start <= start2 ? c.rel : c.rel2)} по ${to(Math.max(end, end2), end >= end2 ? c.rel : c.rel2)}`
  }
  return <p className="text-xs text-stone-400">Сейчас — {text}</p>
}
