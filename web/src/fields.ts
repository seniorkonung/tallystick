import type { Field, FieldKind, FieldValue } from './db'

export const fieldKindLabels: Record<FieldKind, string> = {
  single: 'Один из списка',
  multi: 'Несколько из списка',
  number: 'Число',
  string: 'Строка',
  date: 'Дата',
}

export function newField(kind: FieldKind): Field {
  const id = crypto.randomUUID()
  switch (kind) {
    case 'single':
    case 'multi':
      return { id, name: '', kind, options: [] }
    case 'number':
    case 'string':
    case 'date':
      return { id, name: '', kind }
  }
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const dayWithYearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })

// День YYYY-MM-DD для показа; год виден, только если он не текущий
export function formatDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return (y === new Date().getFullYear() ? dayFormat : dayWithYearFormat).format(new Date(y, m - 1, d))
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 })

// Значение поля как список подписей: у multi их несколько, у остальных одна
export function formatValue(field: Field, value: FieldValue): string[] {
  switch (field.kind) {
    case 'single':
    case 'multi': {
      const ids = Array.isArray(value) ? value : [String(value)]
      return ids.map((id) => field.options.find((o) => o.id === id)?.label ?? '—')
    }
    case 'number':
      return [numberFormat.format(Number(value))]
    case 'string':
      return [String(value)]
    case 'date':
      return [formatDay(String(value))]
  }
}
