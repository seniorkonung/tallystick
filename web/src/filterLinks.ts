import { z } from 'zod'
import { useChatView } from './chatView'
import { opLabels, opsByKind, type Condition, type ConditionOp } from './conditions'
import type { FieldKind } from './db'
import { emptyFilters, normalizeFilters, useFilters, type Filters } from './filterStore'
import { units, type Unit } from './periods'
import { useThread } from './threadStore'

// Ссылка на фильтры хранит их целиком: [подпись](filter:КОД), где КОД — JSON фильтров в base64url.
// Ссылки живут в текстах записей, поэтому старый КОД должен открываться и после изменений фильтров

const unit = z.enum(units as [Unit, ...Unit[]])
const shift = z.object({ amount: z.number().int(), unit })

const conditionSchema = z.object({
  name: z.string().describe('Field name; same-named fields of the same kind in different types count as one'),
  kind: z.enum(Object.keys(opsByKind) as [FieldKind, ...FieldKind[]]),
  op: z
    .enum(Object.keys(opLabels) as [ConditionOp, ...ConditionOp[]])
    .describe(`Operators by field kind: ${Object.entries(opsByKind).map(([kind, ops]) => `${kind}: ${ops.join(', ')}`).join('; ')}`),
  num: z.number().optional().describe('Number fields: the value, or the lower bound for between'),
  num2: z.number().optional().describe('Number fields: the upper bound for between'),
  labels: z.array(z.string()).optional().describe('Choice fields: option labels'),
  text: z.string().optional().describe('String fields: the substring'),
  date: z
    .string()
    .optional()
    .describe('Date and datetime fields: a day YYYY-MM-DD, datetime compares by day; time fields: HH:mm. The lower bound for between'),
  date2: z.string().optional().describe('The upper bound for between, like date'),
  rel: shift
    .optional()
    .describe('Date and datetime fields, instead of date: a whole calendar unit shifted from the current one, e.g. 0 day is today, -1 week is last week'),
  rel2: shift.optional().describe('The upper bound for between, like rel'),
})

// Фильтры ленты в ссылке и в поиске ассистента; значения по умолчанию опускаются
export const filtersSchema = z.object({
  typeIds: z.array(z.string()).optional().describe('Entry type ids; an entry matches any of them'),
  tagIds: z.array(z.string()).optional().describe('Tag ids; an entry matches if it has any of them'),
  untagged: z.boolean().optional().describe('Also match entries without tags, in addition to tagIds'),
  from: z.string().optional().describe('First day of the period, inclusive, YYYY-MM-DD in local time'),
  to: z.string().optional().describe('Last day of the period, inclusive, YYYY-MM-DD in local time'),
  last: z
    .object({ amount: z.number().int().min(1), unit })
    .optional()
    .describe('Instead of from and to: the last N calendar units including the current one, so 1 week is this week; hours count back from now. A link keeps it relative'),
  text: z.string().optional().describe('Case-insensitive substring of the entry text'),
  actuality: z.enum(['all', 'actual', 'inactual']).optional(),
  hideReplies: z.boolean().optional().describe('Exclude entries that are replies'),
  fromChats: z.boolean().optional().describe('Only entries saved from chats'),
  mentionsOf: z.string().optional().describe('Only entries whose text links to this entry id'),
  conditions: z.array(conditionSchema).optional().describe('Conditions on field values; an entry matches only if its type has the field'),
  conditionMode: z.enum(['all', 'any']).optional().describe('How conditions combine with each other, all by default'),
})

export type FiltersInput = z.infer<typeof filtersSchema>

// Оператор, неприменимый к виду поля, ничего бы не нашёл молча — это ошибка
export function toFilters(input: FiltersInput): Filters {
  const conditions = (input.conditions ?? []).map((c): Condition => {
    if (!opsByKind[c.kind].includes(c.op)) throw new Error(`Operator ${c.op} does not apply to ${c.kind} fields; use one of ${opsByKind[c.kind].join(', ')}`)
    return { id: crypto.randomUUID(), num: null, num2: null, labels: [], text: '', date: '', date2: '', rel: null, rel2: null, ...c }
  })
  return normalizeFilters({ ...input, conditions })
}

const conditionKeys = ['name', 'kind', 'op', 'num', 'num2', 'labels', 'text', 'date', 'date2', 'rel', 'rel2'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Постоянный порядок ключей, отсортированные id и опущенные значения по умолчанию: одинаковые фильтры дают одинаковую ссылку.
// id условий случайные и в ссылку не входят
export function canonicalFilters(f: Filters): FiltersInput {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(emptyFilters) as (keyof Filters)[]) {
    let value: unknown = f[key]
    if (key === 'typeIds' || key === 'tagIds') value = [...f[key]].sort()
    if (key === 'text') value = f.text.trim()
    if (key === 'last' && f.last) value = { amount: f.last.amount, unit: f.last.unit }
    if (key === 'conditions') value = f.conditions.map(canonicalCondition)
    // Режим сочетания условий важен, только когда их несколько
    if (key === 'conditionMode' && f.conditions.length < 2) continue
    if (!same(value, emptyFilters[key])) out[key] = value
  }
  return out as FiltersInput
}

function canonicalCondition(c: Condition) {
  const defaults: Record<string, unknown> = { num: null, num2: null, labels: [], text: '', date: '', date2: '', rel: null, rel2: null }
  const out: Record<string, unknown> = {}
  for (const key of conditionKeys) {
    const value = (key === 'rel' || key === 'rel2') && c[key] ? { amount: c[key].amount, unit: c[key].unit } : c[key]
    if (value !== undefined && !same(value, defaults[key])) out[key] = value
  }
  return out
}

const prefix = 'filter:'

export function filterHref(f: Filters) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalFilters(f)))
  return prefix + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Ссылку могли повредить правкой текста или неточным копированием моделью — тогда null
export function filtersFromHref(href: string): Filters | null {
  if (!href.startsWith(prefix)) return null
  try {
    const bytes = Uint8Array.from(atob(href.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    return toFilters(filtersSchema.parse(JSON.parse(new TextDecoder().decode(bytes))))
  } catch {
    return null
  }
}

// Фильтры заменяют текущие в ленте; чат, список чатов и экраны ответов поверх неё закрываются
export function openFilters(filters: Filters) {
  const depth = useThread.getState().stack.length + (useChatView.getState().chatId ? 1 : 0)
  useChatView.setState({ chatId: null, listOpen: false })
  useThread.setState({ stack: [] })
  if (depth) history.go(-depth)
  useFilters.getState().set(filters)
}

export function openFilterLink(href: string) {
  const filters = filtersFromHref(href)
  if (filters) openFilters(filters)
  else window.alert('Ссылка на фильтры повреждена')
}
