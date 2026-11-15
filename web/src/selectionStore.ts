import { create } from 'zustand'

// Выделенные записи ленты; пока выделение не пусто, тап по записи переключает её выделение
export const useSelection = create<{ ids: string[] }>(() => ({ ids: [] }))

export function toggleSelected(id: string) {
  useSelection.setState((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id] }))
}

export function clearSelection() {
  useSelection.setState({ ids: [] })
}
