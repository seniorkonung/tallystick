import type { ModelMessage } from 'ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AttachSheet } from './AttachSheet'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { Markdown } from './Markdown'
import { prepareFile } from './attachments'
import { answerApproval, lastModel, lastReasoning, pendingApprovals, reasoningLabels, rememberReasoning, resendFrom, run, sendMessage, stop, useRuns, type RunItem } from './assistant'
import { approvalLabels, toolLabels } from './assistantTools'
import { ChatSettingsSheet } from './ChatSettingsSheet'
import { closeChat, useChatView } from './chatView'
import { copyText } from './clipboard'
import { useComposer } from './composerStore'
import { db, type ChatFile, type ChatMessage, type Permission, type PreparedFile, type Reasoning } from './db'
import { plainText } from './format'

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
  const chatFiles = useLiveQuery(() => (isNew ? [] : db.chatFiles.where('chatId').equals(chatId).sortBy('createdAt')), [chatId])
  const runState = useRuns((s) => s[chatId])
  const [text, setText] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  // Права нового чата до первого сообщения
  const [newPermission, setNewPermission] = useState<Permission>('ask')
  const [newReasoning, setNewReasoning] = useState(lastReasoning)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [files, setFiles] = useState<{ key: string; file: PreparedFile }[]>([])
  const [preparing, setPreparing] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [viewing, setViewing] = useState<PreparedFile | null>(null)
  // Сообщение пользователя, загруженное в поле ввода для правки
  const [editingId, setEditingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  if (!messages || !providers || !chatFiles) return null

  const options = providers.flatMap((p) => p.models.map((model) => ({ value: `${p.id}|${model}`, provider: p, model })))
  // Модель чата, иначе последняя выбранная, иначе первая доступная
  const saved = chat?.providerId ? `${chat.providerId}|${chat.model}` : lastModel() && `${lastModel()!.providerId}|${lastModel()!.model}`
  const selected = options.find((o) => o.value === (choice ?? saved)) ?? options[0]
  const running = runState?.running ?? false
  const permission = chat?.permission ?? newPermission
  const reasoning = chat?.reasoning ?? newReasoning
  const approvals = running ? [] : pendingApprovals(messages)
  // Правка начинает переписку заново, поэтому неотвеченные запросы разрешения ей не мешают
  const canSend = !running && !preparing && (approvals.length === 0 || !!editingId) && !!selected && (text.trim() !== '' || files.length > 0)
  const filesByMessage = new Map<string, ChatFile[]>()
  for (const f of chatFiles) filesByMessage.set(f.messageId, [...(filesByMessage.get(f.messageId) ?? []), f])

  // Превью строится сразу при выборе, чтобы отправка не ждала
  async function attach(list: File[]) {
    if (!list.length) return
    setPreparing(true)
    try {
      const prepared = await Promise.all(list.map(prepareFile))
      setFiles((current) => [...current, ...prepared.map((file) => ({ key: crypto.randomUUID(), file }))])
    } finally {
      setPreparing(false)
    }
  }

  function changePermission(next: Permission) {
    if (chat) void db.chats.update(chat.id, { permission: next })
    else setNewPermission(next)
  }

  function changeReasoning(next: Reasoning) {
    rememberReasoning(next)
    if (chat) void db.chats.update(chat.id, { reasoning: next })
    else setNewReasoning(next)
  }

  function startEditing(m: ChatMessage) {
    setEditingId(m.id)
    setText(textOf(m.message))
    setFiles((filesByMessage.get(m.id) ?? []).map((f) => ({ key: f.id, file: f })))
    textarea.current?.focus()
  }

  function stopEditing() {
    setEditingId(null)
    setText('')
    setFiles([])
  }

  // Итоговый ответ ассистента — его последнее сообщение перед следующим сообщением пользователя;
  // реплики между вызовами инструментов промежуточные. Ход, который ещё идёт, итога не имеет
  const finals = new Map<string, string>()
  messages.forEach((m, i) => {
    const next = messages[i + 1]
    if (m.message.role !== 'assistant' || (next ? next.message.role !== 'user' : running)) return
    const final = textOf(m.message)
    if (final) finals.set(m.id, final)
  })

  async function send() {
    if (!canSend) return
    const message = text.trim()
    const attached = files.map((f) => f.file)
    const fromId = editingId
    setText('')
    setFiles([])
    setEditingId(null)
    const id = fromId
      ? await resendFrom(chatId, fromId, message, attached, selected.provider.id, selected.model, permission, reasoning)
      : await sendMessage(chatId, message, attached, selected.provider.id, selected.model, permission, reasoning)
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
            <MessageView
              key={m.id}
              message={m.message}
              files={filesByMessage.get(m.id) ?? []}
              onFile={setViewing}
              actions={
                m.message.role === 'user' ? (
                  <div className="flex gap-1 text-stone-400">
                    {textOf(m.message) && <CopyButton text={textOf(m.message)} />}
                    <IconButton label="Изменить сообщение" disabled={running} onClick={() => startEditing(m)}>
                      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </IconButton>
                  </div>
                ) : (
                  finals.has(m.id) && (
                    <div className="flex items-center gap-1 text-stone-400">
                      <CopyButton text={finals.get(m.id)!} />
                      <button type="button" className="px-1.5 py-1 text-xs hover:text-stone-700" onClick={() => saveToFeed(chatId, finals.get(m.id)!)}>
                        В ленту
                      </button>
                    </div>
                  )
                )
              }
            />
          ))}
          {runState?.items.map((item, i) => <RunItemView key={i} item={item} />)}
          {running && runState.items.length === 0 && <p className="text-sm text-stone-400">Думаю…</p>}
          {approvals.map((a) => (
            <div key={a.approvalId} className="rounded-2xl border border-orange-200 bg-white px-3 py-2.5">
              <p className="text-sm font-medium">{approvalLabels[a.toolName] ?? a.toolName}</p>
              <ApprovalDetails input={a.input as Record<string, unknown>} />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-stone-900 py-2 text-sm font-medium text-white"
                  onClick={() => void answerApproval(chatId, a.approvalId, true)}
                >
                  Разрешить
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-stone-100 py-2 text-sm font-medium text-stone-800"
                  onClick={() => void answerApproval(chatId, a.approvalId, false)}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
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
          {editingId && (
            <div className="mb-1 flex items-center gap-2 rounded-2xl bg-orange-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-orange-700">Редактирование</p>
                <p className="text-xs text-stone-500">Переписка начнётся заново с этого сообщения</p>
              </div>
              <button type="button" aria-label="Отменить редактирование" className="px-1 text-stone-400" onClick={stopEditing}>
                ✕
              </button>
            </div>
          )}
          {files.length > 0 && (
            <div className="flex gap-2 overflow-x-auto px-1 pt-2 pb-1">
              {files.map((f) => (
                <AttachmentTile
                  key={f.key}
                  file={f.file}
                  onOpen={() => setViewing(f.file)}
                  onRemove={() => setFiles(files.filter((x) => x.key !== f.key))}
                />
              ))}
            </div>
          )}
          {preparing && <p className="px-2 pt-1 text-xs text-stone-400">Готовлю вложения…</p>}
          {/* Как в мессенджере: вложения, текст и отправка одной строкой, настройки ассистента под ней */}
          <div className="flex items-end gap-1">
            <button
              type="button"
              aria-label="Вложения"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-xl text-stone-600 hover:bg-stone-100"
              onClick={() => setAttachMenuOpen(true)}
            >
              +
            </button>
            <textarea
              ref={textarea}
              value={text}
              rows={1}
              placeholder="Спросите ассистента"
              className="block max-h-[200px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-stone-400"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
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
          {/* Сразу видны модель и глубина размышлений; провайдер и права — в панели настроек */}
          {options.length > 0 ? (
            <button
              type="button"
              className="flex max-w-full items-center gap-1 rounded-full px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
              onClick={() => setSettingsOpen(true)}
            >
              <span className="truncate font-medium text-stone-700">{selected.model}</span>
              <span className="shrink-0">· {reasoningLabels[reasoning]}</span>
              <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          ) : (
            <p className="px-2 py-1.5 text-xs text-stone-500">Добавьте провайдера в настройках — шестерёнка в боковой панели</p>
          )}
        </div>
      </div>
      {settingsOpen && selected && (
        <ChatSettingsSheet
          providers={providers}
          model={selected.value}
          reasoning={reasoning}
          permission={permission}
          onModel={setChoice}
          onReasoning={changeReasoning}
          onPermission={changePermission}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <AttachSheet open={attachMenuOpen} onClose={() => setAttachMenuOpen(false)} onFiles={(files) => void attach(files)} />
      {viewing && <AttachmentViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

// Что именно ассистент хочет изменить: текст или исходная запись
function ApprovalDetails({ input }: { input: Record<string, unknown> }) {
  const entry = useLiveQuery(() => (typeof input.id === 'string' ? db.entries.get(input.id) : undefined), [input.id])
  const text = typeof input.text === 'string' ? input.text : entry ? plainText(entry.text, { hideSpoilers: true }) : ''
  const fields = input.fields && typeof input.fields === 'object' ? Object.entries(input.fields) : []
  return (
    <div className="mt-1 text-sm text-stone-600">
      {text && <p className="line-clamp-4 whitespace-pre-wrap">{text}</p>}
      {fields.length > 0 && (
        <p className="mt-1 text-xs text-stone-500">{fields.map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ')}</p>
      )}
      {typeof input.actual === 'boolean' && <p className="mt-1 text-xs text-stone-500">{input.actual ? 'Снова актуально' : 'Больше не актуально'}</p>}
    </div>
  )
}

// Текст ответа уходит в панель ввода ленты: тип и теги выбирает пользователь
function saveToFeed(chatId: string, text: string) {
  const composer = useComposer.getState()
  if (composer.draft.text.trim() && !window.confirm('В панели ввода ленты есть черновик. Заменить его ответом ассистента?')) return
  composer.startFromChat(chatId, text)
  closeChat()
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} className="rounded-full p-1.5 hover:text-stone-700 disabled:opacity-40" onClick={onClick}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}

// После копирования значок ненадолго сменяется галочкой
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <IconButton
      label="Копировать"
      onClick={() =>
        void copyText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
    >
      {copied ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : (
        <>
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </>
      )}
    </IconButton>
  )
}

// actions — значки под сообщением пользователя или под итоговым ответом ассистента
type MessageProps = { message: ModelMessage; files: ChatFile[]; onFile: (file: ChatFile) => void; actions: ReactNode }

function MessageView({ message, files, onFile, actions }: MessageProps) {
  switch (message.role) {
    case 'user':
      return (
        <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
          {files.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {files.map((f) => (
                <AttachmentTile key={f.id} file={f} onOpen={() => onFile(f)} />
              ))}
            </div>
          )}
          {textOf(message) && <div className="rounded-2xl bg-white px-3.5 py-2 text-[15px] whitespace-pre-wrap shadow-sm">{textOf(message)}</div>}
          {actions}
        </div>
      )
    case 'assistant':
      return (
        <>
          {typeof message.content === 'string' ? (
            <Markdown text={message.content} />
          ) : (
            message.content.map((part, i) =>
              part.type === 'text' ? (
                <Markdown key={i} text={part.text} />
              ) : part.type === 'tool-call' ? (
                <ToolLine key={i} name={part.toolName} failed={false} />
              ) : null,
            )
          )}
          {actions && <div className="-mt-2">{actions}</div>}
        </>
      )
    case 'tool':
      return (
        <>
          {message.content.map((part, i) =>
            part.type === 'tool-approval-response' ? (
              <p key={i} className={`text-xs ${part.approved ? 'text-stone-400' : 'text-red-600'}`}>
                {part.approved ? 'Разрешено' : 'Отклонено'}
              </p>
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
