import { APICallError, RetryError, generateText, isLoopFinished, streamText, type ModelMessage } from 'ai'
import { create } from 'zustand'
import { activeToolsFor, approvalFor, describeEntries, localTime, readTools, writeTools } from './assistantTools'
import { fileForModel } from './modelFiles'
import { db, type Chat, type ChatFile, type ChatMessage, type Permission, type PreparedFile, type Reasoning } from './db'
import { languageModel } from './llm'

// То, что ассистент выдаёт прямо сейчас; после ответа это становится сообщениями чата
export type RunItem = { kind: 'text'; text: string } | { kind: 'tool'; id: string; name: string; failed: boolean }

export type Run = { items: RunItem[]; running: boolean; error: string | null }

// Ответ идёт и тогда, когда чат закрыт: состояние живёт вне экрана
export const useRuns = create<Record<string, Run>>(() => ({}))

const controllers = new Map<string, AbortController>()

const lastModelKey = 'tallystick.chatModel'

export function lastModel(): { providerId: string; model: string } | null {
  return JSON.parse(localStorage.getItem(lastModelKey) ?? 'null')
}

export const reasoningLabels: Record<Reasoning, string> = {
  'provider-default': 'Авто',
  none: 'Без размышлений',
  low: 'Низкое',
  medium: 'Среднее',
  high: 'Высокое',
  xhigh: 'Очень высокое',
  max: 'Максимум',
}

const lastReasoningKey = 'tallystick.chatReasoning'

// Новый чат начинается с последней выбранной глубины размышлений
export function lastReasoning(): Reasoning {
  return (localStorage.getItem(lastReasoningKey) as Reasoning | null) ?? 'provider-default'
}

export function rememberReasoning(reasoning: Reasoning) {
  localStorage.setItem(lastReasoningKey, reasoning)
}

function setRun(chatId: string, patch: Partial<Run>) {
  useRuns.setState((s) => ({ [chatId]: { ...(s[chatId] ?? { items: [], running: false, error: null }), ...patch } }))
}

// Инструкции не меняются от запроса к запросу: Anthropic привязывает подписи размышлений модели к началу запроса.
// Поэтому чат хранит копии общей и стартовой инструкций с первого сообщения
function instructions(chat: Chat) {
  const general = chat.generalInstruction
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `You are the assistant inside Tallystick, the user's personal feed app. The feed holds everything the user records: thoughts, meals, workouts, project notes.

Domain:
- Entry: a feed item with text, attachments, field values of its type, tags, an optional reply-to entry, and actuality (actual or no longer actual). Its creation time is fixed.
- Type: a user-defined kind of entry with an ordered list of fields (single choice, multiple choice, number, string, date, date and time, time).
- Tag: a user-defined label that groups entries by any criterion, such as a topic, a direction, or a project. A tag is active or archived; an entry can have several tags.

Use the tools to look at the user's data instead of guessing. Fetch types or tags first when you need their ids. Page through results when the total exceeds the page.

Some changes need the user's approval in the app; when a tool execution is not approved, do not retry it. If you have no tool to change data, the chat is read-only: tell the user to switch the chat's permission mode. Entries you create are marked as coming from this chat.

The user can attach feed entries to a message; they follow the message text as JSON, in their current state.

When your reply mentions specific entries, especially ones you created or changed, link them so the user can open them in the feed: [short label](entry:ENTRY_ID).

When your reply refers to a set of entries the user may want to browse, link the search: [short label](filter:CODE), copying the link search_entries returned exactly. It opens the feed with those filters. A filter link in a message or an entry text stands for feed filters: pass it to search_entries to see them.

Each user message starts with the local time it was sent, in brackets. Use the latest one as the current time. Time zone: ${zone}; entry times are in this zone.

Instructions: the general instruction applies to every chat; start instructions are saved rules for typical situations, one of which the user may choose when a chat starts. A chat keeps copies of both as they were at its start, so editing any saved instruction affects only new chats. If you edit an instruction this chat uses, follow the edited version yourself from then on. In this chat, also follow new rules the user gives in the conversation. Create, change, or delete instructions only when the user asks; prefer append when adding a rule to an existing one.

Reply in the user's language, concisely, using Markdown.${general ? `

The user's general instruction for every chat:
${general}` : ''}${chat.instruction ? `

The user's start instruction for this chat, "${chat.instruction.name}"${chat.instruction.id ? ` (id ${chat.instruction.id})` : ''}:
${chat.instruction.text}` : ''}`
}

