import { tool } from 'ai'
import { z } from 'zod'
import { addEntry, archiveTag, createTag, db, deleteEntry, deleteTag, restoreTag, setActual, updateEntry, type Entry, type EntryType, type FieldValues, type Permission, type Tag, type ProviderKind } from './db'
import { loadTagTabs } from './tagTabs'
import { fileForModel } from './modelFiles'
import { fieldCatalog, isComplete } from './conditions'
import { canonicalFilters, filterHref, filtersFromHref, filtersSchema, toFilters } from './filterLinks'
import { matchEntry, type Filters } from './filterStore'

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
      // Дата со временем — в том же виде, что и время записей
      result[field.name] = field.kind === 'datetime' ? String(value).replace('T', ' ') : (value as string | number)
    }
  }
  return result
}

// У тега в архиве категория — та, в которой он был при уходе в архив
function describeTag(tag: Tag, categoryName: string | null, entries: number) {
  return {
    id: tag.id,
    name: tag.name,
    status: tag.status,
    categoryId: tag.categoryId,
    category: tag.status === 'archived' ? tag.frozenCategoryName : categoryName,
    archivedAt: tag.archivedAt ? localTime(tag.archivedAt) : null,
    entries,
  }
}

// Записи в том виде, в каком их видит ассистент: так их отдаёт search_entries и так они прикрепляются к сообщениям
export async function describeEntries(entries: Entry[]) {
  const [types, tags, attachments] = await Promise.all([
    db.types.toArray(),
    db.tags.toArray(),
    db.attachments.where('entryId').anyOf(entries.map((e) => e.id)).toArray(),
  ])
  return entries.map((e) => {
    const type = types.find((t) => t.id === e.typeId)
    return {
      id: e.id,
      createdAt: localTime(e.createdAt),
      type: type?.name ?? null,
      text: e.text,
      fields: fieldValues(e, type),
      tags: e.tagIds.flatMap((id) => tags.find((p) => p.id === id)?.name ?? []),
      actual: e.actual,
      replyTo: e.replyTo,
      attachments: attachments.filter((a) => a.entryId === e.id).map((a) => ({ id: a.id, name: a.name, mime: a.mime })),
    }
  })
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
          ...(f.kind === 'single' || f.kind === 'multi' ? { options: f.options.map((o) => o.label) } : {}),
        })),
      }))
    },
  }),

  list_tags: tool({
    description:
      'List tags with their categories and entry counts: active tags by name, then archived ones, most recently archived first. ' +
      'Also returns the tag categories in the order of the tabs the user picks tags from.',
    inputSchema: z.object({
      query: z.string().optional().describe('Case-insensitive substring of the tag name'),
      status: z.enum(['active', 'archived']).optional().describe('Only active or only archived tags; both by default'),
      categoryId: z
        .string()
        .nullable()
        .optional()
        .describe('Only tags of this category, null for tags without a category; an archived tag counts in the category it had'),
      limit: z.number().int().min(1).max(500).optional().describe('Page size, 100 by default'),
      offset: z.number().int().min(0).optional(),
    }),
    execute: async ({ query, status, categoryId, limit, offset }) => {
      const [tags, tabs] = await Promise.all([db.tags.toArray(), loadTagTabs()])
      const categories = tabs.flatMap((t) => (t.kind === 'category' ? [{ id: t.category.id, name: t.category.name }] : []))
      const q = query?.trim().toLowerCase()
      const found = tags
        .filter((t) => (!q || t.name.toLowerCase().includes(q)) && (!status || t.status === status) && (categoryId === undefined || t.categoryId === categoryId))
        // Как во вкладках выбора тегов
        .sort((a, b) =>
          a.status !== b.status ? (a.status === 'active' ? -1 : 1) : a.status === 'archived' ? (b.archivedAt ?? 0) - (a.archivedAt ?? 0) : a.name.localeCompare(b.name, 'ru'),
        )
      const page = found.slice(offset ?? 0, (offset ?? 0) + (limit ?? 100))
      const counts = await Promise.all(page.map((t) => db.entries.where('tagIds').equals(t.id).count()))
      return {
        total: found.length,
        categories,
        tags: page.map((t, i) => describeTag(t, categories.find((c) => c.id === t.categoryId)?.name ?? null, counts[i])),
      }
    },
  }),

  search_entries: tool({
    description:
      'Search entries of the feed, newest first, with the same filters as the feed. All filters combine with AND; omit a filter to not restrict by it. ' +
      'Returns the total number of matches, one page of entries, and a link that opens the feed with these filters.',
    inputSchema: filtersSchema.extend({
      link: z
        .string()
        .optional()
        .describe('A filter link filter:CODE from a message or an entry text: search by its filters and get them back. Other filters are then ignored'),
      replyTo: z.string().optional().describe('Only direct replies to this entry id. The feed has no such filter, so no link is returned'),
      limit: z.number().int().min(1).max(200).optional().describe('Page size, 50 by default'),
      offset: z.number().int().min(0).optional(),
    }),
    execute: async ({ link, replyTo, limit, offset, ...input }) => {
      const [entries, types] = await Promise.all([db.entries.toArray(), db.types.toArray()])
      const filters = link ? filtersFromHref(link) : checkFields(toFilters(input), types)
      if (!filters) throw new Error('The filter link is damaged')
      const typesById = new Map(types.map((t) => [t.id, t]))
      const found = entries
        .filter((e) => matchEntry(filters, e, typesById) && (!replyTo || e.replyTo === replyTo))
        .sort((a, b) => b.createdAt - a.createdAt)
      const page = found.slice(offset ?? 0, (offset ?? 0) + (limit ?? 50))
      return {
        total: found.length,
        ...(replyTo ? {} : { link: filterHref(filters) }),
        ...(link ? { filters: canonicalFilters(filters) } : {}),
        entries: await describeEntries(page),
      }
    },
  }),

  list_instructions: tool({
    description: 'List the general instruction and all saved start instructions with their ids and full texts.',
    inputSchema: z.object({}),
    execute: async () => {
      const [general, saved] = await Promise.all([db.settings.get('generalInstruction'), db.instructions.orderBy('createdAt').toArray()])
      return {
        general: general?.id === 'generalInstruction' ? general.value : '',
        start: saved.map((i) => ({ id: i.id, name: i.name, text: i.text })),
      }
    },
  }),

  view_attachments: tool({
    description: 'Look at attachments of entries: photos and PDFs are shown to you, text files come as text. Get attachment ids from search_entries.',
    inputSchema: z.object({ ids: z.array(z.string()).min(1).max(5) }),
    execute: async ({ ids }) => {
      const found = await db.attachments.bulkGet(ids)
      return Promise.all(
        ids.map(async (id, i) => {
          const a = found[i]
          return a ? { id, entryId: a.entryId, file: await fileForModel(a) } : { id, entryId: null, file: { type: 'text' as const, text: `[No attachment with id ${id}]` } }
        }),
      )
    },
    // Картинки и PDF уходят модели как файлы, а не как JSON с байтами
    toModelOutput: ({ output }) => ({
      type: 'content',
      value: output.flatMap(({ id, entryId, file }) => [
        { type: 'text' as const, text: `Attachment ${id} of entry ${entryId}:` },
        file.type === 'text' ? file : { type: 'file' as const, mediaType: file.mediaType, filename: file.filename, data: { type: 'data' as const, data: file.data } },
      ]),
    }),
  }),
}

