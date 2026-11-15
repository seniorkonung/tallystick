import { useEffect, useRef, useState } from 'react'
import { isEmptyValue, type EntryType, type Field, type FieldValue, type FieldValues } from './db'

type Props = {
  type: EntryType
  values: FieldValues
  // Поле, по плашке которого открыта панель
  focusId: string
  onChange: (fieldId: string, value: FieldValue | undefined) => void
  onClose: () => void
}

// Все поля типа в одной нижней панели
export function FieldsSheet({ type, values, focusId, onChange, onClose }: Props) {
  const sections = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    sections.current.get(focusId)?.scrollIntoView({ block: 'center' })
  }, [focusId])

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div className="flex max-h-[80dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-semibold">{type.name}</h2>
          <button type="button" className="text-sm font-medium text-orange-700" onClick={onClose}>
            Готово
          </button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-4">
          {type.fields.map((field) => {
            const value = values[field.id]
            return (
              <section
                key={field.id}
                ref={(el) => {
                  if (el) sections.current.set(field.id, el)
                  else sections.current.delete(field.id)
                }}
                className={`rounded-2xl px-2 py-2.5 ${field.id === focusId ? 'bg-stone-50' : ''}`}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-medium text-stone-700">{field.name || 'Без названия'}</span>
                  {!isEmptyValue(value) && (
                    <button type="button" className="text-sm text-stone-400" onClick={() => onChange(field.id, undefined)}>
                      Очистить
                    </button>
                  )}
                </div>
                <FieldEditor
                  field={field}
                  value={value}
                  autoFocus={field.id === focusId}
                  onChange={(v) => onChange(field.id, v)}
                  onClose={onClose}
                />
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type EditorProps = {
  field: Field
  value: FieldValue | undefined
  autoFocus: boolean
  onChange: (value: FieldValue | undefined) => void
  onClose: () => void
}

function FieldEditor({ field, value, autoFocus, onChange, onClose }: EditorProps) {
  switch (field.kind) {
    case 'single':
    case 'multi': {
      if (field.options.length === 0) {
        return <p className="px-1 text-sm text-stone-400">Нет вариантов — добавьте их в настройке типа</p>
      }
      const selected = Array.isArray(value) ? value : value === undefined ? [] : [String(value)]
      return (
        <div className="flex flex-wrap gap-2">
          {field.options.map((option) => {
            const active = selected.includes(option.id)
            return (
              <button
                key={option.id}
                type="button"
                className={`rounded-full px-3 py-2 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-800'}`}
                onClick={() => {
                  if (field.kind === 'single') return onChange(active ? undefined : option.id)
                  const next = active ? selected.filter((id) => id !== option.id) : [...selected, option.id]
                  onChange(next.length ? next : undefined)
                }}
              >
                {option.label || 'Без названия'}
              </button>
            )
          })}
        </div>
      )
    }
    case 'number':
      return <NumberEditor unit={field.unit} value={value} autoFocus={autoFocus} onChange={onChange} onClose={onClose} />
    case 'string':
      return (
        <input
          autoFocus={autoFocus}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
          className="w-full rounded-2xl bg-stone-100 px-3 py-2 outline-none"
        />
      )
  }
}

function NumberEditor({ unit, value, autoFocus, onChange, onClose }: { unit: string } & Omit<EditorProps, 'field'>) {
  const [draft, setDraft] = useState(typeof value === 'number' ? String(value).replace('.', ',') : '')
  // «Очистить» сбрасывает значение снаружи — поле ввода следует за ним
  if (value === undefined && draft !== '' && !Number.isNaN(Number(draft.replace(',', '.').trim()))) setDraft('')
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus={autoFocus}
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const parsed = Number(e.target.value.replace(',', '.').trim())
          onChange(e.target.value.trim() === '' || Number.isNaN(parsed) ? undefined : parsed)
        }}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
        className="w-full rounded-2xl bg-stone-100 px-3 py-2 outline-none"
      />
      {unit && <span className="text-sm text-stone-500">{unit}</span>}
    </div>
  )
}
