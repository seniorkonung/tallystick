import type { ModelMessage } from 'ai'
import Dexie, { type EntityTable } from 'dexie'
import type { Filters } from './filterStore'
import type { ModelCatalog } from './modelCatalog'

export type FieldOption = { id: string; label: string }

export type Field =
  | { id: string; name: string; kind: 'single' | 'multi'; options: FieldOption[] }
  | { id: string; name: string; kind: 'number' }
  | { id: string; name: string; kind: 'string' }

export type FieldKind = Field['kind']

// single — id варианта, multi — id вариантов, number — число, string — строка
export type FieldValue = string | string[] | number

export type FieldValues = Record<string, FieldValue>

export type EntryType = {
  id: string
  name: string
  createdAt: number
  fields: Field[]
}

export type Entry = {
  id: string
  createdAt: number
  text: string
  typeId: string
  values: FieldValues
  tagIds: string[]
  // Неактуальная запись больше не требует внимания, но остаётся в ленте
  actual: boolean
  // Исходная запись, на которую это ответ
  replyTo: string | null
  // Чат, из которого запись попала в ленту
  chatId: string | null
}

export type TagStatus = 'active' | 'archived'

export type Tag = {
  id: string
  name: string
  // Индекс в палитре tagColors
  color: number
  status: TagStatus
  categoryId: string | null
  // Название категории на момент ухода в архив: тег в архиве её замораживает
  frozenCategoryName: string | null
  // Дата ухода в архив; даты начала у тега нет
  archivedAt: number | null
}

export type Category = {
  id: string
  name: string
  createdAt: number
}

export type MarkKind = 'archived' | 'restored'

// Служебная отметка в ленте — её создаёт приложение, это не запись
export type Mark = {
  id: string
  createdAt: number
  tagId: string
  kind: MarkKind
  // Число записей тега на момент ухода в архив
  entryCount: number | null
}

// Вложение записи: файл целиком и превью для ленты
export type Attachment = {
  id: string
  entryId: string
  createdAt: number
  name: string
  mime: string
  size: number
  blob: Blob
  // Уменьшенная картинка для фото и видео; у прочих файлов её нет
  thumb: Blob | null
}

// Именованный снимок фильтров: применение копирует фильтры в ленту, их дальнейшие изменения пресет не меняют
export type Preset = {
  id: string
  name: string
  createdAt: number
  // Позиция в боковой панели
  order: number
  filters: Filters
}

// Настройки приложения по ключу
export type Setting =
  // Порядок вкладок выбора тегов: 'all', 'archived' и id категорий
  | { id: 'tagTabOrder'; value: string[] }
  | { id: 'modelCatalog'; value: ModelCatalog }
  // Общая инструкция ассистенту: действует во всех чатах
  | { id: 'generalInstruction'; value: string }
  // Категории, теги которых показывает статистика; null — теги без категории, пустой список — все теги
  | { id: 'statsCategories'; value: (string | null)[] }

// Вложение, подготовленное к сохранению: превью уже построено
export type PreparedFile = Omit<Attachment, 'id' | 'entryId' | 'createdAt'>

export type ProviderKind = 'anthropic' | 'openai' | 'openai-compatible'

// Провайдер языковых моделей с ключом пользователя
export type Provider = {
  id: string
  name: string
  kind: ProviderKind
  // Пустой — адрес провайдера по умолчанию; у совместимого с OpenAI обязателен
  baseURL: string
  apiKey: string
  models: string[]
  createdAt: number
}

// Что ассистент может делать с лентой без запроса пользователю
export type Permission = 'read' | 'ask' | 'ask-delete' | 'full'

// Стартовая инструкция ассистенту для типовой ситуации, например учёта калорий
export type Instruction = {
  id: string
  name: string
  text: string
  createdAt: number
}

// Насколько глубоко модель размышляет перед ответом; provider-default — как решит провайдер
export type Reasoning = 'provider-default' | 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