const norm = (s: string) => s.trim().toLowerCase()

// Условие с неизвестным полем или без значения молча ничего не нашло бы
function checkFields(filters: Filters, types: EntryType[]) {
  const catalog = fieldCatalog(types)
  for (const c of filters.conditions) {
    if (!catalog.some((f) => f.kind === c.kind && norm(f.name) === norm(c.name))) throw new Error(`No ${c.kind} field "${c.name}"; see list_types`)
    if (!isComplete(c)) throw new Error(`The condition on "${c.name}" needs a value for ${c.op}`)
  }
  return filters
}

// Значения полей приходят по названиям и подписям вариантов, как их отдаёт search_entries
function toValues(type: EntryType, fields: Record<string, unknown>, base: FieldValues): FieldValues {
  const values = { ...base }
  for (const [name, raw] of Object.entries(fields)) {
    const field = type.fields.find((f) => norm(f.name) === norm(name))
    if (!field) throw new Error(`Type "${type.name}" has no field "${name}"`)
    if (raw === null) {
      delete values[field.id]
      continue
    }
    switch (field.kind) {
      case 'number':
        if (typeof raw !== 'number') throw new Error(`Field "${field.name}" needs a number`)
        values[field.id] = raw
        break
      case 'string':
        values[field.id] = String(raw)
        break
      case 'date':
      case 'datetime': {
        const text = String(raw).trim().replace(' ', 'T')
        const day = text.slice(0, 10)
        const [y, m, d] = day.split('-').map(Number)
        const date = new Date(y, m - 1, d)
        const valid = date.getMonth() === m - 1 && date.getDate() === d
        if (field.kind === 'date' && !(valid && /^\d{4}-\d{2}-\d{2}$/.test(text))) throw new Error(`Field "${field.name}" needs a date as YYYY-MM-DD`)
        if (field.kind === 'datetime' && !(valid && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(text))) {
          throw new Error(`Field "${field.name}" needs a local date and time as YYYY-MM-DD HH:mm`)
        }
        values[field.id] = text
        break
      }
      case 'time': {
        const text = String(raw).trim()
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error(`Field "${field.name}" needs a time as HH:mm`)
        values[field.id] = text
        break
      }
      case 'single':
      case 'multi': {
        const labels = Array.isArray(raw) ? raw.map(String) : [String(raw)]
        const ids = labels.map((label) => {
          const option = field.options.find((o) => norm(o.label) === norm(label))
          if (!option) throw new Error(`Field "${field.name}" has no option "${label}"; options: ${field.options.map((o) => o.label).join(', ')}`)
          return option.id
        })
        values[field.id] = field.kind === 'single' ? ids[0] : ids
        break
      }
    }
  }
  return values
}

