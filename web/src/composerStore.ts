import { create } from 'zustand'
import type { Attachment, Entry, FieldValues, PreparedFile } from './db'

// Вложение в черновике: уже сохранённое у записи или новое
export type DraftAttachment = { key: string; existingId: string | null; file: PreparedFile }

export type Draft = {
  typeId: string
  text: string
  values: FieldValues
  tagIds: string[]
  attachments: DraftAttachment[]
}

type ComposerState = {
  draft: Draft
  // Запись, загруженная в панель ввода для редактирования
  editingEntryId: string | null
  // Черновик новой записи, отложенный на время редактирования
  stash: Draft | null
  // Запись, на которую отвечает новая запись
  replyToId: string | null
  // Чат, из которого в новую запись перенесён ответ ассистента
  fromChatId: string | null
  update: (patch: Partial<Draft>) => void
  startEditing: (entry: Entry, attachments: Attachment[]) => void
  stopEditing: () => void
  clearAfterSend: () => void
  startReply: (entryId: string) => void
  cancelReply: () => void
  startFromChat: (chatId: string, text: string) => void
  cancelFromChat: () => void
}

const typeStorageKey = 'tallystick.typeId'

export const useComposer = create<ComposerState>((set, get) => ({
  draft: {
    typeId: localStorage.getItem(typeStorageKey) ?? '',
    text: '',
    values: {},
    tagIds: [],
    attachments: [],
  },
  editingEntryId: null,
  stash: null,
  replyToId: null,
  fromChatId: null,

  // Тип новой записи сохраняется для следующей; при редактировании — нет
  update: (patch) => {
    if (!get().editingEntryId) {
      if (patch.typeId !== undefined) localStorage.setItem(typeStorageKey, patch.typeId)
    }
    set((s) => ({ draft: { ...s.draft, ...patch } }))
  },

  startEditing: (entry, attachments) =>
    set((s) => ({
      replyToId: null,
      fromChatId: null,
      editingEntryId: entry.id,
      stash: s.stash ?? s.draft,
      draft: {
        typeId: entry.typeId,
        text: entry.text,
        values: entry.values,
        tagIds: entry.tagIds,
        attachments: attachments.map((a) => ({ key: a.id, existingId: a.id, file: a })),
      },
    })),

  stopEditing: () =>
    set((s) => ({ editingEntryId: null, stash: null, draft: s.stash ?? s.draft })),

  // Теги выбираются для каждой записи заново
  clearAfterSend: () => set((s) => ({ draft: { ...s.draft, text: '', values: {}, tagIds: [], attachments: [] }, replyToId: null, fromChatId: null })),

  // Ответ пишется в черновик новой записи: начатое редактирование отменяется
  startReply: (entryId) =>
    set((s) => ({ editingEntryId: null, stash: null, draft: s.stash ?? s.draft, replyToId: entryId })),

  cancelReply: () => set({ replyToId: null }),

  // Как и ответ, пишется в черновик новой записи
  startFromChat: (chatId, text) =>
    set((s) => ({
      editingEntryId: null,
      stash: null,
      replyToId: null,
      fromChatId: chatId,
      draft: { ...(s.stash ?? s.draft), text, values: {}, attachments: [] },
    })),

  cancelFromChat: () => set({ fromChatId: null }),
}))
