import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { create } from 'zustand'

// Боковая панель открыта или её вытягивают жестом: drag — на сколько пикселей
export const useSidebar = create<{ open: boolean; drag: number | null }>(() => ({ open: false, drag: null }))

// Ширина панели, как в её вёрстке: w-72, но не шире 85% экрана
export function sidebarWidth() {
  return Math.min(288, window.innerWidth * 0.85)
}

// Панель идёт за пальцем: из ленты вправо — выдвигается, на открытой панели влево — задвигается.
// Отпущенная, она доезжает туда, куда её сдвинули больше чем на треть ширины.
// Жест берётся, только если движение горизонтальное, поэтому прокрутке он не мешает
export function useSidebarSwipe(mode: 'open' | 'close', enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  // После жеста браузер присылает клик — он не должен закрыть панель или нажать пункт в ней
  const swallow = useRef(false)

  function finish(commit: boolean) {
    if (dragging.current) {
      swallow.current = true
      const drag = useSidebar.getState().drag ?? 0
      const third = sidebarWidth() / 3
      const open = mode === 'open' ? commit && drag > third : !commit || drag > third * 2
      useSidebar.setState({ open, drag: null })
    }
    start.current = null
    dragging.current = false
  }

  return {
    onPointerDown(e: PointerEvent) {
      swallow.current = false
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
        // Движение не в ту сторону или по вертикали — не этот жест
        if ((mode === 'open' ? dx < 0 : dx > 0) || Math.abs(dy) > Math.abs(dx)) {
          start.current = null
          return
        }
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      const width = sidebarWidth()
      useSidebar.setState({ drag: Math.min(Math.max(mode === 'open' ? dx : width + dx, 0), width) })
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onClickCapture(e: MouseEvent) {
      if (!swallow.current) return
      swallow.current = false
      e.stopPropagation()
    },
  }
}
