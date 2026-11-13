import { useState } from 'react'
import type { Field, FieldValue } from './db'

type Props = {
  field: Field
  value: FieldValue | undefined
  onChange: (value: FieldValue | undefined) => void
  onClose: () => void
}

// Панель ввода значения поля над панелью ввода записи
export function FieldInput({ field, value, onChange, onClose }: Props) {
  return (
    <div className="mb-2 rounded-3xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-medium text-stone-700">{field.name || 'Без названия'}</span>
        <div className="flex gap-3 text-sm">
          {value !== undefined && (
            <button type="button" className="text-stone-400" onClick={() => onChange(undefined)}>
              Очистить
            </button>
          )}
          <button type="button" className="font-medium text-orange-700" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
      <FieldEditor field={field} value={value} onChange={onChange} onClose={onClose} />
    </div>
  )
}

function FieldEditor({ field, value, onChange, onClose }: Props) {
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
                  if (field.kind === 'single') {
                    onChange(active ? undefined : option.id)
                    onClose()
                  } else {
                    const next = active ? selected.filter((id) => id !== option.id) : [...selected, option.id]
                    onChange(next.length ? next : undefined)
                  }
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
      return <NumberEditor key={field.id} unit={field.unit} value={value} onChange={onChange} onClose={onClose} />
    case 'string':
      return (
        <input
          autoFocus
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          onKeyDown={(e) => e.key === 'Enter' && onClose()}
          className="w-full rounded-2xl bg-stone-100 px-3 py-2 outline-none"
        />
      )
  }
}

function NumberEditor({ unit, value, onChange, onClose }: { unit: string } & Omit<Props, 'field'>) {
  const [draft, setDraft] = useState(typeof value === 'number' ? String(value).replace('.', ',') : '')
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
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
