import { useRef, useState, type ReactNode } from 'react'

// Касание, которое уже взяла вложенная страница: внешняя его не трогает
const claimed = new WeakSet<Event>()

// Страница поверх ленты закрывается жестом вправо, как чат в Телеграме: едет за пальцем, а отпущенная уезжает
// и закрывается, если её сдвинули больше чем на треть ширины или быстро смахнули, иначе возвращается на место.
// Жест берётся, только если движение горизонтальное, поэтому прокрутке он не мешает
export function SwipePage({ onClose, className, children }: { onClose: () => void; className: string; children: ReactNode }) {
  const gesture = useRef<{ x: number; y: number; dragging: boolean; dx: number; time: number; velocity: number } | null>(null)
  // После жеста браузер присылает клик — он не должен нажать кнопку на странице
  const swallow = useRef(false)
  const [offset, setOffset] = useState(0)
  // Отпущенная страница доезжает анимацией; новый жест в это время не начинается
  const [settling, setSettling] = useState(false)

  function finish(commit: boolean, width: number) {
    const g = gesture.current
    gesture.current = null
    if (!g?.dragging) return
    swallow.current = true
    const close = commit && (g.dx > width / 3 || g.velocity > 0.5)
    setSettling(true)
    setOffset(close ? width : 0)
    setTimeout(() => {
      setSettling(false)
      if (close) onClose()
    }, 200)
  }

  return (
    <div
      // Горизонтальные движения достаются жесту, вертикальные — прокрутке страницы
      className={`fixed inset-0 mx-auto flex max-w-xl touch-pan-y flex-col bg-stone-50 [&_.overflow-y-auto]:touch-pan-y ${settling ? 'transition-transform duration-200 ease-out' : ''} ${className}`}
      style={offset ? { transform: `translateX(${offset}px)`, boxShadow: '-8px 0 24px rgb(0 0 0 / 0.12)' } : undefined}
      onPointerDown={(e) => {
        if (claimed.has(e.nativeEvent)) return
        claimed.add(e.nativeEvent)
        swallow.current = false
        // Жест только пальцем, не в поле ввода, где протяжка двигает курсор, и не в шторке или меню поверх страницы
        if (settling || e.pointerType !== 'touch') return
        const target = e.target as Element
        if (target.closest('input, textarea, select') || target.closest('.fixed') !== e.currentTarget) return
        gesture.current = { x: e.clientX, y: e.clientY, dragging: false, dx: 0, time: e.timeStamp, velocity: 0 }
      }}
      onPointerMove={(e) => {
        const g = gesture.current
        if (!g) return
        const dx = e.clientX - g.x
        const dy = e.clientY - g.y
        if (!g.dragging) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
          // Движение влево или по вертикали — не этот жест
          if (dx < 0 || Math.abs(dy) > Math.abs(dx)) {
            gesture.current = null
            return
          }
          g.dragging = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        const next = Math.max(0, dx)
        // Скорость последнего движения, пикселей в миллисекунду
        g.velocity = (next - g.dx) / Math.max(1, e.timeStamp - g.time)
        g.dx = next
        g.time = e.timeStamp
        setOffset(next)
      }}
      onPointerUp={(e) => finish(true, e.currentTarget.offsetWidth)}
      onPointerCancel={(e) => finish(false, e.currentTarget.offsetWidth)}
      onClickCapture={(e) => {
        if (!swallow.current) return
        swallow.current = false
        e.stopPropagation()
      }}
    >
      {/* Затемнение того, что открывается под уезжающей страницей */}
      {offset > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-full w-screen bg-black" style={{ opacity: 0.2 * (1 - offset / window.innerWidth) }} />
      )}
      {children}
    </div>
  )
}
