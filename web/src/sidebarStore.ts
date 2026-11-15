import { useRef, type PointerEvent } from 'react'
import { create } from 'zustand'

// Боковая панель открыта или её вытягивают жестом: drag — на сколько пикселей
export const useSidebar = create<{ open: boolean; drag: number | null }>(() => ({ open: false, drag: null }))

// Ширина панели, как в её вёрстке: w-72, но не шире 85% экрана
export function sidebarWidth() {
  return Math.min(288, window.innerWidth * 0.85)
}

// Ведение пальцем вправо вытягивает панель вслед за ним; отпущенная дальше трети ширины — открывается.
// Жест берётся, только если движение горизонтальное, поэтому прокрутке ленты он не мешает
export function useSidebarSwipe(enabled: boolean) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)

  function finish(commit: boolean) {
    if (dragging.current) {
      const drag = useSidebar.getState().drag ?? 0
      useSidebar.setState({ open: commit && drag > sidebarWidth() / 3, drag: null })
    }
    start.current = null
    dragging.current = false
  }

  return {
    onPointerDown(e: PointerEvent) {
      // Жест только пальцем: мышью и пером протяжка выделяет текст
      if (!enabled || e.pointerType !== 'touch') return
      start.current = { x: e.clientX, y: e.clientY }
      dragging.current = false
    },
    onPointerMove(e: PointerEvent) {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      if (!dragging.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // Движение влево или по вертикали — не этот жест
        if (dx < 0 || Math.abs(dy) > Math.abs(dx)) {
          start.current = null
          return
        }
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      useSidebar.setState({ drag: Math.min(Math.max(dx, 0), sidebarWidth()) })
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
  }
}
