import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { EntryMenu } from './EntryMenu'
import { useComposer } from './composerStore'
import { ProjectChip } from './ProjectChip'
import { db, isEmptyValue, type Entry, type EntryType, type Mark, type Project } from './db'
import { formatValue } from './fields'
import { pluralRu } from './plural'

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
  const projects = useLiveQuery(() => db.projects.toArray())
  const marks = useLiveQuery(() => db.marks.toArray())
  const scroller = useRef<HTMLDivElement>(null)
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)
  const editingEntryId = useComposer((s) => s.editingEntryId)
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

  if (!entries || !types || !projects || !marks) return <div className="flex-1" />

  const typesById = new Map(types.map((t) => [t.id, t]))
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  // Записи и служебные отметки в одной хронологии; при равном времени отметка идёт раньше
  const items: Item[] = [
    ...marks.map((mark): Item => ({ kind: 'mark', mark, time: mark.createdAt })),
    ...entries.map((entry): Item => ({ kind: 'entry', entry, time: entry.createdAt })),
  ].sort((a, b) => a.time - b.time)
  const days: { key: string; time: number; items: Item[] }[] = []
  for (const item of items) {
    const key = dayKey(item.time)
    const last = days.at(-1)
    if (last?.key === key) last.items.push(item)
    else days.push({ key, time: item.time, items: [item] })
  }

  const menuEntry = entries.find((e) => e.id === menuEntryId)

  return (
    // column-reverse держит прокрутку у нижнего края, как в мессенджере
    <div ref={scroller} className="flex flex-1 flex-col-reverse overflow-y-auto overscroll-y-contain">
      <div className="flex flex-col gap-2 px-3 pt-4 pb-[calc(var(--composer-height,0px)+0.5rem)]">
        {entries.length === 0 && <p className="py-10 text-center text-sm text-stone-400">Записей пока нет</p>}
        {days.map((day) => (
          <section key={day.key} className="flex flex-col gap-2">
            <h2 className="py-2 text-center text-xs font-medium text-stone-400">{dayLabel(day.time)}</h2>
            {day.items.map((item) =>
              item.kind === 'entry' ? (
                <EntryCard
                  key={item.entry.id}
                  entry={item.entry}
                  type={typesById.get(item.entry.typeId)}
                  projects={item.entry.projectIds.flatMap((id) => projectsById.get(id) ?? [])}
                  editing={item.entry.id === editingEntryId}
                  onOpen={() => setMenuEntryId(item.entry.id)}
                />
              ) : (
                <MarkLine key={item.mark.id} mark={item.mark} project={projectsById.get(item.mark.projectId)} />
              ),
            )}
          </section>
        ))}
      </div>
      {menuEntry && <EntryMenu entry={menuEntry} onClose={() => setMenuEntryId(null)} />}
    </div>
  )
}

type Item = { kind: 'entry'; entry: Entry; time: number } | { kind: 'mark'; mark: Mark; time: number }

function MarkLine({ mark, project }: { mark: Mark; project: Project | undefined }) {
  const name = `«${project?.name ?? 'Проект'}»`
  let text: string
  switch (mark.kind) {
    case 'started':
      text = `${name} начат`
      break
    case 'completed':
      text = `${name} завершён · ${mark.entryCount ?? 0} ${pluralRu(mark.entryCount ?? 0, ['запись', 'записи', 'записей'])}`
      break
    case 'reopened':
      text = `${name} снова в работе`
      break
  }
  return (
    <p className="py-1 text-center text-xs text-stone-400">
      {text} · {timeFormat.format(mark.createdAt)}
    </p>
  )
}

type EntryCardProps = {
  entry: Entry
  type: EntryType | undefined
  projects: Project[]
  // Запись загружена в панель ввода — карточка подсвечена
  editing: boolean
  onOpen: () => void
}

function EntryCard({ entry, type, projects, editing, onOpen }: EntryCardProps) {
  const fields = type?.fields.filter((f) => !isEmptyValue(entry.values[f.id])) ?? []
  return (
    <article
      onClick={onOpen}
      className={`cursor-pointer rounded-2xl border px-4 py-3 ${entry.actual ? 'bg-white' : 'bg-[#F3F1EA]'} ${
        editing ? 'border-orange-400 ring-2 ring-orange-200' : 'border-stone-200'
      }`}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
        <span>
          {type?.name}
          {!entry.actual && <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-stone-600">Неактуально</span>}
        </span>
        <span>{timeFormat.format(entry.createdAt)}</span>
      </div>
      <div className={entry.actual ? '' : 'opacity-55'}>
        {projects.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {projects.map((project) => (
              <ProjectChip key={project.id} project={project} />
            ))}
          </div>
        )}
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
      </div>
    </article>
  )
}
