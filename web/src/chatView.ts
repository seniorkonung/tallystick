import { create } from 'zustand'

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
