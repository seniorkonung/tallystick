import { create } from 'zustand'
import { focusEntry } from './focusEntry'

// Открытый чат поверх ленты: id или 'new' — новый чат до первого сообщения
export const useChatView = create<{ chatId: string | null }>(() => ({ chatId: null }))

// Открытие чата — шаг истории, чтобы системное «назад» возвращало в ленту
export function openChat(chatId: string) {
  history.pushState({ chat: chatId }, '')
  useChatView.setState({ chatId })
}

export function closeChat() {
  history.back()
}

// Лента лежит под чатом: сначала закрываем чат, потом ищем запись
export function goToEntry(entryId: string) {
  window.addEventListener('popstate', () => focusEntry(entryId), { once: true })
  closeChat()
}
