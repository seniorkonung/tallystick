import { tool } from 'ai'
import { z } from 'zod'
import { db, type Entry, type EntryType, type Project } from './db'
import { emptyFilters, matchEntry, type Filters } from './filterStore'

const pad = (n: number) => String(n).padStart(2, '0')

// Местное время без часового пояса: пояс ассистент знает из инструкций
export function localTime(time: number) {
  const d = new Date(time)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Значения полей по названиям: числа — числами, списки — подписями вариантов
function fieldValues(entry: Entry, type: EntryType | undefined) {
  const result: Record<string, string | number | string[]> = {}
  for (const field of type?.fields ?? []) {
    const value = entry.values[field.id]
    if (value === undefined) continue
    if (field.kind === 'single' || field.kind === 'multi') {
      const ids = Array.isArray(value) ? value : [String(value)]
      const labels = ids.flatMap((id) => field.options.find((o) => o.id === id)?.label ?? [])
      result[field.name] = field.kind === 'single' ? (labels[0] ?? '') : labels
    } else {
      result[field.name] = value as string | number
    }
  }
  return result
}

function describeProject(p: Project, categoryName: string | null) {
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    category: categoryName,
    startedAt: localTime(p.startedAt),
    completedAt: p.completedAt ? localTime(p.completedAt) : null,
  }
}

export const readTools = {
  list_types: tool({
    description: 'List all entry types with their fields. Field values of entries are keyed by field name.',
    inputSchema: z.object({}),
    execute: async () => {
      const types = await db.types.toArray()
      return types.map((t) => ({
        id: t.id,
        name: t.name,
        fields: t.fields.map((f) => ({
          name: f.name,
          kind: f.kind,
          ...(f.kind === 'number' && f.unit ? { unit: f.unit } : {}),
          ...(f.kind === 'single' || f.kind === 'multi' ? { options: f.options.map((o) => o.label) } : {}),
        })),
      }))
    },
  }),

  list_projects: tool({
    description: 'List all projects, active and completed, with their categories.',
    inputSchema: z.object({}),
    execute: async () => {
      const [projects, categories] = await Promise.all([db.projects.toArray(), db.categories.toArray()])
      return projects.map((p) =>
        describeProject(p, p.status === 'completed' ? p.frozenCategoryName : (categories.find((c) => c.id === p.categoryId)?.name ?? null)),
      )
    },
  }),

  search_entries: tool({
    description:
      'Search entries of the feed, newest first. All filters combine with AND; omit a filter to not restrict by it. ' +
      'Returns the total number of matches and one page of entries.',
    inputSchema: z.object({
      typeIds: z.array(z.string()).optional().describe('Entry type ids; an entry matches any of them'),
      projectIds: z.array(z.string()).optional().describe('Project ids; an entry matches if it has any of them'),
      from: z.string().optional().describe('First day of the period, inclusive, YYYY-MM-DD in local time'),
      to: z.string().optional().describe('Last day of the period, inclusive, YYYY-MM-DD in local time'),
      text: z.string().optional().describe('Case-insensitive substring of the entry text'),
      actuality: z.enum(['all', 'actual', 'inactual']).optional(),
      replyTo: z.string().optional().describe('Only direct replies to this entry id'),
      hideReplies: z.boolean().optional().describe('Exclude entries that are replies'),
      limit: z.number().int().min(1).max(200).optional().describe('Page size, 50 by default'),
      offset: z.number().int().min(0).optional(),
    }),
    execute: async (input) => {
      const [entries, types, projects, attachments] = await Promise.all([
        db.entries.toArray(),
        db.types.toArray(),
        db.projects.toArray(),
        db.attachments.toArray(),
      ])
      const typesById = new Map(types.map((t) => [t.id, t]))
      const filters: Filters = {
        ...emptyFilters,
        typeIds: input.typeIds ?? [],
        projectIds: input.projectIds ?? [],
        from: input.from ?? '',
        to: input.to ?? '',
        text: input.text ?? '',
        actuality: input.actuality ?? 'all',
        hideReplies: input.hideReplies ?? false,
      }
      const found = entries
        .filter((e) => matchEntry(filters, e, typesById) && (!input.replyTo || e.replyTo === input.replyTo))
        .sort((a, b) => b.createdAt - a.createdAt)
      const offset = input.offset ?? 0
      const page = found.slice(offset, offset + (input.limit ?? 50))
      return {
        total: found.length,
        entries: page.map((e) => {
          const type = typesById.get(e.typeId)
          return {
            id: e.id,
            createdAt: localTime(e.createdAt),
            type: type?.name ?? null,
            text: e.text,
            fields: fieldValues(e, type),
            projects: e.projectIds.flatMap((id) => projects.find((p) => p.id === id)?.name ?? []),
            actual: e.actual,
            replyTo: e.replyTo,
            attachments: attachments.filter((a) => a.entryId === e.id).map((a) => ({ name: a.name, mime: a.mime })),
          }
        }),
      }
    },
  }),
}

export const toolLabels: Record<string, string> = {
  list_types: 'Смотрю типы',
  list_projects: 'Смотрю проекты',
  search_entries: 'Ищу записи',
}
