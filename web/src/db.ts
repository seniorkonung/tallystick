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
}

export const db = new Dexie('tallystick') as Dexie & {
  types: EntityTable<EntryType, 'id'>
  entries: EntityTable<Entry, 'id'>
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

export async function addEntry(type: EntryType, text: string, values: FieldValues) {
  await db.entries.add({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    text,
    typeId: type.id,
    values: valuesForType(type, values),
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
