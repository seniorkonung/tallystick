import type { ModelMessage } from 'ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AttachSheet } from './AttachSheet'
import { AttachmentTile, AttachmentViewer } from './AttachmentViews'
import { Markdown } from './Markdown'
import { prepareFile } from './attachments'
import { answerApproval, deleteChat, lastModel, lastReasoning, pendingApprovals, reasoningLabels, rememberReasoning, resendFrom, retry, sendMessage, stop, useRuns, type RunItem } from './assistant'
import { approvalLabels, toolLabels } from './assistantTools'
import { ChatSettingsSheet } from './ChatSettingsSheet'
import { InstructionEditor } from './InstructionEditor'
import { InstructionPicker } from './InstructionPicker'
import { ensureModelInfo, modelInfo, useModelCatalog } from './modelCatalog'
import { closeChat, closeChatToFeed, goToEntry, useChatView } from './chatView'
import { copyText, takePastedEntries } from './clipboard'
import { useComposer } from './composerStore'
import { db, type ChatFile, type ChatMessage, type Permission, type PreparedFile, type Reasoning } from './db'
import { plainText } from './format'
import { pluralRu } from './plural'
import { MessageText } from './RichText'
import { SwipePage } from './SwipePage'

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
  // Записи ленты, прикреплённые к сообщению вставкой скопированных записей или при открытии чата из ленты
  const [entryIds, setEntryIds] = useState<string[]>(() => useChatView.getState().entryIds)
  const [preparing, setPreparing] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [viewing, setViewing] = useState<PreparedFile | null>(null)
  // Сообщение пользователя, загруженное в поле ввода для правки
  const [editingId, setEditingId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const instructions = useLiveQuery(() => db.instructions.orderBy('createdAt').toArray())
  // Стартовая инструкция нового чата; с первым сообщением чат сохраняет её копию
  const [instructionId, setInstructionId] = useState<string | null>(null)
  const [creatingInstruction, setCreatingInstruction] = useState(false)
  const [pickingInstruction, setPickingInstruction] = useState(false)
  const [instructionShown, setInstructionShown] = useState(false)
  const catalog = useModelCatalog()

  // Модели провайдеров, о которых ещё ничего не известно
  const modelIds = providers?.flatMap((p) => p.models).join('\n') ?? ''
  useEffect(() => {
    if (modelIds) void ensureModelInfo(modelIds.split('\n'))
  }, [modelIds])

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  if (!messages || !providers || !chatFiles || !instructions) return null

  const options = providers.flatMap((p) => p.models.map((model) => ({ value: `${p.id}|${model}`, provider: p, model })))
  // Модель чата, иначе последняя выбранная, иначе первая доступная
  const saved = chat?.providerId ? `${chat.providerId}|${chat.model}` : lastModel() && `${lastModel()!.providerId}|${lastModel()!.model}`
  const selected = options.find((o) => o.value === (choice ?? saved)) ?? options[0]
  const running = runState?.running ?? false
  const permission = chat?.permission ?? newPermission
  const reasoning = chat?.reasoning ?? newReasoning
  const approvals = running ? [] : pendingApprovals(messages)
  // Переписка кончается без ответа ассистента: запрос упал, его остановили до первого слова или приложение закрыли посреди ответа.
  // Ошибка живёт только в памяти, а неотвеченное сообщение — в базе, поэтому повторить можно и после перезапуска
  const lastRole = messages.at(-1)?.message.role
  const unanswered = !running && approvals.length === 0 && (lastRole === 'user' || lastRole === 'tool')
  // Правка начинает переписку заново, поэтому неотвеченные запросы разрешения ей не мешают
  const canSend = !running && !preparing && (approvals.length === 0 || !!editingId) && !!selected && (text.trim() !== '' || files.length > 0 || entryIds.length > 0)
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
    setEntryIds(m.entryIds ?? [])
    textarea.current?.focus()
  }

  function stopEditing() {
    setEditingId(null)
    setText('')
    setFiles([])
    setEntryIds([])
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

  function startInstruction() {
    const chosen = instructions!.find((i) => i.id === instructionId)
    return chosen ? { id: chosen.id, name: chosen.name, text: chosen.text } : null
  }

  async function send() {
    if (!canSend) return
    const message = text.trim()
    const attached = files.map((f) => f.file)
    const fromId = editingId
    const entries = entryIds
    setText('')
    setFiles([])
    setEntryIds([])
    setEditingId(null)
    const id = fromId
      ? await resendFrom(chatId, fromId, message, attached, selected.provider.id, selected.model, permission, reasoning, entries)
      : await sendMessage(chatId, message, attached, selected.provider.id, selected.model, permission, reasoning, entries, startInstruction())
    // Новый чат получил id: экран остаётся тем же шагом истории
    if (isNew) useChatView.setState({ chatId: id })
  }

  return (
    <SwipePage onClose={closeChat} className="z-30">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" aria-label="Назад в ленту" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100" onClick={closeChat}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{chat?.title ?? 'Новый чат'}</h1>
          {chat?.instruction && (
            <button type="button" className="block max-w-full truncate text-xs text-stone-500" onClick={() => setInstructionShown(!instructionShown)}>
              {chat.instruction.name} {instructionShown ? '⌃' : '⌄'}
            </button>
          )}
        </div>
        {chat && (
          <div className="relative">
            <button type="button" aria-label="Действия с чатом" className="flex size-9 items-center justify-center rounded-full hover:bg-stone-100" onClick={() => setMenuOpen(!menuOpen)}>
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                <circle cx="12" cy="5" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="12" cy="19" r="1.75" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-full right-0 z-10 mt-1 flex w-48 flex-col rounded-2xl border border-stone-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="px-4 py-2.5 text-left hover:bg-stone-100"
                    onClick={async () => {
                      setMenuOpen(false)
                      const title = window.prompt('Название чата', chat.title)?.trim()
                      if (title) await db.chats.update(chat.id, { title })
                    }}
                  >
                    Переименовать
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2.5 text-left text-red-600 hover:bg-stone-100"
                    onClick={async () => {
                      setMenuOpen(false)
                      const saved = await db.entries.filter((e) => e.chatId === chat.id).count()
                      const note = saved
                        ? `\n\n${saved} ${pluralRu(saved, ['запись', 'записи', 'записей'])} из этого чата ${pluralRu(saved, ['останется', 'останутся', 'останутся'])} в ленте, но ссылка на чат пропадёт: у записей будет пометка «из удалённого чата».`
                        : ''
                      if (!window.confirm(`Удалить чат «${chat.title}»? Переписка и её вложения удалятся безвозвратно.${note}`)) return
                      closeChat()
                      await deleteChat(chat.id)
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </header>
      {/* Текст, с которым чат начался, только для просмотра */}
      {chat?.instruction && instructionShown && (
        <p className="max-h-[40dvh] overflow-y-auto border-b border-stone-200 bg-white px-4 py-3 text-sm whitespace-pre-wrap text-stone-600">
          {chat.instruction.text}
        </p>
      )}

      {/* column-reverse держит прокрутку у последнего сообщения */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto overscroll-y-contain">
        <div className="flex flex-col gap-3 px-4 py-4">
          {messages.length === 0 && !running && (
            <div className="py-10 text-center">
              <p className="text-sm text-stone-400">Спросите о своих записях: ассистент видит всю ленту</p>
              {/* Стартовая инструкция выбирается до первого сообщения и потом не меняется */}
              {isNew && (
                <button
                  type="button"
                  className="mx-auto mt-4 flex max-w-full items-center gap-1 rounded-full bg-white px-4 py-2 text-sm shadow-sm"
                  onClick={() => setPickingInstruction(true)}
                >
                  <span className="shrink-0 text-stone-500">Инструкция:</span>
                  <span className="truncate font-medium text-stone-800">{instructions.find((i) => i.id === instructionId)?.name ?? 'Без инструкции'}</span>
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {messages.map((m) => (
            <MessageView
              key={m.id}
              message={m.message}
              files={filesByMessage.get(m.id) ?? []}
              entryIds={m.entryIds ?? []}
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
              {['create_instruction', 'update_instruction', 'delete_instruction'].includes(a.toolName) ? (
                <InstructionApproval toolName={a.toolName} input={a.input as Record<string, unknown>} />
              ) : (
                <ApprovalDetails input={a.input as Record<string, unknown>} />
              )}
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
          {runState?.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="break-words">Ошибка: {runState.error}</p>
              <button type="button" className="mt-1 font-medium" onClick={() => void retry(chatId)}>
                Повторить
              </button>
            </div>
          ) : (
            unanswered && (
              <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600">
                <p className="flex-1">Ответа нет</p>
                <button type="button" className="font-medium text-orange-700" onClick={() => void retry(chatId)}>
                  Повторить
                </button>
              </div>
            )
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
          {entryIds.length > 0 && (
            <div className="flex flex-col gap-1 px-1 pt-1 pb-2">
              {entryIds.map((id) => (
                <EntryChip key={id} entryId={id} onRemove={() => setEntryIds(entryIds.filter((x) => x !== id))} />
              ))}
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
              // Чат открыли из ленты с записями — сразу пишем запрос о них
              autoFocus={isNew && entryIds.length > 0}
              value={text}
              rows={1}
              placeholder="Спросите ассистента"
              className="block max-h-[200px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-stone-400"
              // Вставленные картинки и файлы становятся вложениями, а не текстом
              onPaste={(e) => {
                const pasted = [...e.clipboardData.files]
                if (!pasted.length) return
                e.preventDefault()
                void attach(pasted)
              }}
              // Скопированные в приложении записи прикрепляются к сообщению, а не вставляются текстом
              onChange={(e) => {
                const pasted = takePastedEntries(text, e.target.value)
                if (!pasted) return setText(e.target.value)
                setText(pasted.text)
                setEntryIds((current) => [...current, ...pasted.entryIds.filter((id) => !current.includes(id))])
              }}
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
          <div className="flex items-center gap-1">
            {/* Сразу видны модель и глубина размышлений; провайдер и права — в панели настроек */}
            {options.length > 0 ? (
              <button
                type="button"
                className="flex max-w-full items-center gap-1 rounded-full px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                onClick={() => setSettingsOpen(true)}
              >
                <span className="truncate font-medium text-stone-700">{modelInfo(catalog, selected.model)?.name ?? selected.model}</span>
                <span className="shrink-0">· {reasoningLabels[reasoning]}</span>
                <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : (
              <p className="px-2 py-1.5 text-xs text-stone-500">Добавьте провайдера в настройках — шестерёнка в боковой панели</p>
            )}
            {chat?.contextTokens != null && (
              <ContextRing tokens={chat.contextTokens} limit={chat.model ? (modelInfo(catalog, chat.model)?.context ?? null) : null} />
            )}
          </div>
        </div>
      </div>
      {pickingInstruction && (
        <InstructionPicker
          instructions={instructions}
          selectedId={instructionId}
          onSelect={setInstructionId}
          onCreate={() => {
            setPickingInstruction(false)
            setCreatingInstruction(true)
          }}
          onClose={() => setPickingInstruction(false)}
        />
      )}
      {creatingInstruction && (
        <InstructionEditor
          target={{ kind: 'start', instruction: null }}
          onSaved={(saved) => setInstructionId(saved.id)}
          onClose={() => setCreatingInstruction(false)}
        />
      )}
      {settingsOpen && selected && (
        <ChatSettingsSheet
          providers={providers}
          catalog={catalog}
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
    </SwipePage>
  )
}

// Что именно ассистент хочет изменить: текст или исходная запись
// Какую инструкцию ассистент хочет создать, изменить или удалить; текст показывается целиком
function InstructionApproval({ toolName, input }: { toolName: string; input: Record<string, unknown> }) {
  // Правка указывает инструкцию полем instruction, удаление — полем id
  const id = toolName === 'delete_instruction' ? input.id : input.instruction
  const saved = useLiveQuery(() => (typeof id === 'string' && id !== 'general' ? db.instructions.get(id) : undefined), [id])
  const target = id === 'general' ? 'Общая инструкция' : `Стартовая инструкция «${saved?.name ?? '…'}»`
  const [summary, text] =
    toolName === 'create_instruction'
      ? [`«${String(input.name ?? '')}»`, input.text]
      : toolName === 'delete_instruction'
        ? [`«${saved?.name ?? '…'}» · начатые с ней чаты сохранят её текст`, saved?.text]
        : [
            `${target} · ${input.mode === 'append' ? 'дополнить' : 'заменить текст'}${typeof input.name === 'string' && input.name.trim() ? ` · новое название «${input.name.trim()}»` : ''}`,
            input.text,
          ]
  return (
    <div className="mt-1 text-sm text-stone-600">
      <p className="text-xs text-stone-500">{summary}</p>
      {typeof text === 'string' && <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">{text}</p>}
    </div>
  )
}

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
  closeChatToFeed()
}

// Прикреплённая запись: в сообщении открывает её в ленте, в поле ввода её можно убрать
function EntryChip({ entryId, onRemove }: { entryId: string; onRemove?: () => void }) {
  // undefined — ещё загружается, null — запись удалили
  const entry = useLiveQuery(async () => (await db.entries.get(entryId)) ?? null, [entryId])
  const label = entry === null ? 'Запись удалена' : entry ? plainText(entry.text, { hideSpoilers: true }) || 'Запись без текста' : ''

  return (
    <div className="flex max-w-full items-center gap-2 rounded-xl border-l-[3px] border-orange-500 bg-[#F7EFE8] px-2.5 py-1.5 text-xs text-stone-600">
      <button type="button" disabled={!entry || !!onRemove} className="min-w-0 flex-1 truncate text-left" onClick={() => goToEntry(entryId)}>
        {label}
      </button>
      {onRemove && (
        <button type="button" aria-label="Открепить запись" className="shrink-0 text-stone-400" onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  )
}

const tokensFormat = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })

// Кольцо заполняется по мере роста переписки; подробности — во всплывающем окошке над ним.
// Окно известно не для всех моделей: тогда кольцо пунктирное, а в окошке только занятые токены
function ContextRing({ tokens, limit }: { tokens: number; limit: number | null }) {
  const [open, setOpen] = useState(false)
  const share = limit ? Math.min(tokens / limit, 1) : 0
  const color = share > 0.95 ? 'text-red-600' : share > 0.8 ? 'text-orange-600' : 'text-stone-500'
  const length = 2 * Math.PI * 8
  return (
    <div className="relative ml-auto shrink-0">
      <button type="button" aria-label="Занятый контекст" className={`flex size-9 items-center justify-center rounded-full hover:bg-stone-100 ${color}`} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 20 20" className="size-5 -rotate-90" fill="none" strokeWidth="2.5">
          <circle cx="10" cy="10" r="8" stroke="currentColor" className="opacity-20" strokeDasharray={limit ? undefined : '2 3'} />
          {limit && <circle cx="10" cy="10" r="8" stroke="currentColor" strokeLinecap="round" strokeDasharray={`${share * length} ${length}`} />}
        </svg>
      </button>
      {open && (
        <>
          {/* Тап мимо окошка закрывает его */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full z-10 mb-2 w-max max-w-64 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm shadow-lg">
            <p className="font-medium text-stone-900">
              {tokensFormat.format(tokens)}
              {limit ? ` из ${tokensFormat.format(limit)} · ${Math.round(share * 100)}%` : ' токенов'}
            </p>
            <p className="text-xs text-stone-500">{limit ? 'Занято контекста по последнему ответу' : 'Занято контекста; окно модели неизвестно'}</p>
          </div>
        </>
      )}
    </div>
  )
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
type MessageProps = { message: ModelMessage; files: ChatFile[]; entryIds: string[]; onFile: (file: ChatFile) => void; actions: ReactNode }

function MessageView({ message, files, entryIds, onFile, actions }: MessageProps) {
  switch (message.role) {
    case 'user':
      return (
        <div className="flex max-w-[85%] flex-col items-end gap-1.5 self-end">
          {entryIds.map((id) => (
            <EntryChip key={id} entryId={id} />
          ))}
          {files.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {files.map((f) => (
                <AttachmentTile key={f.id} file={f} onOpen={() => onFile(f)} />
              ))}
            </div>
          )}
          {textOf(message) && (
            <div className="rounded-2xl bg-white px-3.5 py-2 text-[15px] whitespace-pre-wrap shadow-sm">
              <MessageText text={textOf(message)} />
            </div>
          )}
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
