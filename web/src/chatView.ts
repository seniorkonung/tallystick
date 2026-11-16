import { create } from 'zustand'
import { db } from './db'
import { focusEntry } from './focusEntry'

// Открытый чат поверх ленты: id или 'new' — новый чат до первого сообщения.
// entryIds — записи, которые прикрепляются к первому сообщению при открытии
export const useChatView = create<{ chatId: string | null; entryIds: string[] }>(() => ({ chatId: null, entryIds: [] }))

// Открытие чата — шаг истории, чтобы системное «назад» возвращало в ленту
export function openChat(chatId: string, entryIds: string[] = []) {
  history.pushState({ chat: chatId }, '')
  useChatView.setState({ chatId, entryIds })
}

// Новый чат с прикреплёнными записями в порядке ленты
export async function openChatWithEntries(entryIds: string[]) {
  const entries = (await db.entries.bulkGet(entryIds)).flatMap((e) => e ?? [])
  openChat('new', entries.sort((a, b) => a.createdAt - b.createdAt).map((e) => e.id))
}

export function closeChat() {
  history.back()
}

// Лента лежит под чатом: сначала закрываем чат, потом ищем запись
export function goToEntry(entryId: string) {
  window.addEventListener('popstate', () => focusEntry(entryId), { once: true })
  closeChat()
}
