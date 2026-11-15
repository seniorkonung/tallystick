import { APICallError, RetryError, generateText, isStepCount, streamText, type ModelMessage } from 'ai'
import { create } from 'zustand'
import { activeToolsFor, approvalFor, readTools, writeTools } from './assistantTools'
import { fileForModel } from './modelFiles'
import { db, type Chat, type ChatFile, type ChatMessage, type Permission, type PreparedFile } from './db'
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

function setRun(chatId: string, patch: Partial<Run>) {
  useRuns.setState((s) => ({ [chatId]: { ...(s[chatId] ?? { items: [], running: false, error: null }), ...patch } }))
}

function instructions(permission: Permission) {
  const now = new Date()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = now.toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `You are the assistant inside Tallystick, the user's personal feed app. The feed holds everything the user records: thoughts, meals, workouts, project notes.

Domain:
- Entry: a feed item with text, attachments, field values of its type, projects, an optional reply-to entry, and actuality (actual or no longer actual). Its creation time is fixed.
- Type: a user-defined kind of entry with an ordered list of fields (single choice, multiple choice, number with optional unit, string).
- Project: a goal or direction with a start and an end, active or completed; an entry can belong to several projects.

Use the tools to look at the user's data instead of guessing. Fetch types or projects first when you need their ids. Page through results when the total exceeds the page.

${
    permission === 'read'
      ? "This chat is read-only: you cannot change data. If the user asks for a change, tell them to switch the chat's permission mode."
      : 'Changes may need the user\'s approval in the app. When a tool execution is not approved, do not retry it. Entries you create are marked as coming from this chat.'
  }

Current local time: ${date} (${zone}). Entry times are in this zone.

Reply in the user's language, concisely, using Markdown.`
}

function errorText(error: unknown): string {
  if (RetryError.isInstance(error)) return errorText(error.lastError)
  if (APICallError.isInstance(error)) return `${error.statusCode ?? ''} ${error.responseBody?.slice(0, 300) ?? error.message}`.trim()
  return error instanceof Error ? error.message : String(error)
}

async function saveMessages(chatId: string, messages: ModelMessage[]) {
  const now = Date.now()
  await db.transaction('rw', db.chatMessages, db.chats, async () => {
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
) {
  localStorage.setItem(lastModelKey, JSON.stringify({ providerId, model }))
  let id = chatId
  if (id === 'new') {
    const chat: Chat = { id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), title: (text || files[0]?.name || 'Чат').slice(0, 60), providerId, model, permission }
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
    await db.chatMessages.add({ id: messageId, chatId: id, createdAt: now, message: { role: 'user', content: text }, fileIds: chatFiles.map((f) => f.id) })
    await db.chats.update(id, { updatedAt: now })
  })
  void run(id)
  return id
}

export function stop(chatId: string) {
  controllers.get(chatId)?.abort()
}

export async function run(chatId: string) {
  const chat = await db.chats.get(chatId)
  const provider = chat?.providerId ? await db.providers.get(chat.providerId) : undefined
  if (!chat || !provider || !chat.model) return setRun(chatId, { error: 'Провайдер чата не найден — выберите модель', running: false })

  const stored = await db.chatMessages.where('chatId').equals(chatId).sortBy('createdAt')
  const files = new Map((await db.chatFiles.where('chatId').equals(chatId).toArray()).map((f) => [f.id, f]))
  const history = await Promise.all(stored.map((m) => withFiles(m, files)))
  const controller = new AbortController()
  controllers.set(chatId, controller)
  setRun(chatId, { items: [], running: true, error: null })

  const items: RunItem[] = []
  const show = () => setRun(chatId, { items: [...items] })
  let aborted = false
  try {
    const result = streamText({
      model: languageModel(provider, chat.model),
      instructions: instructions(chat.permission),
      messages: history,
      tools: { ...readTools, ...writeTools(chatId) },
      activeTools: activeToolsFor(chat.permission, provider.kind),
      toolApproval: approvalFor(chat.permission),
      stopWhen: isStepCount(20),
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
  controllers.delete(chatId)
  setRun(chatId, { items: [], running: false, error: null })
}

async function withFiles(m: ChatMessage, files: Map<string, ChatFile>): Promise<ModelMessage> {
  if (m.message.role !== 'user' || !m.fileIds?.length) return m.message
  const text = typeof m.message.content === 'string' ? m.message.content : ''
  const parts = await Promise.all(m.fileIds.flatMap((id) => files.get(id) ?? []).map(fileForModel))
  return { role: 'user', content: [...(text ? [{ type: 'text' as const, text }] : []), ...parts] }
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