// Переписка с ассистентом; не запись и не часть ленты
export type Chat = {
  id: string
  createdAt: number
  // Время последнего сообщения: по нему упорядочен список чатов
  updatedAt: number
  title: string
  providerId: string | null
  model: string | null
  permission: Permission
  reasoning: Reasoning
  // Сколько токенов занимает переписка по последнему ответу провайдера; null — ответа после правки ещё не было
  contextTokens: number | null
  // Копия стартовой инструкции на момент первого сообщения: правка инструкции начатый чат не меняет
  instruction: { name: string; text: string } | null
}

// Сообщение в формате AI SDK: текст, вызовы инструментов и их результаты
export type ChatMessage = {
  id: string
  chatId: string
  createdAt: number
  message: ModelMessage
  // Вложения сообщения пользователя: модели они уходят только при запросе
  fileIds?: string[]
  // Записи ленты, прикреплённые к сообщению пользователя; модель видит их в нынешнем виде
  entryIds?: string[]
}

// Вложение сообщения в чате; устроено как вложение записи
export type ChatFile = PreparedFile & {
  id: string
  chatId: string
  messageId: string
  createdAt: number
}

export const db = new Dexie('tallystick') as Dexie & {
  types: EntityTable<EntryType, 'id'>
  entries: EntityTable<Entry, 'id'>
  tags: EntityTable<Tag, 'id'>
  categories: EntityTable<Category, 'id'>
  marks: EntityTable<Mark, 'id'>
  attachments: EntityTable<Attachment, 'id'>
  presets: EntityTable<Preset, 'id'>
  providers: EntityTable<Provider, 'id'>
  chats: EntityTable<Chat, 'id'>
  chatMessages: EntityTable<ChatMessage, 'id'>
  chatFiles: EntityTable<ChatFile, 'id'>
  settings: EntityTable<Setting, 'id'>
  instructions: EntityTable<Instruction, 'id'>
}

db.version(1).stores({
  types: 'id, createdAt',
  entries: 'id, createdAt',
})

db.version(2)
  .stores({ entries: 'id, createdAt, typeId' })
  .upgrade(async (tx) => {
    await tx.table('types').toCollection().modify((type) => {
      type.fields ??= []
    })
    await tx.table('entries').toCollection().modify((entry) => {
      entry.values ??= {}
    })
  })

db.version(3)
  .stores({
    entries: 'id, createdAt, typeId, *projectIds',
    projects: 'id, status',
    categories: 'id, createdAt',
    marks: 'id, createdAt',
  })
  .upgrade(async (tx) => {
    await tx.table('entries').toCollection().modify((entry) => {
      entry.projectIds ??= []
    })
  })

db.version(4)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('entries').toCollection().modify((entry) => {
      entry.actual ??= true
    })
  })

db.version(5)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('entries').toCollection().modify((entry) => {
      entry.replyTo ??= null
    })
  })

db.version(6).stores({ attachments: 'id, entryId, createdAt' })

db.version(7).stores({ presets: 'id, order' })

db.version(8).stores({ providers: 'id, createdAt' })

db.version(9).stores({ chats: 'id, updatedAt', chatMessages: 'id, chatId, createdAt' })

db.version(10)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('entries').toCollection().modify((entry) => {
      entry.chatId ??= null
    })
    await tx.table('chats').toCollection().modify((chat) => {
      chat.permission ??= 'ask'
    })
  })

db.version(11).stores({ chatFiles: 'id, chatId, createdAt' })

// У тега нет даты начала, а его создание больше не отмечается в ленте
db.version(12)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('marks').filter((mark) => mark.kind === 'started').delete()
    await tx.table('projects').toCollection().modify((project) => {
      delete project.startedAt
    })
  })

// Проекты переименованы в теги. Данные копируются под новые имена, а старые таблица и поля остаются
// снимком для отката до версии 14. Вид отметки меняется на месте
db.version(13)
  .stores({ tags: 'id, status', entries: 'id, createdAt, typeId, *projectIds, *tagIds' })
  .upgrade(async (tx) => {
    const projects = await tx.table('projects').toArray()
    await tx.table('tags').bulkPut(
      projects.map(({ completedAt, status, ...project }) => ({
        ...project,
        status: status === 'completed' ? 'archived' : 'active',
        archivedAt: completedAt ?? null,
      })),
    )
    await tx.table('entries').toCollection().modify((entry) => {
      entry.tagIds = entry.projectIds ?? []
    })
    await tx.table('marks').toCollection().modify((mark) => {
      mark.tagId = mark.projectId
      mark.kind = mark.kind === 'completed' ? 'archived' : 'restored'
    })
    await tx.table('presets').toCollection().modify((preset) => {
      preset.filters.tagIds = preset.filters.projectIds ?? []
    })
  })

