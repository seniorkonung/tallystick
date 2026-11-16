import { useState } from 'react'
import { unitName, units, type Unit } from './periods'

type Props = {
  amount: number
  unit: Unit
  // Со знаком: назад в прошлое или вперёд в будущее
  signed: boolean
  // Наименьшее число без знака
  min: number
  allowedUnits?: Unit[]
  onChange: (amount: number, unit: Unit) => void
}

// Число и единица относительной даты: «7 дней», «−2 недели»
export function AmountUnit({ amount, unit, signed, min, allowedUnits = units, onChange }: Props) {
  const [text, setText] = useState(String(Math.abs(amount)))
  const sign = amount < 0 ? -1 : 1
  const chipClass = (active: boolean) => `rounded-xl px-3 py-2 text-sm ${active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`

  return (
    <div className="flex items-center gap-2">
      {signed && (
        <div className="flex gap-1">
          <button type="button" aria-label="Назад" className={chipClass(sign < 0)} onClick={() => onChange(-Math.abs(amount), unit)}>
            −
          </button>
          <button type="button" aria-label="Вперёд" className={chipClass(sign > 0)} onClick={() => onChange(Math.abs(amount), unit)}>
            +
          </button>
        </div>
      )}
      <input
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number.parseInt(e.target.value, 10)
          if (!Number.isNaN(n) && n >= min) onChange(sign * n, unit)
        }}
        className="w-16 rounded-xl bg-stone-100 px-3 py-2 text-sm outline-none"
      />
      <select value={unit} onChange={(e) => onChange(amount, e.target.value as Unit)} className="flex-1 rounded-xl bg-stone-100 px-3 py-2 text-sm">
        {allowedUnits.map((u) => (
          <option key={u} value={u}>
            {unitName(amount, u)}
          </option>
        ))}
      </select>
    </div>
  )
}
