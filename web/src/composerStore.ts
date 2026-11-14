import { create } from 'zustand'
import type { Entry, FieldValues } from './db'

export type Draft = {
  typeId: string
  text: string
  values: FieldValues
  projectIds: string[]
}

type ComposerState = {
  draft: Draft
  // Запись, загруженная в панель ввода для редактирования
  editingEntryId: string | null
  // Черновик новой записи, отложенный на время редактирования
  stash: Draft | null
  // Запись, на которую отвечает новая запись
  replyToId: string | null
  update: (patch: Partial<Draft>) => void
  startEditing: (entry: Entry) => void
  stopEditing: () => void
  clearAfterSend: () => void
  startReply: (entryId: string) => void
  cancelReply: () => void
}

const typeStorageKey = 'tallystick.typeId'
const projectsStorageKey = 'tallystick.projectIds'

export const useComposer = create<ComposerState>((set, get) => ({
  draft: {
    typeId: localStorage.getItem(typeStorageKey) ?? '',
    text: '',
    values: {},
    projectIds: JSON.parse(localStorage.getItem(projectsStorageKey) ?? '[]'),
  },
  editingEntryId: null,
  stash: null,
  replyToId: null,

  // Тип и проекты новой записи сохраняются для следующей; при редактировании — нет
  update: (patch) => {
    if (!get().editingEntryId) {
      if (patch.typeId !== undefined) localStorage.setItem(typeStorageKey, patch.typeId)
      if (patch.projectIds !== undefined) localStorage.setItem(projectsStorageKey, JSON.stringify(patch.projectIds))
    }
    set((s) => ({ draft: { ...s.draft, ...patch } }))
  },

  startEditing: (entry) =>
    set((s) => ({
      replyToId: null,
      editingEntryId: entry.id,
      stash: s.stash ?? s.draft,
      draft: { typeId: entry.typeId, text: entry.text, values: entry.values, projectIds: entry.projectIds },
    })),

  stopEditing: () =>
    set((s) => ({ editingEntryId: null, stash: null, draft: s.stash ?? s.draft })),

  clearAfterSend: () => set((s) => ({ draft: { ...s.draft, text: '', values: {} }, replyToId: null })),

  // Ответ пишется в черновик новой записи: начатое редактирование отменяется
  startReply: (entryId) =>
    set((s) => ({ editingEntryId: null, stash: null, draft: s.stash ?? s.draft, replyToId: entryId })),

  cancelReply: () => set({ replyToId: null }),
}))