// Переход на теги проверен: старые таблица и поля удаляются
db.version(14)
  .stores({ projects: null, entries: 'id, createdAt, typeId, *tagIds' })
  .upgrade(async (tx) => {
    await tx.table('entries').toCollection().modify((entry) => {
      delete entry.projectIds
    })
    await tx.table('marks').toCollection().modify((mark) => {
      delete mark.projectId
    })
    await tx.table('presets').toCollection().modify((preset) => {
      delete preset.filters.projectIds
    })
  })

db.version(15).stores({ settings: 'id' })

// У числовых полей больше нет единицы измерения
db.version(16)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('types').toCollection().modify((type) => {
      for (const field of type.fields) delete field.unit
    })
  })

db.version(17)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('chats').toCollection().modify((chat) => {
      chat.reasoning ??= 'provider-default'
    })
  })

db.version(18)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('chats').toCollection().modify((chat) => {
      chat.contextTokens ??= null
    })
  })

db.version(19)
  .stores({ instructions: 'id, createdAt' })
  .upgrade(async (tx) => {
    await tx.table('chats').toCollection().modify((chat) => {
      chat.instruction ??= null
    })
  })

// При первом запуске всегда есть хотя бы один тип
db.on('populate', (tx) => {
  tx.table('types').add({ id: crypto.randomUUID(), name: 'Заметка', createdAt: Date.now(), fields: [] })
})

export function isEmptyValue(value: FieldValue | undefined) {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

// Оставляет только заполненные значения полей этого типа
export function valuesForType(type: EntryType, values: FieldValues): FieldValues {
  const result: FieldValues = {}
  for (const field of type.fields) {
    const value = values[field.id]
    if (!isEmptyValue(value)) result[field.id] = value
  }
  return result
}

// Привязка записи к тегу в архиве возвращает его из архива
export async function addEntry(
  type: EntryType,
  text: string,
  values: FieldValues,
  tagIds: string[],
  replyTo: string | null,
  files: PreparedFile[],
  chatId: string | null = null,
) {
  return db.transaction('rw', [db.entries, db.tags, db.categories, db.marks, db.attachments], async () => {
    const now = Date.now()
    const tags = await db.tags.bulkGet(tagIds)
    for (const tag of tags) {
      if (tag?.status === 'archived') await restoreTag(tag, now)
    }
    const entryId = crypto.randomUUID()
    await addAttachments(entryId, files, now)
    await db.entries.add({
      id: entryId,
      createdAt: now,
      text,
      typeId: type.id,
      values: valuesForType(type, values),
      tagIds,
      actual: true,
      replyTo,
      chatId,
    })
    return entryId
  })
}

// Время записи не меняется; добавленный тег из архива возвращается, как и при создании
export async function updateEntry(
  entryId: string,
  type: EntryType,
  text: string,
  values: FieldValues,
  tagIds: string[],
  // Оставленные вложения записи; остальные удаляются
  keptAttachmentIds: string[],
  files: PreparedFile[],
) {
  await db.transaction('rw', [db.entries, db.tags, db.categories, db.marks, db.attachments], async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const added = tagIds.filter((id) => !entry.tagIds.includes(id))
    for (const tag of await db.tags.bulkGet(added)) {
      if (tag?.status === 'archived') await restoreTag(tag)
    }
    await db.attachments
      .where('entryId')
      .equals(entryId)
      .filter((a) => !keptAttachmentIds.includes(a.id))
      .delete()
    await addAttachments(entryId, files, Date.now())
    await db.entries.update(entryId, { text, typeId: type.id, values: valuesForType(type, values), tagIds })
  })
}

