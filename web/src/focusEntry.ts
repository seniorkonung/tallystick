import { create } from 'zustand'
import { useThread } from './threadStore'

// Запись, подсвеченная после перехода к ней
export const useHighlight = create<{ id: string | null }>(() => ({ id: null }))

// Прокрутить ленту к записи и подсветить её; если запись скрыта фильтром — открыть её ответы
export function focusEntry(id: string) {
  const el = document.getElementById(`entry-${id}`)
  if (!el) return useThread.getState().open(id)
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  useHighlight.setState({ id })
  setTimeout(() => {
    if (useHighlight.getState().id === id) useHighlight.setState({ id: null })
  }, 1600)
}
