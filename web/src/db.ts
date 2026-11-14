import Dexie, { type EntityTable } from 'dexie'

export type FieldOption = { id: string; label: string }

export type Field =
  | { id: string; name: string; kind: 'single' | 'multi'; options: FieldOption[] }
  | { id: string; name: string; kind: 'number'; unit: string }
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
  projectIds: string[]
  // Неактуальная запись больше не требует внимания, но остаётся в ленте
  actual: boolean
  // Исходная запись, на которую это ответ
  replyTo: string | null
}

export type ProjectStatus = 'active' | 'completed'

export type Project = {
  id: string
  name: string
  // Индекс в палитре projectColors
  color: number
  status: ProjectStatus
  categoryId: string | null
  // Название категории на момент завершения: завершённый проект её замораживает
  frozenCategoryName: string | null
  startedAt: number
  completedAt: number | null
}

export type Category = {
  id: string
  name: string
  createdAt: number
}

export type MarkKind = 'started' | 'completed' | 'reopened'

// Служебная отметка в ленте — её создаёт приложение, это не запись
export type Mark = {
  id: string
  createdAt: number
  projectId: string
  kind: MarkKind
  // Число записей проекта на момент завершения
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

// Вложение, подготовленное к сохранению: превью уже построено
export type PreparedFile = Omit<Attachment, 'id' | 'entryId' | 'createdAt'>

export const db = new Dexie('tallystick') as Dexie & {
  types: EntityTable<EntryType, 'id'>
  entries: EntityTable<Entry, 'id'>
  projects: EntityTable<Project, 'id'>
  categories: EntityTable<Category, 'id'>
  marks: EntityTable<Mark, 'id'>
  attachments: EntityTable<Attachment, 'id'>
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

// Привязка записи к завершённому проекту возобновляет его
export async function addEntry(
  type: EntryType,
  text: string,
  values: FieldValues,
  projectIds: string[],
  replyTo: string | null,
  files: PreparedFile[],
) {
  await db.transaction('rw', [db.entries, db.projects, db.categories, db.marks, db.attachments], async () => {
    const now = Date.now()
    const projects = await db.projects.bulkGet(projectIds)
    for (const project of projects) {
      if (project?.status === 'completed') await reopenProject(project, now)
    }
    const entryId = crypto.randomUUID()
    await addAttachments(entryId, files, now)
    await db.entries.add({
      id: entryId,
      createdAt: now,
      text,
      typeId: type.id,
      values: valuesForType(type, values),
      projectIds,
      actual: true,
      replyTo,
    })
  })
}

// Время записи не меняется; добавленный завершённый проект возобновляется, как и при создании
export async function updateEntry(
  entryId: string,
  type: EntryType,
  text: string,
  values: FieldValues,
  projectIds: string[],
  // Оставленные вложения записи; остальные удаляются
  keptAttachmentIds: string[],
  files: PreparedFile[],
) {
  await db.transaction('rw', [db.entries, db.projects, db.categories, db.marks, db.attachments], async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return
    const added = projectIds.filter((id) => !entry.projectIds.includes(id))
    for (const project of await db.projects.bulkGet(added)) {
      if (project?.status === 'completed') await reopenProject(project)
    }
    await db.attachments
      .where('entryId')
      .equals(entryId)
      .filter((a) => !keptAttachmentIds.includes(a.id))
      .delete()
    await addAttachments(entryId, files, Date.now())
    await db.entries.update(entryId, { text, typeId: type.id, values: valuesForType(type, values), projectIds })
  })
}

async function addAttachments(entryId: string, files: PreparedFile[], now: number) {
  // Порядок вложений — порядок добавления
  await db.attachments.bulkAdd(files.map((f, i) => ({ ...f, id: crypto.randomUUID(), entryId, createdAt: now + i })))
}

export async function setActual(entryId: string, actual: boolean) {
  await db.entries.update(entryId, { actual })
}

async function addMark(projectId: string, kind: MarkKind, createdAt: number, entryCount: number | null = null) {
  await db.marks.add({ id: crypto.randomUUID(), createdAt, projectId, kind, entryCount })
}

export async function createProject(name: string, categoryId: string | null) {
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    color: (await db.projects.count()) % 7,
    status: 'active',
    categoryId,
    frozenCategoryName: null,
    startedAt: Date.now(),
    completedAt: null,
  }
  await db.transaction('rw', db.projects, db.marks, async () => {
    await db.projects.add(project)
    await addMark(project.id, 'started', project.startedAt)
  })
  return project
}

export async function completeProject(project: Project) {
  await db.transaction('rw', db.entries, db.projects, db.categories, db.marks, async () => {
    const now = Date.now()
    const category = project.categoryId ? await db.categories.get(project.categoryId) : undefined
    const entryCount = await db.entries.where('projectIds').equals(project.id).count()
    await db.projects.update(project.id, {
      status: 'completed',
      completedAt: now,
      frozenCategoryName: category?.name ?? null,
    })
    await addMark(project.id, 'completed', now, entryCount)
  })
}

// Проект возвращается в прежнюю категорию, если она ещё есть; дата начала сохраняется
export async function reopenProject(project: Project, now = Date.now()) {
  await db.transaction('rw', db.projects, db.categories, db.marks, async () => {
    const category = project.categoryId ? await db.categories.get(project.categoryId) : undefined
    await db.projects.update(project.id, {
      status: 'active',
      completedAt: null,
      categoryId: category?.id ?? null,
      frozenCategoryName: null,
    })
    await addMark(project.id, 'reopened', now)
  })
}

export async function createCategory(name: string) {
  const category: Category = { id: crypto.randomUUID(), name, createdAt: Date.now() }
  await db.categories.add(category)
  return category
}

// Проекты удалённой категории остаются без категории
export async function deleteCategory(categoryId: string) {
  await db.transaction('rw', db.projects, db.categories, async () => {
    await db.projects.filter((p) => p.categoryId === categoryId).modify({ categoryId: null })
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