// Провайдеры сообщают о переполнении по-разному, общего кода ошибки нет — узнаём по тексту
const overflowPattern = /prompt is too long|context.?length|context.?window|maximum context|too many tokens|tokens? limit/i

function errorText(error: unknown): string {
  if (RetryError.isInstance(error)) return errorText(error.lastError)
  if (APICallError.isInstance(error) && overflowPattern.test(`${error.responseBody ?? ''} ${error.message}`)) {
    return 'Контекст переполнен — начните новый чат или исправьте одно из ранних сообщений'
  }
  if (APICallError.isInstance(error)) return `${error.statusCode ?? ''} ${error.responseBody?.slice(0, 300) ?? error.message}`.trim()
  return error instanceof Error ? error.message : String(error)
}

async function saveMessages(chatId: string, messages: ModelMessage[]) {
  const now = Date.now()
  await db.transaction('rw', db.chatMessages, db.chats, async () => {
    // Остановленный ответ удалённого чата сохраняется уже после удаления — его некуда сохранять
    if (!(await db.chats.get(chatId))) return
    // Порядок сообщений — порядок добавления
    await db.chatMessages.bulkAdd(messages.map((message, i) => ({ id: crypto.randomUUID(), chatId, createdAt: now + i, message })))
    await db.chats.update(chatId, { updatedAt: now + messages.length })
  })
}

// Первое сообщение создаёт чат; возвращает id чата
export async function sendMessage(
  chatId: string | 'new',
  text: string,
  files: PreparedFile[],
  providerId: string,
  model: string,
  permission: Permission,
  reasoning: Reasoning,
  entryIds: string[],
  // Стартовая инструкция нового чата; у начатого чата она уже закреплена
  instruction: Chat['instruction'] = null,
) {
  localStorage.setItem(lastModelKey, JSON.stringify({ providerId, model }))
  let id = chatId
  if (id === 'new') {
    const general = await db.settings.get('generalInstruction')
    const chat: Chat = { id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), title: (text || files[0]?.name || (entryIds.length ? 'Записи' : 'Чат')).slice(0, 60), providerId, model, permission, reasoning, contextTokens: null, instruction, generalInstruction: general?.id === 'generalInstruction' ? general.value.trim() : '' }
    await db.chats.add(chat)
    id = chat.id
  } else {
    await db.chats.update(id, { providerId, model })
  }
  const now = Date.now()
  const messageId = crypto.randomUUID()
  const chatFiles: ChatFile[] = files.map((f, i) => ({ ...f, id: crypto.randomUUID(), chatId: id, messageId, createdAt: now + i }))
  await db.transaction('rw', db.chatMessages, db.chatFiles, db.chats, async () => {
    await db.chatFiles.bulkAdd(chatFiles)
    await db.chatMessages.add({ id: messageId, chatId: id, createdAt: now, message: { role: 'user', content: text }, fileIds: chatFiles.map((f) => f.id), entryIds })
    await db.chats.update(id, { updatedAt: now })
  })
  void run(id)
  return id
}

// Отредактированное сообщение заменяет исходное: переписка начинается заново с его места
export async function resendFrom(
  chatId: string,
  messageId: string,
  text: string,
  files: PreparedFile[],
  providerId: string,
  model: string,
  permission: Permission,
  reasoning: Reasoning,
  entryIds: string[],
) {
  await db.transaction('rw', db.chatMessages, db.chatFiles, db.chats, async () => {
    const from = await db.chatMessages.get(messageId)
    if (!from) return
    const dropped = await db.chatMessages.where('chatId').equals(chatId).filter((m) => m.createdAt >= from.createdAt).primaryKeys()
    await db.chatFiles.where('chatId').equals(chatId).filter((f) => dropped.includes(f.messageId)).delete()
    await db.chatMessages.bulkDelete(dropped)
    // Занятый контекст станет известен со следующим ответом
    await db.chats.update(chatId, { contextTokens: null })
  })
  return sendMessage(chatId, text, files, providerId, model, permission, reasoning, entryIds)
}

