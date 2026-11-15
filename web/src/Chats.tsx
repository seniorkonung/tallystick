import type { ModelMessage } from 'ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { openChat } from './chatView'
import { db } from './db'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function when(time: number) {
  return new Date(time).toDateString() === new Date().toDateString() ? timeFormat.format(time) : dayFormat.format(time)
}

// Ищется текст пользователя и ассистента; результаты инструментов — копии ленты, их нет в поиске
function searchableText(message: ModelMessage) {
  if (message.role !== 'user' && message.role !== 'assistant') return ''
  if (typeof message.content === 'string') return message.content
  return message.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join(' ')
}

// Все чаты от новых к старым
export function Chats({ onClose }: { onClose: () => void }) {
  const chats = useLiveQuery(() => db.chats.orderBy('updatedAt').reverse().toArray())
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matchedIds = useLiveQuery(async () => {
    if (!q) return null
    const ids = new Set<string>()
    await db.chatMessages.each((m) => {
      if (!ids.has(m.chatId) && searchableText(m.message).toLowerCase().includes(q)) ids.add(m.chatId)
    })
    return ids
  }, [q])
  if (!chats) return null

  const shown = q ? chats.filter((c) => c.title.toLowerCase().includes(q) || matchedIds?.has(c.id)) : chats

  function open(chatId: string) {
    onClose()
    openChat(chatId)
  }

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" aria-label="Закрыть чаты" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100" onClick={onClose}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 font-semibold">Чаты</h1>
        <button type="button" className="rounded-full px-3 py-1.5 text-sm font-medium text-orange-700" onClick={() => open('new')}>
          Новый чат
        </button>
      </header>
      <div className="px-4 py-3">
        <input
          value={query}
          placeholder="Поиск по чатам"
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-2xl bg-white px-3 py-2 shadow-sm outline-none"
        />
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {shown.map((chat) => (
          <li key={chat.id}>
            <button type="button" className="flex w-full items-baseline gap-3 rounded-2xl px-3 py-3 text-left hover:bg-stone-100" onClick={() => open(chat.id)}>
              <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              <span className="shrink-0 text-xs text-stone-400">{when(chat.updatedAt)}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-10 text-center text-sm text-stone-400">{q ? 'Ничего не найдено' : 'Чатов пока нет'}</li>}
      </ul>
    </div>
  )
}