async function getType(typeId: string) {
  const type = await db.types.get(typeId)
  if (!type) throw new Error(`No type with id ${typeId}`)
  return type
}

async function getEntry(id: string) {
  const entry = await db.entries.get(id)
  if (!entry) throw new Error(`No entry with id ${id}`)
  return entry
}

async function getTag(id: string) {
  const tag = await db.tags.get(id)
  if (!tag) throw new Error(`No tag with id ${id}`)
  return tag
}

// Одноимённые теги неразличимы при выборе, поэтому имя тега уникально
async function checkTagName(name: string, exceptId?: string) {
  const same = (await db.tags.toArray()).find((t) => t.id !== exceptId && norm(t.name) === norm(name))
  if (same) throw new Error(`Tag "${same.name}" already exists with id ${same.id}${same.status === 'archived' ? ', archived' : ''}`)
}

async function checkCategory(id: string) {
  if (!(await db.categories.get(id))) throw new Error(`No category with id ${id}; see list_tags`)
}

async function checkTags(ids: string[]) {
  const found = await db.tags.bulkGet(ids)
  const missing = ids.filter((_, i) => !found[i])
  if (missing.length) throw new Error(`No tags with ids ${missing.join(', ')}`)
}

// Текст записи — не Markdown, а маркеры как в Телеграме: модели по привычке пишут заголовки, списки и *курсив*
const entryTextSchema = z
  .string()
  .describe(
    'Entry text. It is not Markdown: the feed supports only this markup — **bold**, __italic__ (double underscores; single * or _ stay as typed), ' +
      '~~strikethrough~~, ||spoiler||, `inline code`, a code block between lines of ```, quote lines starting with "> ", links [text](https://url), ' +
      'links to other feed entries [short label](entry:ENTRY_ID), which open that entry, ' +
      'and links to feed filters [short label](filter:CODE) with a link from search_entries, which open the feed filtered. ' +
      'There are no headings, tables, images, or nested lists: write them as plain lines. Line breaks are kept as typed.',
  )

const fieldsSchema = z
  .record(z.string(), z.union([z.number(), z.string(), z.array(z.string()), z.null()]))
  .describe('Field values by field name: numbers for number fields, option labels for choice fields, YYYY-MM-DD for dates, YYYY-MM-DD HH:mm (local) for date-times, HH:mm for times, null clears a field')

