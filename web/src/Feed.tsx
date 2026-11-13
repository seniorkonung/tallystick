import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db, isEmptyValue, type Entry, type EntryType } from './db'
import { formatValue } from './fields'

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
  const scroller = useRef<HTMLDivElement>(null)
  const lastId = entries?.at(-1)?.id
  const prevLastId = useRef(lastId)

  // Записи добавляются только в конец ленты: новая последняя запись — только что созданная
  useEffect(() => {
    if (prevLastId.current !== undefined && lastId !== prevLastId.current) {
      // В column-reverse нулевая прокрутка — самый низ
      scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevLastId.current = lastId
  }, [lastId])

  if (!entries || !types) return <div className="flex-1" />

  const typesById = new Map(types.map((t) => [t.id, t]))
  const days: { key: string; time: number; entries: Entry[] }[] = []
  for (const entry of entries) {
    const key = dayKey(entry.createdAt)
    const last = days.at(-1)
    if (last?.key === key) last.entries.push(entry)
    else days.push({ key, time: entry.createdAt, entries: [entry] })
  }

  return (
    // column-reverse держит прокрутку у нижнего края, как в мессенджере
    <div ref={scroller} className="flex flex-1 flex-col-reverse overflow-y-auto overscroll-y-contain">
      <div className="flex flex-col gap-2 px-3 pt-4 pb-[calc(var(--composer-height,0px)+0.5rem)]">
        {entries.length === 0 && <p className="py-10 text-center text-sm text-stone-400">Записей пока нет</p>}
        {days.map((day) => (
          <section key={day.key} className="flex flex-col gap-2">
            <h2 className="py-2 text-center text-xs font-medium text-stone-400">{dayLabel(day.time)}</h2>
            {day.entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} type={typesById.get(entry.typeId)} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

function EntryCard({ entry, type }: { entry: Entry; type: EntryType | undefined }) {
  const fields = type?.fields.filter((f) => !isEmptyValue(entry.values[f.id])) ?? []
  return (
    <article className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
        <span>{type?.name}</span>
        <span>{timeFormat.format(entry.createdAt)}</span>
      </div>
      {entry.text && (
        <p className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap text-stone-900">{entry.text}</p>
      )}
      {fields.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1 text-sm">
          {fields.map((field) => {
            const labels = formatValue(field, entry.values[field.id])
            return (
              <div key={field.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <dt className="text-stone-500">{field.name}</dt>
                {field.kind === 'multi' ? (
                  labels.map((label, i) => (
                    <dd key={i} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-800">
                      {label}
                    </dd>
                  ))
                ) : (
                  <dd className="text-stone-900">{labels[0]}</dd>
                )}
              </div>
            )
          })}
        </dl>
      )}
    </article>
  )
}
