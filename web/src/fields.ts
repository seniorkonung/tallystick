import type { Field, FieldKind, FieldValue } from './db'

export const fieldKindLabels: Record<FieldKind, string> = {
  single: 'Один из списка',
  multi: 'Несколько из списка',
  number: 'Число',
  string: 'Строка',
}

export function newField(kind: FieldKind): Field {
  const id = crypto.randomUUID()
  switch (kind) {
    case 'single':
    case 'multi':
      return { id, name: '', kind, options: [] }
    case 'number':
      return { id, name: '', kind, unit: '' }
    case 'string':
      return { id, name: '', kind }
  }
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
      return [`${numberFormat.format(Number(value))}${field.unit ? ` ${field.unit}` : ''}`]
    case 'string':
      return [String(value)]
  }
}
