import type { Entry } from './db'
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

// Если новое значение поля получено вставкой скопированных записей — значение без их текста и сами записи
export function takePastedEntries(previous: string, next: string): { text: string; entryIds: string[] } | null {
  const copied: { text: string; entryIds: string[] } | null = JSON.parse(localStorage.getItem(copiedEntriesKey) ?? 'null')
  // Текст должен появиться одним куском: набранный по буквам не считается
  if (!copied || next.length - previous.length < copied.text.length || !next.includes(copied.text)) return null
  return { text: next.replace(copied.text, ''), entryIds: copied.entryIds }
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
