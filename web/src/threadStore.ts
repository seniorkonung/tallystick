import { create } from 'zustand'

type ThreadState = {
  // Стек открытых экранов ответов: последний — текущий
  stack: string[]
  open: (entryId: string) => void
  back: () => void
}

// Каждый уровень ответов — шаг истории, чтобы системное «назад» возвращало на уровень выше
export const useThread = create<ThreadState>((set) => ({
  stack: [],
  open: (entryId) => {
    history.pushState({ thread: entryId }, '')
    set((s) => ({ stack: [...s.stack, entryId] }))
  },
  back: () => history.back(),
}))

window.addEventListener('popstate', () => {
  useThread.setState((s) => ({ stack: s.stack.slice(0, -1) }))
})
