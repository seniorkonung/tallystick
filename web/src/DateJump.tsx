import { useState } from 'react'
import { useDateJump } from './dateJumpStore'

const rangeFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })

function toInput(time: number) {
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fromInput(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// Дни, которые сейчас на экране: с учётом фильтров или экрана ответов
function shownDays() {
  return [...document.querySelectorAll<HTMLElement>('section[data-day]')].map((el) => ({ el, day: Number(el.dataset.day) }))
}

export function DateJump() {
  const open = useDateJump((s) => s.open)
  if (!open) return null
  return <Sheet onClose={() => useDateJump.setState({ open: false })} />
}

function Sheet({ onClose }: { onClose: () => void }) {
  const [days] = useState(shownDays)
  const [value, setValue] = useState(() => (days.length ? toInput(days.at(-1)!.day) : ''))
  const first = days[0]?.day
  const last = days.at(-1)?.day

  // Прыжок к выбранному дню, а если в нём нет записей — к ближайшему следующему
  function jump() {
    if (!value) return
    const target = fromInput(value)
    const day = days.find((d) => d.day >= target) ?? days.at(-1)
    onClose()
    day?.el.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-xl flex-col justify-end bg-black/30" onClick={onClose}>
      <div
        className="rounded-t-3xl bg-white px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 font-semibold">Перейти к дате</h2>
        {first !== undefined && last !== undefined ? (
          <>
            <p className="mb-4 text-xs text-stone-500">
              Записи на экране: с {rangeFormat.format(first)} по {rangeFormat.format(last)}
            </p>
            <input
              type="date"
              value={value}
              min={toInput(first)}
              max={toInput(last)}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-2xl bg-stone-100 px-4 py-3 text-lg"
            />
            <button
              type="button"
              disabled={!value}
              className="mt-4 w-full rounded-2xl bg-stone-900 py-3 font-medium text-white disabled:bg-stone-200"
              onClick={jump}
            >
              Перейти
            </button>
          </>
        ) : (
          <p className="py-6 text-sm text-stone-400">На экране нет записей</p>
        )}
      </div>
    </div>
  )
}