async function addAttachments(entryId: string, files: PreparedFile[], now: number) {
  // Порядок вложений — порядок добавления
  await db.attachments.bulkAdd(files.map((f, i) => ({ ...f, id: crypto.randomUUID(), entryId, createdAt: now + i })))
}

// Запись удаляется безвозвратно вместе с вложениями; ответы на неё остаются в ленте
export async function deleteEntry(entryId: string) {
  await db.transaction('rw', db.entries, db.attachments, async () => {
    await db.attachments.where('entryId').equals(entryId).delete()
    await db.entries.delete(entryId)
  })
}

export async function setActual(entryId: string, actual: boolean) {
  await db.entries.update(entryId, { actual })
}

// Групповые действия над выделенными записями

export async function deleteEntries(entryIds: string[]) {
  await db.transaction('rw', db.entries, db.attachments, async () => {
    await db.attachments.where('entryId').anyOf(entryIds).delete()
    await db.entries.bulkDelete(entryIds)
  })
}

export async function setEntriesActual(entryIds: string[], actual: boolean) {
  await db.entries.where('id').anyOf(entryIds).modify({ actual })
}

// Тег добавляется всем записям или снимается со всех; добавленный тег из архива возвращается
export async function setEntriesTag(entryIds: string[], tag: Tag, on: boolean) {
  await db.transaction('rw', [db.entries, db.tags, db.categories, db.marks], async () => {
    if (on && tag.status === 'archived') await restoreTag(tag)
    await db.entries
      .where('id')
      .anyOf(entryIds)
      .modify((entry) => {
        const has = entry.tagIds.includes(tag.id)
        if (on && !has) entry.tagIds = [...entry.tagIds, tag.id]
        if (!on && has) entry.tagIds = entry.tagIds.filter((id) => id !== tag.id)
      })
  })
}

async function addMark(tagId: string, kind: MarkKind, createdAt: number, entryCount: number | null = null) {
  await db.marks.add({ id: crypto.randomUUID(), createdAt, tagId, kind, entryCount })
}

export async function createTag(name: string, categoryId: string | null) {
  const tag: Tag = {
    id: crypto.randomUUID(),
    name,
    color: (await db.tags.count()) % 7,
    status: 'active',
    categoryId,
    frozenCategoryName: null,
    archivedAt: null,
  }
  // Создание тега в ленте не отмечается
  await db.tags.add(tag)
  return tag
}

export async function archiveTag(tag: Tag) {
  await db.transaction('rw', db.entries, db.tags, db.categories, db.marks, async () => {
    const now = Date.now()
    const category = tag.categoryId ? await db.categories.get(tag.categoryId) : undefined
    const entryCount = await db.entries.where('tagIds').equals(tag.id).count()
    await db.tags.update(tag.id, {
      status: 'archived',
      archivedAt: now,
      frozenCategoryName: category?.name ?? null,
    })
    await addMark(tag.id, 'archived', now, entryCount)
  })
}

// Тег возвращается из архива в прежнюю категорию, если она ещё есть
export async function restoreTag(tag: Tag, now = Date.now()) {
  await db.transaction('rw', db.tags, db.categories, db.marks, async () => {
    const category = tag.categoryId ? await db.categories.get(tag.categoryId) : undefined
    await db.tags.update(tag.id, {
      status: 'active',
      archivedAt: null,
      categoryId: category?.id ?? null,
      frozenCategoryName: null,
    })
    await addMark(tag.id, 'restored', now)
  })
}

// Теги удалённой категории остаются без категории
export async function deleteCategory(categoryId: string) {
  await db.transaction('rw', db.tags, db.categories, async () => {
    await db.tags.filter((p) => p.categoryId === categoryId).modify({ categoryId: null })
    await db.categories.delete(categoryId)
  })
}

export async function saveType(type: EntryType) {
  await db.types.put(type)
}

// Записи удаляемого типа переходят в другой тип; значения старых полей теряются
export async function deleteType(typeId: string, targetTypeId: string) {
  await db.transaction('rw', db.types, db.entries, async () => {
    await db.entries.where('typeId').equals(typeId).modify({ typeId: targetTypeId, values: {} })
    await db.types.delete(typeId)
  })
}