// Повтор ответа. Сообщение, на которое ещё нет ответа, получает время повтора: модель берёт текущее время из него.
// После начатого ответа сообщение не трогаем — на прежнее начало запроса опираются размышления модели
export async function retry(chatId: string) {
  const last = (await db.chatMessages.where('chatId').equals(chatId).sortBy('createdAt')).at(-1)
  if (last?.message.role === 'user') {
    const now = Date.now()
    await db.transaction('rw', db.chatMessages, db.chats, async () => {
      await db.chatMessages.update(last.id, { createdAt: now })
      await db.chats.update(chatId, { updatedAt: now })
    })
  }
  await run(chatId)
}

export function stop(chatId: string) {
  controllers.get(chatId)?.abort()
}

// Переписка удаляется безвозвратно с вложениями; записи из чата остаются в ленте
export async function deleteChat(chatId: string) {
  stop(chatId)
  await db.transaction('rw', db.chats, db.chatMessages, db.chatFiles, async () => {
    await db.chatFiles.where('chatId').equals(chatId).delete()
    await db.chatMessages.where('chatId').equals(chatId).delete()
    await db.chats.delete(chatId)
  })
}

export async function run(chatId: string) {
  // Сразу, до чтения базы: иначе только что отправленное сообщение на миг выглядит оставшимся без ответа
  setRun(chatId, { items: [], running: true, error: null })
  const chat = await db.chats.get(chatId)
  const provider = chat?.providerId ? await db.providers.get(chat.providerId) : undefined
  if (!chat || !provider || !chat.model) return setRun(chatId, { error: 'Провайдер чата не найден — выберите модель', running: false })

  const stored = await db.chatMessages.where('chatId').equals(chatId).sortBy('createdAt')
  const files = new Map((await db.chatFiles.where('chatId').equals(chatId).toArray()).map((f) => [f.id, f]))
  const history = withoutOldReasoning(await Promise.all(stored.map((m) => toModelMessage(m, files))))
  const controller = new AbortController()
  controllers.set(chatId, controller)

  const items: RunItem[] = []
  const show = () => setRun(chatId, { items: [...items] })
  let aborted = false
  // Запрос шага и ответ на него — это и есть переписка, с которой начнётся следующий запрос
  let contextTokens: number | null = null
  try {
    const result = streamText({
      model: languageModel(provider, chat.model),
      instructions: instructions(chat),
      messages: history,
      tools: { ...readTools, ...writeTools(chatId) },
      activeTools: activeToolsFor(chat.permission, provider.kind),
      toolApproval: approvalFor(chat.permission),
      // AI SDK переводит глубину размышлений в настройку провайдера; неподдерживаемую моделью — в ближайшую
      reasoning: chat.reasoning,
      // Шагов сколько угодно: задача может требовать анализа всей ленты, а лишнее пользователь останавливает сам
      stopWhen: isLoopFinished(),
      abortSignal: controller.signal,
    })
    let failure: unknown = null
    for await (const part of result.stream) {
      switch (part.type) {
        case 'text-delta': {
          const last = items.at(-1)
          if (last?.kind === 'text') last.text += part.text
          else items.push({ kind: 'text', text: part.text })
          show()
          break
        }
        case 'tool-call':
          items.push({ kind: 'tool', id: part.toolCallId, name: part.toolName, failed: false })
          show()
          break
        case 'tool-error': {
          const item = items.find((i) => i.kind === 'tool' && i.id === part.toolCallId)
          if (item?.kind === 'tool') item.failed = true
          show()
          break
        }
        case 'finish-step':
          if (part.usage.inputTokens !== undefined) contextTokens = part.usage.inputTokens + (part.usage.outputTokens ?? 0)
          break
        case 'abort':
          aborted = true
          break
        case 'error':
          failure = part.error
          break
      }
    }
    if (failure) throw failure
    if (!aborted) {
      await saveMessages(chatId, await result.responseMessages)
      if (stored.length === 1) void nameChat(chatId, provider, chat.model, stored[0])
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      setRun(chatId, { running: false, error: errorText(error) })
      controllers.delete(chatId)
      return
    }
    aborted = true
  }
  // Остановленный ответ сохраняется только текстом: незавершённые вызовы инструментов сломали бы историю
  if (aborted) {
    const text = items.flatMap((i) => (i.kind === 'text' ? [i.text] : [])).join('\n\n')
    if (text) await saveMessages(chatId, [{ role: 'assistant', content: text }])
  }
  if (contextTokens !== null) await db.chats.update(chatId, { contextTokens })
  controllers.delete(chatId)
  setRun(chatId, { items: [], running: false, error: null })
}

