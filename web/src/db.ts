import Dexie, { type EntityTable } from 'dexie'

export type EntryType = {
  id: string
  name: string
  createdAt: number
}

export type Entry = {
  id: string
  createdAt: number
  text: string
  typeId: string
}

export const db = new Dexie('tallystick') as Dexie & {
  types: EntityTable<EntryType, 'id'>
  entries: EntityTable<Entry, 'id'>
}

db.version(1).stores({
  types: 'id, createdAt',
  entries: 'id, createdAt',
})

// При первом запуске всегда есть хотя бы один тип
db.on('populate', (tx) => {
  tx.table('types').add({ id: crypto.randomUUID(), name: 'Заметка', createdAt: Date.now() })
})

export async function addEntry(text: string) {
  const type = await db.types.orderBy('createdAt').first()
  if (!type) throw new Error('Нет ни одного типа')
  await db.entries.add({ id: crypto.randomUUID(), createdAt: Date.now(), text, typeId: type.id })
}
