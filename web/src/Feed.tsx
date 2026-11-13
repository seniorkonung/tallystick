import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Entry } from './db'

const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const dayWithYearFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function dayKey(time: number) {
  const d = new Date(time)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(time: number) {
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  if (dayKey(time) === dayKey(now.getTime())) return `Сегодня, ${dayFormat.format(time)}`
  if (dayKey(time) === dayKey(yesterday)) return `Вчера, ${dayFormat.format(time)}`
  return new Date(time).getFullYear() === now.getFullYear() ? dayFormat.format(time) : dayWithYearFormat.format(time)
}

export function Feed() {
  const entries = useLiveQuery(() => db.entries.orderBy('createdAt').toArray())
  const types = useLiveQuery(() => db.types.toArray())
  if (!entries || !types) return <div className="flex-1" />

  const typeNames = new Map(types.map((t) => [t.id, t.name]))
  const days: { key: string; time: number; entries: Entry[] }[] = []
  for (const entry of entries) {
    const key = dayKey(entry.createdAt)
    const last = days.at(-1)
    if (last?.key === key) last.entries.push(entry)
    else days.push({ key, time: entry.createdAt, entries: [entry] })
  }

  return (
    // column-reverse держит прокрутку у нижнего края, как в мессенджере
    <div className="flex flex-1 flex-col-reverse overflow-y-auto">
      <div className="flex flex-col gap-2 px-3 py-4">
        {entries.length === 0 && <p className="py-10 text-center text-sm text-stone-400">Записей пока нет</p>}
        {days.map((day) => (
          <section key={day.key} className="flex flex-col gap-2">
            <h2 className="py-2 text-center text-xs font-medium text-stone-400">{dayLabel(day.time)}</h2>
            {day.entries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
                  <span>{typeNames.get(entry.typeId)}</span>
                  <span>{timeFormat.format(entry.createdAt)}</span>
                </div>
                <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-stone-900">{entry.text}</p>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