// Записи, созданные ассистентом, помнят свой чат
export function writeTools(chatId: string) {
  return {
    create_entry: tool({
      description: 'Create a new entry in the feed at the current time. Adding an archived tag brings it back from the archive.',
      inputSchema: z.object({
        typeId: z.string(),
        text: entryTextSchema,
        fields: fieldsSchema.optional(),
        tagIds: z.array(z.string()).optional(),
        replyTo: z.string().optional().describe('Id of the entry this one replies to'),
      }),
      execute: async (input) => {
        const type = await getType(input.typeId)
        if (input.replyTo) await getEntry(input.replyTo)
        await checkTags(input.tagIds ?? [])
        const id = await addEntry(type, input.text.trim(), toValues(type, input.fields ?? {}, {}), input.tagIds ?? [], input.replyTo ?? null, [], chatId)
        return { id }
      },
    }),

    update_entry: tool({
      description:
        'Change an entry. Omitted properties stay as they are; fields merge into existing values. ' +
        'Changing the type drops values of fields the new type does not have. Creation time never changes.',
      inputSchema: z.object({
        id: z.string(),
        text: entryTextSchema.optional(),
        typeId: z.string().optional(),
        fields: fieldsSchema.optional(),
        tagIds: z.array(z.string()).optional().describe('Replaces the whole list of tags'),
      }),
      execute: async (input) => {
        const entry = await getEntry(input.id)
        const type = await getType(input.typeId ?? entry.typeId)
        if (input.tagIds) await checkTags(input.tagIds)
        const kept = (await db.attachments.where('entryId').equals(entry.id).primaryKeys()) as string[]
        const values = toValues(type, input.fields ?? {}, entry.values)
        await updateEntry(entry.id, type, input.text?.trim() ?? entry.text, values, input.tagIds ?? entry.tagIds, kept, [])
        return { ok: true }
      },
    }),

    set_actuality: tool({
      description: 'Mark an entry as actual or no longer actual. A non-actual entry stays in the feed but needs no attention.',
      inputSchema: z.object({ id: z.string(), actual: z.boolean() }),
      execute: async ({ id, actual }) => {
        await getEntry(id)
        await setActual(id, actual)
        return { ok: true }
      },
    }),

    update_instruction: tool({
      description:
        'Change the general instruction or a saved start instruction. append adds the text as a new paragraph at the end; replace sets the whole text. ' +
        'A start instruction can also be renamed.',
      inputSchema: z.object({
        instruction: z.string().describe("'general' or the id of a start instruction"),
        mode: z.enum(['append', 'replace']),
        text: z.string().min(1),
        name: z.string().optional().describe('New name; start instructions only'),
      }),
      execute: async ({ instruction, mode, text, name }) => {
        const join = (current: string) => (mode === 'append' && current.trim() ? `${current.trim()}\n\n${text.trim()}` : text.trim())
        if (instruction === 'general') {
          const general = await db.settings.get('generalInstruction')
          await db.settings.put({ id: 'generalInstruction', value: join(general?.id === 'generalInstruction' ? general.value : '') })
          return { ok: true }
        }
        const saved = await db.instructions.get(instruction)
        if (!saved) throw new Error(`No start instruction with id ${instruction}`)
        await db.instructions.update(saved.id, { text: join(saved.text), ...(name?.trim() ? { name: name.trim() } : {}) })
        return { ok: true }
      },
    }),

    create_instruction: tool({
      description: 'Save a new start instruction: rules for a typical situation that the user can choose when starting a chat. Returns its id.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Short name the user picks the instruction by'),
        text: z.string().min(1),
      }),
      execute: async ({ name, text }) => {
        const id = crypto.randomUUID()
        await db.instructions.add({ id, name: name.trim(), text: text.trim(), createdAt: Date.now() })
        return { id }
      },
    }),

    delete_instruction: tool({
      description: 'Delete a saved start instruction permanently. Chats started with it keep their copy. The general instruction cannot be deleted.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        if (!(await db.instructions.get(id))) throw new Error(`No start instruction with id ${id}`)
        await db.instructions.delete(id)
        return { ok: true }
      },
    }),

    create_tag: tool({
      description: 'Create an active tag.',
      inputSchema: z.object({
        name: z.string().min(1),
        categoryId: z.string().optional().describe('Category id from list_tags; without it the tag has no category'),
      }),
      execute: async ({ name, categoryId }) => {
        await checkTagName(name)
        if (categoryId) await checkCategory(categoryId)
        const tag = await createTag(name.trim(), categoryId ?? null)
        return { id: tag.id }
      },
    }),

    update_tag: tool({
      description: 'Rename a tag or move an active tag to another category. Omitted properties stay as they are.',
      inputSchema: z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        categoryId: z.string().nullable().optional().describe('Category id, null for no category; active tags only'),
      }),
      execute: async ({ id, name, categoryId }) => {
        const tag = await getTag(id)
        if (name) await checkTagName(name, id)
        if (categoryId !== undefined) {
          if (tag.status === 'archived') throw new Error('An archived tag keeps the category it had; restore it first')
          if (categoryId) await checkCategory(categoryId)
        }
        await db.tags.update(id, { ...(name ? { name: name.trim() } : {}), ...(categoryId !== undefined ? { categoryId } : {}) })
        return { ok: true }
      },
    }),

    archive_tag: tool({
      description: 'Archive a tag that is no longer used. Its entries keep it; the feed marks the moment. Adding it to an entry later brings it back.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const tag = await getTag(id)
        if (tag.status === 'active') await archiveTag(tag)
        return { ok: true }
      },
    }),

    restore_tag: tool({
      description: 'Bring an archived tag back to its category, if the category still exists.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const tag = await getTag(id)
        if (tag.status === 'archived') await restoreTag(tag)
        return { ok: true }
      },
    }),

    delete_tag: tool({
      description:
        'Delete a tag permanently. It is removed from all its entries, which stay in the feed; saved filters with it no longer match anything by it. ' +
        'Prefer archive_tag for a tag that is just no longer used.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        await getTag(id)
        const untagged = await db.entries.where('tagIds').equals(id).count()
        await deleteTag(id)
        return { ok: true, untaggedEntries: untagged }
      },
    }),

    delete_entry: tool({
      description: 'Delete an entry permanently with its attachments. Replies to it stay in the feed.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        await getEntry(id)
        await deleteEntry(id)
        return { ok: true }
      },
    }),
  }
}

