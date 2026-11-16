import { db, type Entry, type EntryType } from './db'
import { plainText } from './format'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const dateWithYearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function when(time: number) {
  return new Date(time).getFullYear() === new Date().getFullYear() ? dateFormat.format(time) : dateWithYearFormat.format(time)
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    window.alert(`Не удалось скопировать: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

// Последние скопированные записи. Вставленный в поле чата их текст заменяется самими записями.
// Отметку в самом буфере обмена клавиатуры телефонов теряют, поэтому вставка узнаётся по тексту
const copiedEntriesKey = 'tallystick.copiedEntries'

async function copyEntries(text: string, entryIds: string[]) {
  if (await copyText(text)) localStorage.setItem(copiedEntriesKey, JSON.stringify({ text, entryIds }))
}

// Если новое значение поля получено вставкой скопированных записей — значение без их текста, место вставки,
// вставленный текст и сами записи
export function takePastedEntries(previous: string, next: string) {
  const copied: { text: string; entryIds: string[] } | null = JSON.parse(localStorage.getItem(copiedEntriesKey) ?? 'null')
  // Текст должен появиться одним куском: набранный по буквам не считается
  if (!copied || next.length - previous.length < copied.text.length) return null
  // Вставка начинается не дальше первого изменённого символа
  let changed = 0
  while (changed < previous.length && previous[changed] === next[changed]) changed++
  for (let at = Math.min(changed, next.length - copied.text.length); at >= Math.max(0, changed - copied.text.length); at--) {
    if (next.startsWith(copied.text, at)) {
      return { text: next.slice(0, at) + next.slice(at + copied.text.length), at, pastedText: copied.text, entryIds: copied.entryIds }
    }
  }
  return null
}

const labelDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

// Подпись ссылки на запись — начало её первой строки, а без текста — тип и дата. Подпись остаётся такой,
// какой была при вставке: её можно переписать по-своему
function entryLabel(entry: Entry, types: EntryType[]) {
  const line = plainText(entry.text, { hideSpoilers: true }).split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const label = line
    ? line.length > 40 ? `${line.slice(0, 40).trimEnd()}…` : line
    : `${types.find((t) => t.id === entry.typeId)?.name ?? 'Запись'}, ${labelDateFormat.format(entry.createdAt)}`
  // Квадратные скобки сломали бы разметку ссылки
  return label.replace(/[[\]]/g, '')
}

// Ссылки на записи для текста записи, каждая на своей строке
export async function entryLinks(entryIds: string[]) {
  const [entries, types] = await Promise.all([db.entries.bulkGet(entryIds), db.types.toArray()])
  return entries.flatMap((e) => (e ? [`[${entryLabel(e, types)}](entry:${e.id})`] : [])).join('\n')
}

// Копируется текст записи без маркеров; скрытый текст раскрыт
export function copyEntryText(entry: Entry) {
  return copyEntries(plainText(entry.text), [entry.id])
}

// Записи с текстом в порядке ленты, перед каждой — дата и время
export function copyEntriesText(entries: Entry[]) {
  const copied = entries.filter((e) => e.text).sort((a, b) => a.createdAt - b.createdAt)
  const text = copied.map((e) => `${when(e.createdAt)}\n${plainText(e.text)}`).join('\n\n')
  return copyEntries(text, copied.map((e) => e.id))
}
