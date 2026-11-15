import { useRef, useState, type PointerEvent } from 'react'

// Насколько запись тянется влево и с какого сдвига она выделяется
const limit = 80
export const swipeThreshold = 56

// Запись тянется влево до предела; отпущенная за порогом — выделяется.
// Жест берётся, только если движение горизонтальное, поэтому прокрутке ленты он не мешает
export function useSwipeSelect(onSelect: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const offsetRef = useRef(0)
  // После жеста браузер может прислать клик — он не должен открывать меню записи
  const swallow = useRef(false)
  const [offset, setOffset] = useState(0)

  function move(next: number) {
    if (next <= -swipeThreshold !== offsetRef.current <= -swipeThreshold) navigator.vibrate?.(10)
    offsetRef.current = next
    setOffset(next)
  }

  function finish(commit: boolean) {
    if (dragging.current) {
      swallow.current = true
      if (commit && offsetRef.current <= -swipeThreshold) onSelect()
    }
    start.current = null
    dragging.current = false
    offsetRef.current = 0
    setOffset(0)
  }

  return {
    offset,
    // Был ли клик частью жеста; такой клик ничего не делает
    swallowClick() {
      const result = swallow.current
      swallow.current = false
      return result
    },
    handlers: {
      onPointerDown(e: PointerEvent) {
        // Жест только пальцем: мышью и пером протяжка выделяет текст
        if (e.pointerType !== 'touch') return
        start.current = { x: e.clientX, y: e.clientY }
        dragging.current = false
        swallow.current = false
      },
      onPointerMove(e: PointerEvent) {
        if (!start.current) return
        const dx = e.clientX - start.current.x
        const dy = e.clientY - start.current.y
        if (!dragging.current) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
          // Движение вправо или по вертикали — не этот жест
          if (dx > 0 || Math.abs(dy) > Math.abs(dx)) {
            start.current = null
            return
          }
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        move(Math.min(0, Math.max(dx, -limit)))
      },
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
    },
  }
}