const writeToolNames = [
  'create_entry',
  'update_entry',
  'set_actuality',
  'create_instruction',
  'update_instruction',
  'delete_instruction',
  'create_tag',
  'update_tag',
  'archive_tag',
  'restore_tag',
  'delete_tag',
  'delete_entry',
] as const

// Действия с тегами: запрос разрешения показывает тег, а не запись
export const tagToolNames = ['create_tag', 'update_tag', 'archive_tag', 'restore_tag', 'delete_tag']

// Какие изменения ассистент делает только после разрешения пользователя
export function approvalFor(permission: Permission) {
  const ask = permission === 'ask' ? writeToolNames : permission === 'ask-delete' ? (['delete_entry', 'delete_instruction', 'delete_tag'] as const) : []
  return Object.fromEntries(ask.map((name) => [name, 'user-approval' as const]))
}

// Совместимые с OpenAI API не принимают файлы в ответе инструмента: картинка ушла бы строкой base64
export function activeToolsFor(permission: Permission, providerKind: ProviderKind) {
  const read = (Object.keys(readTools) as (keyof typeof readTools)[]).filter((name) => name !== 'view_attachments' || providerKind !== 'openai-compatible')
  return permission === 'read' ? read : [...read, ...writeToolNames]
}

export const permissionLabels: Record<Permission, string> = {
  read: 'Только чтение',
  ask: 'С разрешения',
  'ask-delete': 'Удаление с разрешения',
  full: 'Полные права',
}

export const toolLabels: Record<string, string> = {
  list_types: 'Смотрю типы',
  list_tags: 'Смотрю теги',
  search_entries: 'Ищу записи',
  view_attachments: 'Смотрю вложения',
  list_instructions: 'Смотрю инструкции',
  create_instruction: 'Создаю инструкцию',
  update_instruction: 'Правлю инструкцию',
  delete_instruction: 'Удаляю инструкцию',
  create_tag: 'Создаю тег',
  update_tag: 'Правлю тег',
  archive_tag: 'Убираю тег в архив',
  restore_tag: 'Возвращаю тег из архива',
  delete_tag: 'Удаляю тег',
  create_entry: 'Создаю запись',
  update_entry: 'Правлю запись',
  set_actuality: 'Меняю актуальность',
  delete_entry: 'Удаляю запись',
}

// Название действия в запросе разрешения
export const approvalLabels: Record<string, string> = {
  create_entry: 'Создать запись',
  update_entry: 'Изменить запись',
  set_actuality: 'Изменить актуальность записи',
  create_instruction: 'Создать стартовую инструкцию',
  update_instruction: 'Изменить инструкцию',
  delete_instruction: 'Удалить стартовую инструкцию',
  create_tag: 'Создать тег',
  update_tag: 'Изменить тег',
  archive_tag: 'Убрать тег в архив',
  restore_tag: 'Вернуть тег из архива',
  delete_tag: 'Удалить тег безвозвратно',
  delete_entry: 'Удалить запись безвозвратно',
}
