import type { ModelMessage } from 'ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from './Markdown'
import { lastModel, run, sendMessage, stop, useRuns, type RunItem } from './assistant'
import { toolLabels } from './assistantTools'
import { closeChat, useChatView } from './chatView'
import { db } from './db'

export function ChatScreen() {
  const chatId = useChatView((s) => s.chatId)
  if (!chatId) return null
  return <ChatView key={chatId} chatId={chatId} />
}

// Текст сообщения без вызовов инструментов
function textOf(message: ModelMessage) {
  if (typeof message.content === 'string') return message.content
  return message.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n')
}

function ChatView({ chatId }: { chatId: string }) {
  const isNew = chatId === 'new'
  const chat = useLiveQuery(() => (isNew ? undefined : db.chats.get(chatId)), [chatId])
  const messages = useLiveQuery(() => (isNew ? [] : db.chatMessages.where('chatId').equals(chatId).sortBy('createdAt')), [chatId])
  const providers = useLiveQuery(() => db.providers.orderBy('createdAt').toArray())
  const runState = useRuns((s) => s[chatId])
  const [text, setText] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  if (!messages || !providers) return null

  const options = providers.flatMap((p) => p.models.map((model) => ({ value: `${p.id}|${model}`, provider: p, model })))
  // Модель чата, иначе последняя выбранная, иначе первая доступная
  const saved = chat?.providerId ? `${chat.providerId}|${chat.model}` : lastModel() && `${lastModel()!.providerId}|${lastModel()!.model}`
  const selected = options.find((o) => o.value === (choice ?? saved)) ?? options[0]
  const running = runState?.running ?? false
  const canSend = !running && !!selected && text.trim() !== ''

  async function send() {
    if (!canSend) return
    const message = text.trim()
    setText('')
    const id = await sendMessage(chatId, message, selected.provider.id, selected.model)
    // Новый чат получил id: экран остаётся тем же шагом истории
    if (isNew) useChatView.setState({ chatId: id })
  }

  return (
    <div className="fixed inset-0 z-10 mx-auto flex max-w-xl flex-col bg-stone-50">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" aria-label="Назад в ленту" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100" onClick={closeChat}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="min-w-0 truncate font-semibold">{chat?.title ?? 'Новый чат'}</h1>
      </header>

      {/* column-reverse держит прокрутку у последнего сообщения */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto overscroll-y-contain">
        <div className="flex flex-col gap-3 px-4 py-4">
          {messages.length === 0 && !running && (
            <p className="py-10 text-center text-sm text-stone-400">Спросите о своих записях: ассистент видит всю ленту</p>
          )}
          {messages.map((m) => (
            <MessageView key={m.id} message={m.message} />
          ))}
          {runState?.items.map((item, i) => <RunItemView key={i} item={item} />)}
          {running && runState.items.length === 0 && <p className="text-sm text-stone-400">Думаю…</p>}
          {runState?.error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="break-words">Ошибка: {runState.error}</p>
              <button type="button" className="mt-1 font-medium" onClick={() => void run(chatId)}>
                Повторить
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="rounded-3xl border border-stone-200 bg-white p-2 shadow-sm">
          <textarea
            ref={textarea}
            value={text}
            rows={1}
            placeholder="Спросите ассистента"
            className="block max-h-[200px] w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-stone-400"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            {options.length > 0 ? (
              <select
                aria-label="Модель"
                value={selected.value}
                onChange={(e) => setChoice(e.target.value)}
                className="min-w-0 rounded-full bg-transparent px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                {providers.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.models.map((model) => (
                      <option key={model} value={`${p.id}|${model}`}>
                        {model}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <p className="px-2 text-xs text-stone-500">Добавьте провайдера в настройках — шестерёнка в боковой панели</p>
            )}
            {running ? (
              <button
                type="button"
                aria-label="Остановить"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white"
                onClick={() => stop(chatId)}
              >
                <span className="size-3.5 rounded-sm bg-white" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Отправить"
                disabled={!canSend}
                onClick={() => void send()}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white disabled:bg-stone-200"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageView({ message }: { message: ModelMessage }) {
  switch (message.role) {
    case 'user':
      return (
        <div className="max-w-[85%] self-end rounded-2xl bg-white px-3.5 py-2 text-[15px] whitespace-pre-wrap shadow-sm">{textOf(message)}</div>
      )
    case 'assistant':
      if (typeof message.content === 'string') return <Markdown text={message.content} />
      return (
        <>
          {message.content.map((part, i) =>
            part.type === 'text' ? (
              <Markdown key={i} text={part.text} />
            ) : part.type === 'tool-call' ? (
              <ToolLine key={i} name={part.toolName} failed={false} />
            ) : null,
          )}
        </>
      )
    default:
      return null
  }
}

function RunItemView({ item }: { item: RunItem }) {
  return item.kind === 'text' ? <Markdown text={item.text} /> : <ToolLine name={item.name} failed={item.failed} />
}

function ToolLine({ name, failed }: { name: string; failed: boolean }) {
  return (
    <p className={`text-xs ${failed ? 'text-red-600' : 'text-stone-400'}`}>
      {toolLabels[name] ?? name}
      {failed && ' — ошибка'}
    </p>
  )
}
