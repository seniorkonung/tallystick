import { isEmptyValue, type Entry, type EntryType, type Field, type FieldKind } from './db'

export type ConditionOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'oneOf'
  | 'except'
  | 'anyOf'
  | 'allOf'
  | 'noneOf'
  | 'contains'
  | 'notContains'
  | 'filled'
  | 'empty'

// Поле условия — название и вид: одноимённые поля разных типов считаются одним
export type Condition = {
  id: string
  name: string
  kind: FieldKind
  op: ConditionOp
  // Число, для «между» — нижняя граница
  num: number | null
  // Верхняя граница для «между»
  num2: number | null
  // Подписи вариантов для списков: у разных типов id вариантов разные
  labels: string[]
  text: string
}

export const opsByKind: Record<FieldKind, ConditionOp[]> = {
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'filled', 'empty'],
  single: ['oneOf', 'except', 'filled', 'empty'],
  multi: ['anyOf', 'allOf', 'noneOf', 'filled', 'empty'],
  string: ['contains', 'notContains', 'filled', 'empty'],
}

export const opLabels: Record<ConditionOp, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  between: 'между',
  oneOf: 'одно из',
  except: 'кроме',
  anyOf: 'любое из',
  allOf: 'все из',
  noneOf: 'ни одного из',
  contains: 'содержит',
  notContains: 'не содержит',
  filled: 'заполнено',
  empty: 'пусто',
}

const norm = (s: string) => s.trim().toLowerCase()

export type CatalogField = { name: string; kind: FieldKind; typeNames: string[]; labels: string[] }

// Все поля всех типов, одноимённые поля одного вида объединены
export function fieldCatalog(types: EntryType[]): CatalogField[] {
  const byKey = new Map<string, CatalogField>()
  for (const type of types) {
    for (const field of type.fields) {
      const key = `${norm(field.name)}|${field.kind}`
      const item = byKey.get(key) ?? { name: field.name, kind: field.kind, typeNames: [], labels: [] }
      item.typeNames.push(type.name)
      if (field.kind === 'single' || field.kind === 'multi') {
        for (const o of field.options) if (!item.labels.some((l) => norm(l) === norm(o.label))) item.labels.push(o.label)
      }
      byKey.set(key, item)
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function findField(c: Condition, type: EntryType): Field | undefined {
  return type.fields.find((f) => f.kind === c.kind && norm(f.name) === norm(c.name))
}

// Условие подходит только записям, у типа которых есть такое поле
export function matchCondition(c: Condition, entry: Entry, type: EntryType | undefined): boolean {
  const field = type && findField(c, type)
  if (!field) return false
  const value = entry.values[field.id]
  const empty = isEmptyValue(value)
  if (c.op === 'filled') return !empty
  if (c.op === 'empty') return empty
  if (empty || value === undefined) return false

  switch (field.kind) {
    case 'number': {
      const n = Number(value)
      const x = c.num ?? 0
      switch (c.op) {
        case 'eq':
          return n === x
        case 'ne':
          return n !== x
        case 'gt':
          return n > x
        case 'gte':
          return n >= x
        case 'lt':
          return n < x
        case 'lte':
          return n <= x
        case 'between':
          return n >= Math.min(x, c.num2 ?? x) && n <= Math.max(x, c.num2 ?? x)
        default:
          return false
      }
    }
    case 'single':
    case 'multi': {
      const ids = Array.isArray(value) ? value : [String(value)]
      const entryLabels = ids.flatMap((id) => field.options.find((o) => o.id === id)?.label ?? []).map(norm)
      const wanted = c.labels.map(norm)
      const any = wanted.some((l) => entryLabels.includes(l))
      switch (c.op) {
        case 'oneOf':
        case 'anyOf':
          return any
        case 'except':
        case 'noneOf':
          return !any
        case 'allOf':
          return wanted.every((l) => entryLabels.includes(l))
        default:
          return false
      }
    }
    case 'string': {
      const has = String(value).toLowerCase().includes(c.text.trim().toLowerCase())
      return c.op === 'contains' ? has : c.op === 'notContains' ? !has : false
    }
  }
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 })

export function formatCondition(c: Condition) {
  switch (c.op) {
    case 'filled':
    case 'empty':
      return `${c.name} ${opLabels[c.op]}`
    case 'between':
      return `${c.name} ${numberFormat.format(c.num ?? 0)}–${numberFormat.format(c.num2 ?? 0)}`
    case 'eq':
    case 'ne':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return `${c.name} ${opLabels[c.op]} ${numberFormat.format(c.num ?? 0)}`
    case 'oneOf':
      return `${c.name}: ${c.labels.join(' или ')}`
    case 'contains':
    case 'notContains':
      return `${c.name} ${opLabels[c.op]} «${c.text.trim()}»`
    default:
      return `${c.name} ${opLabels[c.op]} ${c.labels.join(', ')}`
  }
}

// Условие готово к применению: у оператора заполнены нужные значения
export function isComplete(c: Condition) {
  switch (c.op) {
    case 'filled':
    case 'empty':
      return true
    case 'between':
      return c.num !== null && c.num2 !== null
    case 'contains':
    case 'notContains':
      return c.text.trim() !== ''
    case 'oneOf':
    case 'except':
    case 'anyOf':
    case 'allOf':
    case 'noneOf':
      return c.labels.length > 0
    default:
      return c.num !== null
  }
}
