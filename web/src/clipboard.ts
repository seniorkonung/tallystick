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
  } catch (error) {
    window.alert(`Не удалось скопировать: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Копируется текст записи без маркеров; скрытый текст раскрыт
export function copyEntryText(entry: Entry) {
  return copyText(plainText(entry.text))
}

// Записи с текстом в порядке ленты, перед каждой — дата и время
export function copyEntriesText(entries: Entry[]) {
  const text = entries
    .filter((e) => e.text)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((e) => `${when(e.createdAt)}\n${plainText(e.text)}`)
    .join('\n\n')
  return copyText(text)
}