// К сообщению пользователя добавляются время отправки и вложения; время берётся из сообщения, чтобы запрос не менялся
async function toModelMessage(m: ChatMessage, files: Map<string, ChatFile>): Promise<ModelMessage> {
  if (m.message.role !== 'user') return m.message
  const weekday = new Date(m.createdAt).toLocaleDateString('en-GB', { weekday: 'long' })
  const text = `[${localTime(m.createdAt)}, ${weekday}]\n${typeof m.message.content === 'string' ? m.message.content : ''}`
  const parts = await Promise.all((m.fileIds ?? []).flatMap((id) => files.get(id) ?? []).map(fileForModel))
  if (m.entryIds?.length) {
    const found = await db.entries.bulkGet(m.entryIds)
    const described = await describeEntries(found.flatMap((e) => e ?? []))
    const entries = m.entryIds.map((id) => described.find((e) => e.id === id) ?? { id, deleted: true })
    parts.unshift({ type: 'text', text: `Attached entries:\n${JSON.stringify(entries)}` })
  }
  return { role: 'user', content: [{ type: 'text', text }, ...parts] }
}

// Размышления модели нужны только в текущем ходе, например после разрешения; в прошлых ходах провайдер их всё равно отбрасывает
function withoutOldReasoning(history: ModelMessage[]) {
  const lastUser = history.findLastIndex((m) => m.role === 'user')
  return history.flatMap((m, i) => {
    if (i > lastUser || m.role !== 'assistant' || typeof m.content === 'string') return [m]
    const content = m.content.filter((p) => p.type !== 'reasoning' && p.type !== 'reasoning-file')
    return content.length ? [{ ...m, content }] : []
  })
}

// Запросы разрешения, на которые пользователь ещё не ответил
export function pendingApprovals(messages: ChatMessage[]) {
  const calls = new Map<string, { toolName: string; input: unknown }>()
  const requests: { approvalId: string; toolCallId: string }[] = []
  const answered = new Set<string>()
  for (const { message } of messages) {
    if (typeof message.content === 'string') continue
    for (const part of message.content) {
      if (part.type === 'tool-call') calls.set(part.toolCallId, { toolName: part.toolName, input: part.input })
      if (part.type === 'tool-approval-request') requests.push({ approvalId: part.approvalId, toolCallId: part.toolCallId })
      if (part.type === 'tool-approval-response') answered.add(part.approvalId)
    }
  }
  return requests
    .filter((r) => !answered.has(r.approvalId))
    .flatMap((r) => {
      const call = calls.get(r.toolCallId)
      return call ? [{ approvalId: r.approvalId, ...call }] : []
    })
}

// Ассистент продолжает, когда отвечены все запросы его шага
export async function answerApproval(chatId: string, approvalId: string, approved: boolean) {
  await saveMessages(chatId, [{ role: 'tool', content: [{ type: 'tool-approval-response', approvalId, approved }] }])
  const messages = await db.chatMessages.where('chatId').equals(chatId).sortBy('createdAt')
  if (pendingApprovals(messages).length === 0) void run(chatId)
}

// Название по первому сообщению; если не вышло — остаётся начало сообщения
async function nameChat(chatId: string, provider: Parameters<typeof languageModel>[0], model: string, first: ChatMessage) {
  const files = first.fileIds?.length ? (await db.chatFiles.bulkGet(first.fileIds)).flatMap((f) => (f ? [f.name] : [])) : []
  const prompt = [typeof first.message.content === 'string' ? first.message.content : '', ...files.map((name) => `[file: ${name}]`)].join('\n').trim()
  try {
    const { text } = await generateText({
      model: languageModel(provider, model),
      instructions: 'Write a title of 2-6 words for a chat that starts with the given message, in the language of the message. Reply with the title only, without quotes.',
      prompt,
      maxOutputTokens: 30,
    })
    const title = text.trim().replace(/^["«]|["»]$/g, '')
    if (title) await db.chats.update(chatId, { title })
  } catch {
    // Название не важно для работы чата
  }
}
